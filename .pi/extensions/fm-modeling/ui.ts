import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';

import { fmPaths } from './paths.js';
import { modelingPrompt } from './prompts.js';
import { ToolLease } from './runtime.js';
import { type EventEnvelope, type ModelState, StateStore } from './state.js';

export function nextQuestionId(
  events: EventEnvelope[],
  gapKey: string,
): string {
  const previous = events.find(
    (entry) =>
      entry.event.kind === 'question-asked' && entry.event.gapKey === gapKey,
  );
  if (previous?.event.kind === 'question-asked')
    return previous.event.questionId;
  const highest = events.reduce((max, entry) => {
    if (entry.event.kind !== 'question-asked') return max;
    return Math.max(max, Number(entry.event.questionId.slice(2)) || 0);
  }, 0);
  return `Q-${String(highest + 1).padStart(3, '0')}`;
}

export class QuestionInteraction {
  constructor(
    private readonly pi: ExtensionAPI,
    private readonly store: StateStore,
    private readonly tools = new ToolLease(pi),
  ) {}

  async ask(params: {
    runId: string;
    expectedRevision: number;
    gapKey: string;
    prompt: string;
    impact: string;
    sourceRefs: string[];
  }): Promise<ModelState> {
    const state = await this.store.loadState();
    if (!state || state.runId !== params.runId) throw new Error('Run 不匹配');
    if (state.stoppedAt) throw new Error('Run 已停止');
    if (state.stopRequested) throw new Error('Run 已请求停止，不能再提问');
    if (state.activeQuestionId)
      throw new Error(`已有未回答问题 ${state.activeQuestionId}`);
    if (state.revision !== params.expectedRevision)
      throw new Error('Revision 已过期');
    const events = await this.store.readEvents(state);
    const latest = events.at(-1)?.event.kind;
    if (
      !['model-published', 'model-noop', 'model-publication-failed'].includes(
        latest ?? '',
      )
    ) {
      throw new Error('当前输入尚无 publish、no-op 或 failure 结果，不能提问');
    }
    const questionId = nextQuestionId(events, params.gapKey);
    const result = await this.store.appendEvent(
      params.expectedRevision,
      {
        kind: 'question-asked',
        questionId,
        gapKey: params.gapKey,
        prompt: params.prompt,
        impact: params.impact,
        sourceRefs: params.sourceRefs,
      },
      (current) => ({ ...current, activeQuestionId: questionId }),
    );
    return result.state;
  }

  async open(ctx: ExtensionContext): Promise<void> {
    const state = await this.store.loadState();
    if (!state?.activeQuestionId) return;
    const events = await this.store.readEvents(state);
    const question = events
      .map((entry) => entry.event)
      .find(
        (event) =>
          event.kind === 'question-asked' &&
          event.questionId === state.activeQuestionId,
      );
    if (!question || question.kind !== 'question-asked')
      throw new Error('活动问题事件不存在');
    if (!ctx.hasUI) {
      ctx.ui.notify(`${question.questionId}：${question.prompt}`, 'info');
      return;
    }
    const action = await ctx.ui.select(
      `${question.questionId} · ${question.prompt}\n影响：${question.impact}`,
      ['回答', '停止', '取消'],
    );
    if (action === '停止') {
      ctx.ui.notify('可执行 /evidence-model stop 停止当前 Run。', 'info');
      return;
    }
    if (action !== '回答') return;
    const answer = await ctx.ui.editor(question.prompt, '');
    if (!answer?.trim()) return;
    await this.recordAnswer(state, question.questionId, answer, ctx);
  }

  private async recordAnswer(
    state: ModelState,
    questionId: string,
    answer: string,
    ctx: ExtensionContext,
  ): Promise<void> {
    const answerId = `A-${questionId.slice(2)}`;
    const inputRevision = state.revision + 1;
    const execution = {
      id: `EXEC-${state.runId}-${inputRevision}`,
      sessionId: ctx.sessionManager.getSessionId(),
      inputRevision,
      startedAt: new Date().toISOString(),
    };
    const result = await this.store.appendEvent(
      state.revision,
      {
        kind: 'answer-recorded',
        answerId,
        questionId,
        text: answer,
      },
      (current) => ({ ...current, activeQuestionId: null, execution }),
    );
    this.tools.activate(['read', 'fm_model_submit', 'fm_model_ask']);
    this.pi.sendUserMessage(modelingPrompt(ctx.cwd, result.state));
  }
}

export function currentModelMessage(root: string, state: ModelState): string {
  return state.modelRevision > 0
    ? `当前模型：${fmPaths(root).model}（modelRevision ${state.modelRevision}）`
    : `Run ${state.runId} 当前没有有效 FM 模型。`;
}
