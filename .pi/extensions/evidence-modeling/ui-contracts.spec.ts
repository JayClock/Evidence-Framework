import { describe, expect, it } from 'vitest';
import { Check } from 'typebox/value';

import { QuestionInputSchema, type QuestionInput } from './ui-contracts.js';

const input: QuestionInput = {
  questionId: 'Q-017',
  gapKey: 'payment.confirmation',
  position: {
    kind: 'fulfillment',
    contract: '订阅协议',
    fulfillment: '付款',
    point: 'confirmation',
  },
  story: '付款以到账结果证明完成，我们正在寻找承载实际到账金额的凭证。',
  prompt: '什么凭证证明付款完成？',
};

const valid = (value: unknown) => Check(QuestionInputSchema, value);

describe('current-progress question contract', () => {
  it('requires a story and permits a business evidence name without forcing one', () => {
    expect(valid(input)).toBe(true);
    expect(
      valid({
        ...input,
        position: { ...input.position, evidence: '银行回执' },
      }),
    ).toBe(true);
    const { story: _story, ...withoutStory } = input;
    expect(valid(withoutStory)).toBe(false);
    expect(
      valid({ ...input, position: { ...input.position, point: 'request' } }),
    ).toBe(true);
  });

  it.each([
    { kind: 'contract', contract: '维护协议' },
    { kind: 'domain', context: '客户档案', object: '身份判断' },
    { kind: 'negotiation', context: '采购协商', object: '报价' },
    { kind: 'unlocated' },
  ])(
    'supports $kind without requiring a fictitious contract or fulfillment',
    (position) => {
      expect(valid({ ...input, position })).toBe(true);
    },
  );

  it.each([
    { kind: 'fulfillment', contract: '订阅协议', fulfillment: '付款' },
    {
      kind: 'fulfillment',
      contract: '订阅协议',
      fulfillment: '付款',
      point: 'lineage',
    },
    {
      kind: 'fulfillment',
      contract: ' ',
      fulfillment: '付款',
      point: 'request',
    },
    {
      kind: 'fulfillment',
      contract: '订阅协议',
      fulfillment: '',
      point: 'request',
    },
    {
      kind: 'fulfillment',
      contract: '订阅协议',
      fulfillment: '付款',
      point: 'request',
      otherContracts: [],
    },
    {
      kind: 'fulfillment',
      contract: '订阅协议',
      fulfillment: '付款',
      point: 'confirmation',
      evidence: ' ',
    },
    { kind: 'domain', context: '客户档案' },
    { kind: 'unlocated', contract: '虚构合同' },
    { kind: 'global' },
  ])(
    'rejects incomplete, stage-based or expanded locations: %j',
    (position) => {
      expect(valid({ ...input, position })).toBe(false);
    },
  );

  it('rejects the old question payload rather than maintaining a compatibility path', () => {
    expect(
      valid({
        questionId: input.questionId,
        gapKey: input.gapKey,
        prompt: input.prompt,
        impact: '影响付款判断',
        contextSummary: '读者向平台付款',
        sourceRefs: ['方法文章.md'],
      }),
    ).toBe(false);
  });

  it.each([
    'known',
    'impact',
    'contextSummary',
    'sourceRefs',
    'globalProgress',
    'admission',
  ])('rejects the removed %s field even alongside the new contract', (key) => {
    expect(valid({ ...input, [key]: '不应显示' })).toBe(false);
  });

  it.each([
    { questionId: ' ' },
    { gapKey: 'INVALID GAP' },
    { story: ' \n' },
    { prompt: ' \n' },
  ])('rejects blank business text and invalid identity: %j', (fields) => {
    expect(valid({ ...input, ...fields })).toBe(false);
  });
});
