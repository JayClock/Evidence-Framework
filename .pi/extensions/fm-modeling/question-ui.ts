import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

import type { QuestionInput, QuestionResult } from './ui-contracts.js';

const ACTIONS = [
  '回答',
  '暂缓此问题',
  '结束本次讨论',
  '关闭面板',
] as const;

export class QuestionUI {
  private panelOpen = false;

  async open(
    input: QuestionInput,
    ctx: ExtensionContext,
  ): Promise<QuestionResult> {
    const base = {
      questionId: input.questionId,
      gapKey: input.gapKey,
    };
    if (!ctx.hasUI || this.panelOpen) {
      return { ...base, status: 'unavailable' };
    }

    this.panelOpen = true;
    try {
      const title = [
        `${input.questionId} · ${input.prompt}`,
        `影响：${input.impact}`,
        `当前理解：${input.contextSummary}`,
        input.sourceRefs.length
          ? `来源：${input.sourceRefs.join('、')}`
          : '来源：尚未提供',
      ].join('\n');
      const action = await ctx.ui.select(title, [...ACTIONS]);
      if (action === '暂缓此问题') return { ...base, status: 'deferred' };
      if (action === '结束本次讨论') return { ...base, status: 'stopped' };
      if (action !== '回答') return { ...base, status: 'cancelled' };

      const answer = await ctx.ui.editor(input.prompt, '');
      if (!answer?.trim()) return { ...base, status: 'cancelled' };
      return { ...base, status: 'answered', answer };
    } finally {
      this.panelOpen = false;
    }
  }
}
