import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { contractViewLines, questionLabel } from './discovery-contract-view.ts';
import {
  editDiscoveryView,
  selectDiscoveryView,
} from './discovery-answer-ui.ts';
import {
  DiscoverySubmissionSchema,
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
  appendDiscoveryEvent,
  appendDiscoveryRecords,
  discoveryViewPath,
  pendingQuestions,
  unansweredQuestions,
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
    'Exact revision from the current discovery read model; stale writes are rejected.',
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
    content: [
      {
        type: 'text' as const,
        text: `${text}\n记录版本：${state.discovery.revision}；当前视图：${discoveryViewPath(state)}（按需 read，非业务来源）。`,
      },
    ],
    details: {
      revision: state.discovery.revision,
      path: state.discovery.path,
      viewPath: discoveryViewPath(state),
    },
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
    const action = await selectDiscoveryView(ctx, snapshot, {
      questionId: active.id,
      title: '业务建模 · 等待回答',
      choices: ['回答', FINISH_DISCOVERY],
      signal,
    });
    if (action === FINISH_DISCOVERY) return { kind: 'finish' };
    return action === '回答'
      ? { kind: 'question', question: active, mode: '事实或决定' }
      : undefined;
  }
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
      (await selectDiscoveryView(ctx, snapshot, {
        title: '选择业务问题（历史问题可更正）',
        choices: [
          ...choices.map((q) => questionLabel(snapshot, q.id)),
          ...(discovering ? [FINISH_DISCOVERY] : []),
        ],
        signal,
      }));
    selectedId = '';
    if (discovering && selected === FINISH_DISCOVERY) return { kind: 'finish' };
    const question = snapshot.questions.find(
      (q) => q.id === selected?.split(' ')[0],
    );
    if (!question) return;
    const mode = await selectDiscoveryView(ctx, snapshot, {
      questionId: question.id,
      title: '如何处理这个问题？',
      choices: [
        ...answerModes.keys(),
        ...(discovering &&
        unansweredQuestions(snapshot).some((q) => q.id === question.id)
          ? [SKIP_QUESTION]
          : []),
        back,
      ],
      signal,
    });
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
  const text = await editDiscoveryView(ctx, snapshot, {
    question,
    respondent,
    prefill: previous?.text ?? '',
    signal,
  });
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
      'Ask exactly ONE core business question based on the latest saved understanding. First consume each human answer/skip and save the updated discovery. Before asking, show the sourced candidate structure and its gaps; for fulfillment use request (who asks whom for what) -> confirmation evidence (who provides what proof), not an assumed approval step. Briefly explain what changed and what remains unknown. First reuse sourced facts and deterministic derivations across all discovery routes; technical mapping and FM representation are not business questions. Expand type times for all identified evidence: rfp/proposal/fulfillment_request use start_at/expired_at, contract uses signed_at, fulfillment_confirmation uses confirmed_at, other_evidence uses created_at. Use the guide’s single four-color provenance loop for ALL key data, including non-derived values and all evidence times; do not wait for suspected derivation. Type expansion is not provenance completion. Reuse sources, distinguish direct records, referenced values, derivations and unresolved origins, then save findings. If missing business provenance affects the current judgment, ask how the value is determined without presupposing a formula or free input. Known provenance needs no repeat question; physical fields and instance dates are not a checklist. Do not add request intervals to moment evidence, conflate signing with effectiveness or confirmation with callback arrival, or equate a record creation time with the original event. Preserve real conflicts in additional business rules. New questions require a stable object-and-fact gapKey; reuse the original gapKey/Q-ID for the same gap. Do not bundle subquestions, precompute a questionnaire, re-ask facts already provided, or repeat deferred gaps under a new ID. Existing facts that fully cover an unresolved historical question may be linked through a sourced resolution record instead of another answer. An unchanged historical unanswered and unresolved question may be selected by its existing Q-ID. Persist and stop in waiting_answer; never answer for the human. Modeling only.',
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
        // TUI owns the business presentation in its answer card. RPC/headless
        // clients still need the textual question because they have no card.
        if (ctx.mode === 'tui' && ctx.hasUI)
          return result(
            `问题 ${params.questions[0].id} 已保存，稍后打开问答卡片。可用 /evidence-answer 重开，/evidence-status 查看完整结构。`,
            state,
            true,
          );
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
    label: '追加业务发现',
    description:
      'Append only this turn’s discovery records, never a full snapshot or CRUD patch. Provide summary and INPUT/SRC-*/latest A-* basis; D-* references identify prior agent records, not independent business facts. New objects use supersedes:null; corrections and withdrawals must reference the current D-ID from recordHeads in the extension-provided current view (read its file only when needed; check its revision). Old records cannot be edited or deleted. Record kinds: scope, position (focus/current), note, source, candidate, case, contract (two roles), fulfillment (one obligation), resolution (questionId, conclusion, reasoning, sourceRefs, citations with exact sourceRef/quote), withdraw. Resolutions link existing facts or deterministic deductions to unanswered/unknown questions, never create A-* answers, invent decisions, exclude scope or override human facts. Every cited source needs a verbatim quote from INPUT/SRC-*/latest answered A-*; D-* and unknown/excluded answers are not proof. Source or target-answer corrections invalidate old associations. Unmentioned objects remain unchanged; withdrawals cannot leave dangling relationships. Scope is an outcome, not an entry questionnaire. Candidates need label (1–40 single-line characters) and description; candidates are not approved FM facts. Keep request/confirmation concise and preserve partial known facts; genuinely unknown parties/evidence remain null. For an identified request, preserve its start_at/expired_at type meaning AND mark any unresolved deadline basis; a nonempty field does not resolve business provenance. All six evidence kinds allow non-derived type times; contract signed_at, fulfillment_confirmation confirmed_at and other_evidence created_at do not require a date/formula/recorder interview or a request interval. Save the type meanings in candidate.description/notes, not new discovery fields; concrete instances still require their own timestamps. Real signing, proof acceptance and original-event ambiguities remain distinct from type expansion. Retain additional sourced constraints and real ambiguities, without inventing default durations or who may set them. For ALL key data, record four-color business provenance in candidate.description/notes: known direct records, referenced values, derivation rules or unresolved origins, with sources and candidate reasoning. These are discovery explanations, not new schema fields. Do not treat absent formulas, asserted labels or machine lineage success as proof of provenance, or resolve a business-origin question merely because its type exists. Confirmation identifies who forms what proof of which result, not an assumed approver. Do not invent contracts for domain/channel discovery. Consume all new human answers/skips before the next question or checks; notes can explain unresolved gaps without inventing facts. Invalidates drafts and finalization; stopping after append is valid.',
    parameters: Type.Object({
      expectedRevision: revision,
      ...DiscoverySubmissionSchema.properties,
    }),
    async execute(_id, params, _signal, _update, ctx) {
      return withModelingLock(ctx.cwd, async () => {
        const state = await runningState(ctx.cwd, params.expectedRevision);
        const { expectedRevision: _revision, ...submission } = params;
        await appendDiscoveryRecords(ctx.cwd, state, submission);
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
        return result(
          '发现记录已保存；先展示更新后的候选结构、依据及缺口，再决定一个必要问题或案例回放。没有必要问题时可停止。',
          state,
        );
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
        await appendDiscoveryEvent(ctx.cwd, state, {
          kind: 'draft',
          result: snapshot.draft,
        });
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
