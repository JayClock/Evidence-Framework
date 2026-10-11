import { describe, expect, it, vi } from 'vitest';
import { Check } from 'typebox/value';

import { QuestionUI } from './question-ui.js';
import {
  ContextSelectionSchema,
  type ContextSelectionInput,
} from './ui-contracts.js';

const input: ContextSelectionInput = {
  contexts: [
    {
      agreementRef: 'A-1',
      name: '采购协议',
      parties: ['买方', '卖方'],
      boundary: '货物价款与交付',
      status: 'confirmed',
      clarification: 'open',
      unresolved: [],
    },
    {
      agreementRef: 'A-2',
      name: '采购协议',
      parties: ['平台', '商户'],
      boundary: '服务费与服务责任',
      status: 'candidate',
      clarification: 'open',
      unresolved: ['独立边界待确认'],
    },
  ],
  currentAgreementRef: 'A-1',
};

const context = () => ({ hasUI: true, ui: { select: vi.fn() } });

describe('contract context navigation', () => {
  it('requires sourced summaries, explicit uncertainty and stable references', () => {
    expect(Check(ContextSelectionSchema, input)).toBe(true);
    expect(Check(ContextSelectionSchema, { contexts: [] })).toBe(true);
    for (const fields of [
      { agreementRef: ' ' },
      { status: 'approved' },
      { boundary: '' },
      { extra: true },
    ]) {
      expect(
        Check(ContextSelectionSchema, {
          contexts: [{ ...input.contexts[0], ...fields }],
        }),
      ).toBe(false);
    }
  });

  it('shows all summaries and selects a stable ID even with duplicate names', async () => {
    const ctx = context();
    ctx.ui.select.mockImplementation(async (_title, options) => options[1]);
    expect(await new QuestionUI().selectContext(input, ctx as never)).toEqual({
      status: 'selected',
      agreementRef: 'A-2',
    });
    const [title, options] = ctx.ui.select.mock.calls[0];
    expect(title).toContain('合同上下文总览');
    expect(title).toContain('买方 / 卖方');
    expect(title).toContain('货物价款与交付');
    expect(title).toContain('独立边界待确认');
    expect(title).toContain('不代表确认边界或排除其他责任');
    expect(options[0]).toContain('当前');
    expect(options[1]).toContain('候选');
  });

  it('keeps completed contexts visible but rejects even a forged selection of them', async () => {
    const ctx = context();
    const completed: ContextSelectionInput = {
      contexts: input.contexts.map((item) => ({
        ...item,
        clarification: 'completed',
      })),
    };
    ctx.ui.select.mockResolvedValue('1. 采购协议（已确认，已结束，不可选择）');
    expect(
      await new QuestionUI().selectContext(completed, ctx as never),
    ).toEqual({ status: 'cancelled' });
    expect(ctx.ui.select.mock.calls[0][0]).toContain('已结束，不可选择');
    expect(ctx.ui.select.mock.calls[0][1]).toEqual(['返回']);
  });

  it('maps the remaining open option to its original ID after filtering completed contexts', async () => {
    const ctx = context();
    ctx.ui.select.mockImplementation(async (_title, options) => options[0]);
    const mixed: ContextSelectionInput = {
      contexts: [
        { ...input.contexts[0], clarification: 'completed' },
        input.contexts[1],
      ],
    };
    expect(await new QuestionUI().selectContext(mixed, ctx as never)).toEqual({
      status: 'selected',
      agreementRef: 'A-2',
    });
    expect(ctx.ui.select.mock.calls[0][1]).toHaveLength(2);
  });

  it.each([undefined, '返回', 'unknown'])(
    'cancels without choosing a default: %s',
    async (choice) => {
      const ctx = context();
      ctx.ui.select.mockResolvedValue(choice);
      expect(await new QuestionUI().selectContext(input, ctx as never)).toEqual(
        { status: 'cancelled' },
      );
    },
  );

  it('handles empty and headless lists without inventing a contract', async () => {
    const ctx = context();
    const ui = new QuestionUI();
    expect(await ui.selectContext({ contexts: [] }, ctx as never)).toEqual({
      status: 'empty',
    });
    expect(
      await ui.selectContext(input, { ...ctx, hasUI: false } as never),
    ).toEqual({ status: 'unavailable' });
    expect(ctx.ui.select).not.toHaveBeenCalled();
  });

  it('rejects ambiguous IDs and a stale current reference before opening a dialog', async () => {
    const ctx = context();
    const ui = new QuestionUI();
    await expect(
      ui.selectContext(
        { contexts: [input.contexts[0], input.contexts[0]] },
        ctx as never,
      ),
    ).rejects.toThrow('重复');
    await expect(
      ui.selectContext(
        { ...input, currentAgreementRef: 'missing' },
        ctx as never,
      ),
    ).rejects.toThrow('不存在');
    expect(ctx.ui.select).not.toHaveBeenCalled();
  });

  it('shares the question dialog lock and releases it after failure', async () => {
    const ctx = context();
    const ui = new QuestionUI();
    let release!: (choice: string) => void;
    ctx.ui.select.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const first = ui.selectContext(input, ctx as never);
    expect(
      (
        await ui.open(
          {
            questionId: 'Q-1',
            gapKey: 'test.gap',
            position: { kind: 'unlocated' },
            story: '当前尚未定位约定，先从已有材料中的双方关系开始。',
            prompt: '问题',
          },
          ctx as never,
        )
      ).status,
    ).toBe('unavailable');
    expect((await ui.selectContext(input, ctx as never)).status).toBe(
      'unavailable',
    );
    release('返回');
    await first;
    ctx.ui.select.mockRejectedValueOnce(new Error('interrupted'));
    await expect(ui.selectContext(input, ctx as never)).rejects.toThrow(
      'interrupted',
    );
    ctx.ui.select.mockResolvedValue('返回');
    expect((await ui.selectContext(input, ctx as never)).status).toBe(
      'cancelled',
    );
  });
});
