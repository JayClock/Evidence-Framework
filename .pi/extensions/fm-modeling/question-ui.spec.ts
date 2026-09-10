import { describe, expect, it, vi } from 'vitest';

import { QuestionUI } from './question-ui.js';

const input = {
  questionId: 'Q-017',
  gapKey: 'payment.confirmation',
  prompt: '什么凭证证明付款完成？',
  impact: '影响付款履约判断',
  contextSummary: '平台请求读者付款，确认凭证待明确',
  sourceRefs: ['docs/business/discovery.md#Q-017'],
};

function context(options: { action?: string; answer?: string; hasUI?: boolean }) {
  return {
    hasUI: options.hasUI ?? true,
    ui: {
      select: vi.fn().mockResolvedValue(options.action),
      editor: vi.fn().mockResolvedValue(options.answer),
    },
  };
}

describe('QuestionUI', () => {
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
    ['暂缓此问题', 'deferred'],
    ['结束本次讨论', 'stopped'],
    ['关闭面板', 'cancelled'],
    [undefined, 'cancelled'],
  ])('maps %s independently to %s', async (action, status) => {
    const result = await new QuestionUI().open(
      input,
      context({ action }) as never,
    );

    expect(result.status).toBe(status);
    expect(result.questionId).toBe(input.questionId);
  });

  it('does not treat a blank editor submission as an answer', async () => {
    const result = await new QuestionUI().open(
      input,
      context({ action: '回答', answer: '  \n' }) as never,
    );

    expect(result.status).toBe('cancelled');
    expect(result).not.toHaveProperty('answer');
  });

  it('returns unavailable without opening dialogs when no UI exists', async () => {
    const ctx = context({ hasUI: false });

    const result = await new QuestionUI().open(input, ctx as never);

    expect(result.status).toBe('unavailable');
    expect(ctx.ui.select).not.toHaveBeenCalled();
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
