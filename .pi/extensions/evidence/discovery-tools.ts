import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import {
  DiscoveryContentSchema,
  QuestionSchema,
  type DiscoveryAnswer,
} from './discovery-schema.ts';
import {
  answerQuestion,
  askQuestions,
  assertDiscoveryRevision,
  digestText,
  finalizeDiscovery,
  latestAnswer,
  loadDiscovery,
  persistDiscovery,
  saveDiscoveryContent,
  unansweredQuestions,
  withModelingLock,
} from './discovery.ts';
import { loadConfig, loadState } from './storage.ts';
import { recordGateDecision } from './gates.ts';
import { normalizeFmModelFiles, replaceFmModel } from './modeling.ts';
import type { EvidenceState } from './types.ts';

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

type Refresh = (ctx: ExtensionContext, state: EvidenceState) => Promise<void>;

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

export async function collectAnswer(
  ctx: ExtensionCommandContext,
  refresh: Refresh,
  selectedId = '',
): Promise<void> {
  await ctx.waitForIdle();
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
  const snapshot = await loadDiscovery(ctx.cwd, state);
  const pending = unansweredQuestions(snapshot);
  const choices = pending.length ? pending : snapshot.questions;
  const selected =
    selectedId ||
    (await ctx.ui.select(
      '选择问题（已回答的问题可更正）',
      choices.map((q) => `${q.id} ${q.prompt}`),
    ));
  const question = snapshot.questions.find(
    (q) => q.id === selected?.split(' ')[0],
  );
  if (!question) return;
  const previous = latestAnswer(snapshot, question.id);
  const text = await ctx.ui.editor(
    `${question.id} ${question.prompt}\n影响：${question.impact}`,
    previous?.text ?? '',
  );
  if (text === undefined || !text.trim()) return;
  const mode = await ctx.ui.select('如何记录这个回答？', [
    '事实或决定',
    '未知，仍需澄清',
    '移出本次范围（回答中说明原因）',
  ]);
  if (!mode) return;
  const respondent = await ctx.ui.input(
    '回答者姓名／业务角色（人工声明，不是认证身份）',
    previous?.respondent ?? '',
  );
  if (!respondent?.trim()) return;
  const status: DiscoveryAnswer['status'] =
    mode === '事实或决定'
      ? 'answered'
      : mode.startsWith('未知')
        ? 'unknown'
        : 'excluded';
  await withModelingLock(ctx.cwd, async () => {
    const current = await loadState(ctx.cwd);
    if (!current || current.runId !== state.runId)
      throw new Error('运行已改变，请重新回答');
    assertDiscoveryRevision(current, state.discovery.revision);
    if (current.status === 'running')
      throw new Error('任务已经开始，请稍后回答');
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
    ctx.ui.setEditorText(
      current.status === 'waiting_answer'
        ? '/evidence-answer'
        : '/evidence-run',
    );
    ctx.ui.notify(
      '原文已保存；旧回答保留。运行 /evidence-run 消化回答，或继续回答剩余问题。',
      'info',
    );
  });
}

export function registerDiscoveryTools(
  pi: ExtensionAPI,
  refresh: Refresh,
): void {
  pi.registerCommand('evidence-answer', {
    description:
      '回答当前发现问题；可传 Q-ID 更正历史回答，保留原文并使旧定稿失效',
    handler: (args, ctx) => collectAnswer(ctx, refresh, args.trim()),
  });
  pi.registerTool({
    name: 'evidence_ask_questions',
    label: '业务发现提问',
    description:
      'Ask 1–4 related business questions, persist them and stop in waiting_answer. Never answer on behalf of the human. Use only in Modeling.',
    parameters: Type.Object({
      expectedRevision: revision,
      questions: Type.Array(QuestionSchema, { minItems: 1, maxItems: 4 }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      return withModelingLock(ctx.cwd, async () => {
        const state = await runningState(ctx.cwd, params.expectedRevision);
        await askQuestions(ctx.cwd, state, params.questions);
        await refresh(ctx, state);
        ctx.ui.setEditorText('/evidence-answer');
        return result(
          `${params.questions.map((q) => `${q.id}：${q.prompt}\n影响：${q.impact}`).join('\n\n')}\n\n请运行 /evidence-answer。`,
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
      'Save complete scope, four-color evidence/lineage and domain/replay notes. Source refs are INPUT, SRC-* or latest human A-* IDs. Candidates are not approved FM facts. Invalidates previous drafts and finalization.',
    parameters: Type.Object({
      expectedRevision: revision,
      content: DiscoveryContentSchema,
    }),
    async execute(_id, params, _signal, _update, ctx) {
      return withModelingLock(ctx.cwd, async () => {
        const state = await runningState(ctx.cwd, params.expectedRevision);
        await saveDiscoveryContent(ctx.cwd, state, params.content);
        await refresh(ctx, state);
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
}
