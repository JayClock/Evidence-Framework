import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

import type {
  CurrentPosition,
  QuestionInput,
  QuestionResult,
} from './ui-contracts.js';

function formatPosition(position: CurrentPosition): string {
  switch (position.kind) {
    case 'fulfillment':
      return `${position.contract} → ${position.fulfillment} → ${position.point === 'request' ? '请求' : '确认'}`;
    case 'contract':
      return position.contract;
    case 'negotiation':
    case 'domain':
      return `${position.context} → ${position.object}`;
    case 'unlocated':
      return '待定位';
  }
}

const ACTIONS = ['回答', '暂缓此问题', '结束本次讨论', '关闭面板'] as const;

export class QuestionUI {
  private active = false;

  async open(
    input: QuestionInput,
    ctx: ExtensionContext,
  ): Promise<QuestionResult> {
    const base = {
      questionId: input.questionId,
      gapKey: input.gapKey,
    };
    if (!ctx.hasUI || this.active) {
      return { ...base, status: 'unavailable' };
    }

    this.active = true;
    try {
      const title = [
        `当前位置：${formatPosition(input.position)}`,
        ...(input.known.length
          ? ['已明确：', ...input.known.map((fact) => `  · ${fact}`)]
          : ['已明确：暂无']),
        `正在澄清：${input.prompt}`,
      ].join('\n');
      const action = await ctx.ui.select(title, [...ACTIONS]);
      if (action === '暂缓此问题') return { ...base, status: 'deferred' };
      if (action === '结束本次讨论') return { ...base, status: 'stopped' };
      if (action !== '回答') return { ...base, status: 'cancelled' };

      const answer = await ctx.ui.editor(title, '');
      if (!answer?.trim()) return { ...base, status: 'cancelled' };
      return { ...base, status: 'answered', answer };
    } finally {
      this.active = false;
    }
  }
}
