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
      operatingMainline: 'cash',
      operatingBasis:
        '买方与卖方签订采购协议，使买方取得商品、卖方取得价款（买方支出）。',
      boundary: '货物价款与交付',
      clarification: 'open',
      unresolved: [],
    },
    {
      agreementRef: 'A-2',
      name: '采购协议',
      parties: ['平台', '商户'],
      operatingMainline: 'cash',
      operatingBasis:
        '平台与商户签订服务协议，使商户获得交易服务、平台取得服务费收入。',
      boundary: '服务费与服务责任',
      clarification: 'open',
      unresolved: ['服务费率待明确'],
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
      { status: 'candidate' },
      { status: 'confirmed' },
      { parties: [] },
      { parties: ['买方'] },
      { boundary: '' },
      { operatingMainline: 'risk' },
      { operatingMainline: undefined },
      { operatingBasis: ' ' },
      { operatingBasis: undefined },
      { sourceRefs: ['private-material.md'] },
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
    expect(title).toContain('经营主线：现金权责');
    expect(title).toContain(input.contexts[0].operatingBasis);
    expect(title).not.toMatch(/资料来源|sourceRefs|agreementRef/);
    expect(title).toContain('服务费率待明确');
    expect(title).toContain('选择只决定分析焦点');
    expect(title).toContain('先分析哪个合同上下文？');
    expect(title).not.toMatch(/候选|已确认/);
    expect(options[0]).toContain('当前');
    expect(options[1]).toBe('2. 采购协议');
  });

  it('renders target-actual purposes without cash labels', async () => {
    const ctx = context();
    ctx.ui.select.mockResolvedValue('返回');
    await new QuestionUI().selectContext(
      {
        contexts: [
          {
            ...input.contexts[0],
            operatingMainline: 'target-actual',
            operatingBasis:
              '管理者与销售达成绩效约定，通过检查实际联系产出落实客户联系目标。',
          },
        ],
      },
      ctx as never,
    );
    const title = ctx.ui.select.mock.calls[0][0];
    expect(title).toContain('经营主线：目标与实际');
    expect(title).toContain('管理者与销售达成绩效约定');
    expect(title).not.toContain('经营主线：现金权责');
  });

  it('keeps completed contexts visible but rejects even a forged selection of them', async () => {
    const ctx = context();
    const completed: ContextSelectionInput = {
      contexts: input.contexts.map((item) => ({
        ...item,
        clarification: 'completed',
      })),
    };
    ctx.ui.select.mockResolvedValue('1. 采购协议（已结束，不可选择）');
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
