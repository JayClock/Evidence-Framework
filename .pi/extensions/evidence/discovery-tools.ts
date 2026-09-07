import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { contractViewLines, questionLabel } from './discovery-contract-view.ts';
import {
  DiscoveryContentSchema,
  QuestionSchema,
  type DiscoveryAnswer,
  type DiscoveryQuestion,
  type DiscoverySnapshot,
} from './discovery-schema.ts';
import {
  answerQuestion,
  askQuestions,
  assertConsolidated,
  assertDiscoveryRevision,
  digestText,
  finalizeDiscovery,
  latestAnswer,
  loadDiscovery,
  persistDiscovery,
  saveDiscoveryContent,
  pendingQuestions,
  unresolvedBlockingQuestions,
  withModelingLock,
} from './discovery.ts';
import { loadConfig, loadState } from './storage.ts';
import { recordGateDecision } from './gates.ts';
import { normalizeFmModelFiles, replaceFmModel } from './modeling.ts';
import type { EvidenceState } from './types.ts';
import {
  changeDiscoveryInteraction,
  finishDiscoveryInteraction,
  FINISH_DISCOVERY,
  SKIP_QUESTION,
  type StartDiscoveryWork,
  type RefreshDiscovery as Refresh,
} from './discovery-interaction.ts';

const revision = Type.Integer({
  minimum: 0,
  description:
    'Exact revision from the current discovery snapshot; stale writes are rejected.',
});
export const DISCOVERY_TOOL_NAMES = [
  'read',
  'bash',
  'evidence_ask_questions',
  'evidence_save_discovery',
  'evidence_check_model_draft',
  'evidence_finalize_discovery',
];

const answerModes = new Map<string, DiscoveryAnswer['status']>([
  ['事实或决定', 'answered'],
  ['未知，仍需澄清', 'unknown'],
  ['移出本次范围（回答中说明原因）', 'excluded'],
]);

async function runningState(
  root: string,
  expectedRevision: number,
): Promise<EvidenceState> {
  const state = await loadState(root);
  if (!state || state.status !== 'running')
    throw new Error('需要正在执行的 Modeling 任务');
  assertDiscoveryRevision(state, expectedRevision);
  return state;
}

function result(text: string, state: EvidenceState, terminate = false) {
  return {
    content: [{ type: 'text' as const, text }],
    details: { revision: state.discovery.revision, path: state.discovery.path },
    terminate,
  };
}

async function githubRespondent(
  pi: ExtensionAPI,
  cwd: string,
): Promise<string | undefined> {
  try {
    const response = await pi.exec(
      'gh',
      ['api', '--hostname', 'github.com', 'user'],
      { cwd, timeout: 10000 },
    );
    if (response.code !== 0 || response.killed) return;
    const user: unknown = JSON.parse(response.stdout);
    if (
      user &&
      typeof user === 'object' &&
      'login' in user &&
      typeof user.login === 'string' &&
      /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(user.login)
    ) {
      return `github.com/${user.login}`;
    }
  } catch {
    // Missing gh or invalid responses must not fall back to an invented identity.
    // Do not expose raw CLI output, which may contain credential diagnostics.
  }
  return undefined;
}

async function selectDiscoveryAction(
  ctx: ExtensionContext,
  snapshot: DiscoverySnapshot,
  selectedId: string,
  state: EvidenceState,
  signal: AbortSignal,
): Promise<
  | { kind: 'finish' }
  | { kind: 'question'; question: DiscoveryQuestion; mode: string }
  | undefined
> {
  const discovering = state.discovery.stage === 'discovering';
  const active = pendingQuestions(snapshot)[0];
  if (!selectedId && discovering && !snapshot.interaction.stopped && active) {
    const action = await ctx.ui.select(
      contractViewLines(snapshot, { questionId: active.id }).join('\n'),
      ['回答', FINISH_DISCOVERY],
      { signal },
    );
    if (action === FINISH_DISCOVERY) return { kind: 'finish' };
    return action === '回答'
      ? { kind: 'question', question: active, mode: '事实或决定' }
      : undefined;
  }
  const view = contractViewLines(snapshot).join('\n');
  const pending = pendingQuestions(snapshot);
  // Current question first; history is for voluntary context switching/corrections, not a checklist.
  const choices = [
    ...pending,
    ...snapshot.questions.filter((q) => !pending.some((p) => p.id === q.id)),
  ];
  const back = '返回场景选择';
  while (true) {
    const selected =
      selectedId ||
      (await ctx.ui.select(
        `选择合同／履约问题（历史问题可更正）\n${view}`,
        [
          ...choices.map((q) => questionLabel(snapshot, q.id)),
          ...(discovering ? [FINISH_DISCOVERY] : []),
        ],
        { signal },
      ));
    selectedId = '';
    if (discovering && selected === FINISH_DISCOVERY) return { kind: 'finish' };
    const question = snapshot.questions.find(
      (q) => q.id === selected?.split(' ')[0],
    );
    if (!question) return;
    const mode = await ctx.ui.select(
      `${contractViewLines(snapshot, { questionId: question.id }).join('\n')}\n如何处理这个问题？`,
      [...answerModes.keys(), ...(discovering ? [SKIP_QUESTION] : []), back],
      { signal },
    );
    if (mode === back) continue;
    if (!mode) return;
    return { kind: 'question', question, mode };
  }
}

async function collectIdleAnswer(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  refresh: Refresh,
  selectedId: string,
  startWork: StartDiscoveryWork,
  signal: AbortSignal,
  expected?: EvidenceState,
): Promise<void> {
  if (!ctx.isIdle() || signal.aborted) return;
  const state = await loadState(ctx.cwd);
  if (
    !state ||
    state.phase !== 'modeling' ||
    state.paused ||
    state.status === 'running'
  ) {
    ctx.ui.notify(
      '请在 Modeling 就绪、等待回答或等待审核时回答；下游须先回退。',
      'warning',
    );
    return;
  }
  if (!ctx.hasUI) {
    ctx.ui.notify('回答需要人工编辑器。', 'warning');
    return;
  }
  if (
    expected &&
    (state.runId !== expected.runId ||
      state.discovery.revision !== expected.discovery.revision ||
      state.status !== 'waiting_answer')
  )
    return;
  const snapshot = await loadDiscovery(ctx.cwd, state);
  if (
    expected &&
    (snapshot.interaction.stopped || !pendingQuestions(snapshot).length)
  )
    return;
  const assertCurrent = async () => {
    signal.throwIfAborted();
    const current = await loadState(ctx.cwd);
    if (!current || current.runId !== state.runId)
      throw new Error('运行已改变，请重新回答');
    assertDiscoveryRevision(current, state.discovery.revision);
    if (
      !ctx.isIdle() ||
      current.paused ||
      current.phase !== 'modeling' ||
      current.status === 'running'
    )
      throw new Error('任务状态已改变，请稍后重新回答');
    return current;
  };
  await assertCurrent();
  const action = await selectDiscoveryAction(
    ctx,
    snapshot,
    selectedId,
    state,
    signal,
  );
  if (!action || signal.aborted) return;
  await assertCurrent();
  if (action.kind === 'finish') {
    await finishDiscoveryInteraction(ctx, refresh, startWork, state, signal);
    return;
  }
  const { question, mode } = action;
  if (mode === SKIP_QUESTION) {
    const saved = await changeDiscoveryInteraction(ctx, refresh, {
      action: 'skip',
      expected: state,
      questionId: question.id,
      signal,
    });
    if (
      saved &&
      !signal.aborted &&
      !(await loadDiscovery(ctx.cwd, saved)).interaction.stopped
    )
      await startWork(ctx, saved);
    return;
  }
  const status = answerModes.get(mode);
  if (!status) return;
  const respondent = await githubRespondent(pi, ctx.cwd);
  if (!respondent) {
    ctx.ui.notify(
      '无法读取当前 GitHub 账号，未保存回答。请确认已安装 gh、网络可用，并运行 gh auth login --hostname github.com 后重试。',
      'warning',
    );
    return;
  }
  if (signal.aborted) return;
  await assertCurrent();
  const previous = latestAnswer(snapshot, question.id);
  const text = await ctx.ui.editor(
    `${contractViewLines(snapshot, { questionId: question.id }).join('\n')}\n回答者：${respondent}（自动记录）`,
    previous?.text ?? '',
  );
  if (text === undefined || !text.trim() || signal.aborted) return;
  const saved = await withModelingLock(ctx.cwd, async () => {
    const current = await assertCurrent();
    const previousGate = current.pendingGate;
    await answerQuestion(ctx.cwd, current, {
      questionId: question.id,
      text,
      respondent,
      status,
    });
    if (previousGate)
      await recordGateDecision(
        ctx.cwd,
        previousGate,
        'cancelled',
        '人工回答或更正使当前定稿失效',
      );
    await refresh(ctx, current);
    ctx.ui.setEditorText('/evidence-run');
    ctx.ui.notify(
      '原文已保存；旧回答保留。先消化回答并更新候选，再决定下一问。',
      'info',
    );
    return current;
  });
  // Start outside the mutation lock; a stopped round remains under manual control.
  if (
    !signal.aborted &&
    !(await loadDiscovery(ctx.cwd, saved)).interaction.stopped
  )
    await startWork(ctx, saved);
}

export function registerDiscoveryTools(
  pi: ExtensionAPI,
  refresh: Refresh,
  startWork: StartDiscoveryWork,
) {
  // UI ownership is session-local, not workflow evidence. Esc consumes this offer only.
  let dialog: AbortController | undefined;
  let pendingOffer: { root: string; state: EvidenceState } | undefined;
  let closed = false;
  const showAnswer = async (
    ctx: ExtensionContext,
    selectedId = '',
    expected?: EvidenceState,
  ) => {
    if (closed || dialog || !ctx.isIdle() || !ctx.hasUI) return;
    const controller = new AbortController();
    dialog = controller;
    try {
      await collectIdleAnswer(
        pi,
        ctx,
        refresh,
        selectedId,
        startWork,
        controller.signal,
        expected,
      );
    } finally {
      dialog = undefined;
    }
  };
  const collectAnswer = async (
    ctx: ExtensionCommandContext,
    selectedId = '',
  ) => {
    await ctx.waitForIdle();
    // Manual entry supersedes any not-yet-displayed automatic offer.
    pendingOffer = undefined;
    await showAnswer(ctx, selectedId);
  };
  const offerQuestion = async (ctx: ExtensionContext) => {
    const offer = pendingOffer;
    if (!offer || closed || dialog || !ctx.hasUI || !ctx.isIdle()) return;
    pendingOffer = undefined;
    if (offer.root !== ctx.cwd) return;
    try {
      await showAnswer(ctx, '', offer.state);
    } catch (error) {
      if (!closed)
        ctx.ui.notify(
          `问答入口未完成：${(error as Error).message}。可用 /evidence-answer 重试。`,
          'warning',
        );
    }
  };
  pi.on('session_shutdown', () => {
    closed = true;
    pendingOffer = undefined;
    dialog?.abort();
  });
  pi.registerCommand('evidence-answer', {
    description:
      '回答当前发现问题；可传 Q-ID 更正历史回答，保留原文并使旧定稿失效',
    handler: (args, ctx) => collectAnswer(ctx, args.trim()),
  });
  pi.registerCommand('evidence-discovery', {
    description:
      'finish：结束问答并整理已有信息；resume：恢复问答和暂缓问题（均不批准定稿）',
    handler: async (args, ctx) => {
      await ctx.waitForIdle();
      if (args.trim() === 'finish')
        await finishDiscoveryInteraction(ctx, refresh, startWork);
      else if (args.trim() === 'resume')
        await changeDiscoveryInteraction(ctx, refresh, { action: 'resume' });
      else
        ctx.ui.notify(
          '用法：/evidence-discovery finish 或 /evidence-discovery resume',
          'info',
        );
    },
  });
  pi.registerTool({
    name: 'evidence_ask_questions',
    label: '业务发现提问',
    description:
      'Ask exactly ONE core business question based on the latest saved understanding. First consume each human answer/skip and save the updated discovery; briefly explain what changed and what remains unknown. Do not bundle subquestions, precompute a questionnaire, re-ask facts already provided, or repeat deferred gaps under a new ID. An unchanged historical unanswered question may be selected by its existing Q-ID. Persist and stop in waiting_answer; never answer for the human. Modeling only.',
    parameters: Type.Object({
      expectedRevision: revision,
      questions: Type.Array(QuestionSchema, { minItems: 1, maxItems: 1 }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      return withModelingLock(ctx.cwd, async () => {
        const state = await runningState(ctx.cwd, params.expectedRevision);
        await askQuestions(ctx.cwd, state, params.questions);
        await refresh(ctx, state);
        if (ctx.hasUI)
          pendingOffer = { root: ctx.cwd, state: structuredClone(state) };
        return result(
          `${contractViewLines(await loadDiscovery(ctx.cwd, state)).join('\n')}\n\n${ctx.hasUI ? '本次生成结束后将自动打开「回答／结束本轮」菜单。Esc 仅关闭菜单，可用 /evidence-answer 重新打开。' : '请在交互模式中运行 /evidence-answer 回答。'} 未知、排除、跳过或历史更正可用 /evidence-answer Q-ID。`,
          state,
          true,
        );
      });
    },
  });
  pi.registerTool({
    name: 'evidence_save_discovery',
    label: '保存业务发现',
    description:
      'Save the complete discovery checkpoint: candidate contexts and relationships, applicable obligations or domain rules, evidence/lineage, replay and gaps. Scope is an outcome, not an entry questionnaire; distinguish unexplored items from confirmed exclusions. Use INPUT, SRC-* or latest A-* sources. Candidates are not approved FM facts. Always provide contractView with current (null if unlocated) and sourced contract/role/fulfillment candidate references; unknown parties or request/deadline/confirmation remain null. Do not invent contracts for domain/channel discovery. Invalidates drafts and finalization; stopping after saving is valid.',
    parameters: Type.Object({
      expectedRevision: revision,
      content: DiscoveryContentSchema,
    }),
    async execute(_id, params, _signal, _update, ctx) {
      return withModelingLock(ctx.cwd, async () => {
        const state = await runningState(ctx.cwd, params.expectedRevision);
        await saveDiscoveryContent(ctx.cwd, state, params.content);
        await refresh(ctx, state);
        const snapshot = await loadDiscovery(ctx.cwd, state);
        if (snapshot.interaction.stopped) {
          const blockers = unresolvedBlockingQuestions(snapshot);
          if (blockers.length) {
            ctx.ui.setEditorText('/evidence-answer');
            return result(
              `发现草稿已保存，本轮整理结束。阻塞项：${blockers.map((q) => q.id).join('、')}。未定稿；可用 /evidence-answer Q-ID 补充，或 /evidence-discovery resume 恢复问答。`,
              state,
              true,
            );
          }
          return result(
            '发现记录已保存；禁止自动追问。无问题阻塞，可继续原有来源、回放及定稿校验。',
            state,
          );
        }
        return result('发现记录已保存；继续局部建模、追问或案例回放。', state);
      });
    },
  });
  pi.registerTool({
    name: 'evidence_check_model_draft',
    label: '检查 FM 草稿',
    description:
      'Validate a complete FM v3 candidate in isolation. Does not replace formal artifacts or create a gate. Preserve business expected results; do not weaken scenarios to pass.',
    parameters: Type.Object({
      expectedRevision: revision,
      files: Type.Array(
        Type.Object({
          path: Type.String({ minLength: 1 }),
          content: Type.String({ minLength: 1, maxLength: 500000 }),
        }),
        { minItems: 1, maxItems: 200 },
      ),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      return withModelingLock(ctx.cwd, async () => {
        const state = await runningState(ctx.cwd, params.expectedRevision);
        if (state.discovery.stage !== 'discovering')
          throw new Error('请先保存新的发现版本以重新打开草稿');
        const snapshot = await loadDiscovery(ctx.cwd, state);
        if (!snapshot.content) throw new Error('先保存范围及场景依据');
        assertConsolidated(snapshot);
        const config = await loadConfig(ctx.cwd);
        const files = normalizeFmModelFiles(params.files);
        const checked = await replaceFmModel({
          pi,
          root: ctx.cwd,
          files,
          draftOnly: true,
          signal,
          timeoutMs: config.commandTimeoutMs,
          onProgress: (text) =>
            onUpdate?.({ content: [{ type: 'text', text }], details: {} }),
        });
        snapshot.draft = {
          filesDigest: digestText(JSON.stringify(files)),
          passed: checked.passed,
          machineValidated: checked.machineValidated,
          simulationPassed: checked.simulationPassed,
          result: checked.items
            .map((item) => `${item.name}: ${item.status}\n${item.details}`)
            .join('\n')
            .slice(0, 30000),
        };
        await persistDiscovery(ctx.cwd, state, snapshot);
        return {
          ...result(snapshot.draft.result, state),
          details: {
            ...snapshot.draft,
            revision: state.discovery.revision,
            path: state.discovery.path,
          },
        };
      });
    },
  });
  pi.registerTool({
    name: 'evidence_finalize_discovery',
    label: '结束发现并开始定稿',
    description:
      'Check declared scope, source freshness, blockers and normal/boundary/exception replay coverage, then enable formal language/FM and software requirements artifacts. Does not approve the model or create a gate.',
    parameters: Type.Object({ expectedRevision: revision }),
    async execute(_id, params, _signal, _update, ctx) {
      return withModelingLock(ctx.cwd, async () => {
        const state = await runningState(ctx.cwd, params.expectedRevision);
        await finalizeDiscovery(ctx.cwd, state);
        await refresh(ctx, state);
        ctx.ui.setEditorText('/evidence-run');
        return result(
          '发现声明检查通过（不证明业务完整性）。运行 /evidence-run 依次定稿统一语言、FM 和软件需求，共用 Modeling Gate。',
          state,
          true,
        );
      });
    },
  });
  return { collectAnswer, offerQuestion };
}
