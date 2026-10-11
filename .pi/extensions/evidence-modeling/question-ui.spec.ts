import { describe, expect, it, vi } from 'vitest';

import { QuestionUI } from './question-ui.js';
import type { CurrentPosition, QuestionInput } from './ui-contracts.js';

const input: QuestionInput = {
  questionId: 'Q-017',
  gapKey: 'payment.confirmation',
  prompt: '什么凭证证明付款完成？',
  position: {
    kind: 'fulfillment',
    contract: '订阅协议',
    fulfillment: '付款',
    point: 'confirmation',
  },
  known: ['读者应支付199元', '以到账结果证明完成'],
};

function context(options: {
  action?: string;
  answer?: string;
  hasUI?: boolean;
}) {
  return {
    hasUI: options.hasUI ?? true,
    ui: {
      select: vi.fn().mockResolvedValue(options.action),
      editor: vi.fn().mockResolvedValue(options.answer),
    },
  };
}

describe('QuestionUI', () => {
  it('shows only current progress and keeps it visible while answering', async () => {
    const ctx = context({ action: '回答', answer: '银行到账回执' });
    await new QuestionUI().open(input, ctx as never);

    const expected = [
      '当前位置：订阅协议 → 付款 → 确认',
      '已明确：',
      '  · 读者应支付199元',
      '  · 以到账结果证明完成',
      '正在澄清：什么凭证证明付款完成？',
    ].join('\n');
    expect(ctx.ui.select).toHaveBeenCalledWith(expected, [
      '回答',
      '查看／切换合同上下文',
      '暂缓此问题',
      '结束本次讨论',
      '关闭面板',
    ]);
    expect(ctx.ui.editor).toHaveBeenCalledWith(expected, '');
    expect(ctx.ui.select.mock.calls[0]?.[0]).not.toMatch(
      /来源|影响|当前理解|Q-017|整体准入|全局/,
    );
  });

  it.each<{ position: CurrentPosition; title: string }>([
    {
      position: {
        kind: 'fulfillment',
        contract: '运输协议',
        fulfillment: '送达',
        point: 'request',
      },
      title: '运输协议 → 送达 → 请求',
    },
    { position: { kind: 'contract', contract: '维护协议' }, title: '维护协议' },
    {
      position: { kind: 'negotiation', context: '采购协商', object: '报价' },
      title: '采购协商 → 报价',
    },
    {
      position: { kind: 'domain', context: '客户档案', object: '身份判断' },
      title: '客户档案 → 身份判断',
    },
    { position: { kind: 'unlocated' }, title: '待定位' },
  ])(
    'locates $title without inventing a fulfillment',
    async ({ position, title }) => {
      const ctx = context({ action: '暂缓此问题' });
      await new QuestionUI().open(
        { ...input, position, known: [] },
        ctx as never,
      );

      expect(ctx.ui.select.mock.calls[0]?.[0]).toBe(
        `当前位置：${title}\n已明确：暂无\n正在澄清：${input.prompt}`,
      );
      expect(ctx.ui.editor).not.toHaveBeenCalled();
    },
  );

  it('switches contracts and request/confirmation without carrying previous progress', async () => {
    const ctx = context({ action: '暂缓此问题' });
    const ui = new QuestionUI();
    await ui.open(input, ctx as never);
    await ui.open(
      {
        ...input,
        position: {
          kind: 'fulfillment',
          contract: '运输协议',
          fulfillment: '送达',
          point: 'request',
        },
        known: ['承运方须按约送达'],
        prompt: '送达要求依据哪份约定？',
      },
      ctx as never,
    );

    const secondTitle = ctx.ui.select.mock.calls[1]?.[0];
    expect(secondTitle).toContain('当前位置：运输协议 → 送达 → 请求');
    expect(secondTitle).toContain('承运方须按约送达');
    expect(secondTitle).not.toMatch(/订阅协议|199元|付款完成/);
  });

  it('preserves a multiline answer verbatim', async () => {
    const ctx = context({ action: '回答', answer: '第一项\n第二项  ' });

    const result = await new QuestionUI().open(input, ctx as never);

    expect(result).toEqual({
      status: 'answered',
      questionId: 'Q-017',
      gapKey: 'payment.confirmation',
      answer: '第一项\n第二项  ',
    });
    expect(ctx.ui.select.mock.calls[0]?.[0]).toContain(input.prompt);
  });

  it.each([
    ['查看／切换合同上下文', 'switch-context'],
    ['暂缓此问题', 'deferred'],
    ['结束本次讨论', 'stopped'],
    ['关闭面板', 'cancelled'],
    [undefined, 'cancelled'],
  ])('maps %s independently to %s', async (action, status) => {
    const ctx = context({ action });
    const result = await new QuestionUI().open(input, ctx as never);

    expect(result.status).toBe(status);
    expect(result.questionId).toBe(input.questionId);
    expect(ctx.ui.editor).not.toHaveBeenCalled();
  });

  it.each(['', '  \n', undefined])(
    'does not treat a blank or cancelled editor submission as an answer: %j',
    async (answer) => {
      const result = await new QuestionUI().open(
        input,
        context({ action: '回答', answer }) as never,
      );

      expect(result.status).toBe('cancelled');
      expect(result).not.toHaveProperty('answer');
    },
  );

  it('returns unavailable without opening dialogs when no UI exists', async () => {
    const ctx = context({ hasUI: false });

    const result = await new QuestionUI().open(input, ctx as never);

    expect(result.status).toBe('unavailable');
    expect(ctx.ui.select).not.toHaveBeenCalled();
  });

  it('releases the question panel when the host throws', async () => {
    const ctx = context({});
    ctx.ui.select.mockRejectedValue(new Error('UI interrupted'));
    const ui = new QuestionUI();
    await expect(ui.open(input, ctx as never)).rejects.toThrow(
      'UI interrupted',
    );
    const next = await ui.open(
      input,
      context({ action: '暂缓此问题' }) as never,
    );
    expect(next.status).toBe('deferred');
  });

  it('releases the question panel when the answer editor throws', async () => {
    const ctx = context({ action: '回答' });
    ctx.ui.editor.mockRejectedValue(new Error('Editor interrupted'));
    const ui = new QuestionUI();
    await expect(ui.open(input, ctx as never)).rejects.toThrow(
      'Editor interrupted',
    );
    const next = await ui.open(
      input,
      context({ action: '暂缓此问题' }) as never,
    );
    expect(next.status).toBe('deferred');
  });

  it('allows only one panel at a time', async () => {
    let release: ((value: string) => void) | undefined;
    const firstContext = context({});
    firstContext.ui.select.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const ui = new QuestionUI();
    const first = ui.open(input, firstContext as never);

    const second = await ui.open(input, context({ action: '回答' }) as never);
    release?.('关闭面板');
    await first;

    expect(second.status).toBe('unavailable');
  });
});
