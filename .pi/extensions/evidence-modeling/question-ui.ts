import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

import type {
  CurrentPosition,
  ContextSelectionInput,
  ContextSelectionResult,
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

const ACTIONS = [
  '回答',
  '查看／切换合同上下文',
  '暂缓此问题',
  '结束本次讨论',
  '关闭面板',
] as const;

export class QuestionUI {
  private active = false;

  async selectContext(
    input: ContextSelectionInput,
    ctx: ExtensionContext,
  ): Promise<ContextSelectionResult> {
    const refs = new Set(input.contexts.map((item) => item.agreementRef));
    if (refs.size !== input.contexts.length)
      throw new Error('合同上下文引用重复');
    if (input.currentAgreementRef && !refs.has(input.currentAgreementRef)) {
      throw new Error('当前合同上下文引用不存在');
    }
    if (!input.contexts.length) return { status: 'empty' };
    if (!ctx.hasUI || this.active) return { status: 'unavailable' };
    this.active = true;
    try {
      const labels = input.contexts.map(
        (item, index) =>
          `${index + 1}. ${item.name}（${item.status === 'candidate' ? '候选' : '已确认'}${item.clarification === 'completed' ? '，已结束，不可选择' : ''}${item.agreementRef === input.currentAgreementRef ? '，当前' : ''}）`,
      );
      const title = [
        '合同上下文总览',
        ...input.contexts.map((item, index) =>
          [
            labels[index],
            `双方：${item.parties.join(' / ') || '待明确'}`,
            `责任边界：${item.boundary}`,
            `待确认：${item.unresolved.join('；') || '暂无已记录缺口'}`,
          ].join('\n'),
        ),
        '选择只改变澄清焦点，不代表确认边界或排除其他责任。',
        '先澄清哪个合同上下文？',
      ].join('\n');
      const selectable = labels.filter(
        (_label, index) => input.contexts[index].clarification === 'open',
      );
      const choice = await ctx.ui.select(title, [...selectable, '返回']);
      const index =
        choice && selectable.includes(choice) ? labels.indexOf(choice) : -1;
      return index < 0
        ? { status: 'cancelled' }
        : {
            status: 'selected',
            agreementRef: input.contexts[index].agreementRef,
          };
    } finally {
      this.active = false;
    }
  }

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
      if (action === '查看／切换合同上下文')
        return { ...base, status: 'switch-context' };
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
