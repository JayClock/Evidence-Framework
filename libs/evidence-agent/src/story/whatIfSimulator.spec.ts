import { describe, expect, it, vi } from 'vitest';

import {
  WHAT_IF_EXPLANATION_PROMPT,
  WHAT_IF_EXTRACTION_PROMPT,
} from './prompts.js';
import { flowFixture, modelFixture, stepFixture } from './testing/fixtures.js';
import type { WhatIfInput } from './types.js';
import { simulateWhatIf } from './whatIfSimulator.js';

const fixture = (): { -readonly [K in keyof WhatIfInput]: WhatIfInput[K] } => {
  const model = modelFixture();
  model.entities
    .find(({ id }) => id === 'request.payment')!
    .attributes!.push({
      name: 'expired_at',
      label: '付款期限',
      meaning: '约定的最迟付款时间',
      valueType: 'timestamp',
    });
  model.entities.push({
    type: 'entity',
    id: 'confirmation.payment',
    category: 'evidence',
    kind: 'fulfillment_confirmation',
    label: '付款确认单',
    contextRef: 'context.purchase',
    attributes: [
      {
        name: 'confirmed_at',
        label: '付款时间',
        meaning: '实际支付时间',
        valueType: 'timestamp',
      },
      {
        name: 'paid_amount',
        label: '已付金额',
        meaning: '本次实付金额',
        valueType: 'int',
      },
    ],
  });
  model.relationships.push({
    type: 'relationship',
    id: 'relation.payment',
    kind: 'references',
    label: '确认付款请求',
    sourceRef: 'confirmation.payment',
    targetRef: 'request.payment',
  });
  const bindings = {
    request: { ref: 'request.payment' },
    payment: { ref: 'confirmation.payment' },
  };
  model.rules.push(
    {
      type: 'rule',
      id: 'rule.payment-breach',
      kind: 'breach',
      label: '付款逾期',
      description: '实际付款时间晚于约定期限时构成逾期',
      contextRef: 'context.purchase',
      bindings,
      expression: 'payment.confirmed_at > request.expired_at',
      resultType: 'bool',
    },
    {
      type: 'rule',
      id: 'rule.payment-completion',
      kind: 'completion',
      label: '付款金额足额',
      description: '实付金额达到请求金额',
      contextRef: 'context.purchase',
      bindings,
      expression: 'payment.paid_amount >= request.amount',
      resultType: 'bool',
    },
  );
  const request = stepFixture({
    exampleLabel: '付款申请',
    values: { amount: 100, expired_at: '2026-04-01T23:59:59Z' },
  });
  const payment = stepFixture({
    sequence: 2,
    entityId: 'confirmation.payment',
    entityKind: 'fulfillment_confirmation',
    entityLabel: '付款确认单',
    exampleLabel: '付款确认',
    actingRoleRef: 'role.buyer',
    basedOn: ['request.payment#付款申请'],
    values: { confirmed_at: '2026-04-01T12:00:00Z', paid_amount: 100 },
    asOf: '2026-04-01T12:00:00Z',
  });
  return {
    model,
    flow: flowFixture([request, payment]),
    currentStepSequence: 2,
    hypothesisQuestion: '如果买方在4月2号才付款会怎样？',
  };
};

const explanation = {
  businessImpactExplanation:
    '买方付款晚于约定期限，将触发付款逾期；具体违约责任还需确认合同约定。',
};

describe('native CEL What-If sandbox', () => {
  it('extracts a late-payment hypothesis, computes CEL decisions and only then explains', async () => {
    const input = fixture();
    const original = structuredClone(input);
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        asOf: '2026-04-02T12:00:00Z',
        values: { confirmed_at: '2026-04-02T12:00:00Z' },
      })
      .mockResolvedValueOnce(explanation);
    const result = await simulateWhatIf(input, { agent: { generate } });
    expect(result.ruleOutcome).toEqual({
      ruleId: 'rule.payment-breach',
      result: true,
    });
    expect(result.ruleOutcomes).toEqual([
      { ruleId: 'rule.payment-breach', result: true },
      { ruleId: 'rule.payment-completion', result: true },
    ]);
    expect(result.businessImpactExplanation).toContain('逾期');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0]![0].systemPrompt).toBe(
      WHAT_IF_EXTRACTION_PROMPT,
    );
    const request = generate.mock.calls[1]![0];
    expect(request.systemPrompt).toBe(WHAT_IF_EXPLANATION_PROMPT);
    expect(JSON.parse(request.userPrompt).ruleOutcomes[0]).toMatchObject({
      result: true,
      kind: 'breach',
    });
    expect(input).toEqual(original);
  });

  it('supports deterministic structured overrides and explicit single-rule selection', async () => {
    const input = fixture();
    input.ruleId = 'rule.payment-completion';
    input.hypothesis = { values: { paid_amount: 50 } };
    const generate = vi.fn().mockResolvedValue({
      businessImpactExplanation: '实付不足，付款尚未完成。',
    });
    const result = await simulateWhatIf(input, { agent: { generate } });
    expect(result.ruleOutcome).toEqual({
      ruleId: 'rule.payment-completion',
      result: false,
    });
    expect(result.ruleOutcomes).toHaveLength(1);
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0]![0].systemPrompt).toBe(
      WHAT_IF_EXPLANATION_PROMPT,
    );
  });

  it('does not confuse a later evaluation clock with a late actual payment', async () => {
    const input = fixture();
    input.hypothesis = { asOf: '2026-04-02T12:00:00Z' };
    const generate = vi.fn().mockResolvedValue(explanation);
    expect(
      (await simulateWhatIf(input, { agent: { generate } })).ruleOutcome.result,
    ).toBe(false);
  });

  it('injects only the explicit asOf into a request deadline rule, with no wall clock', async () => {
    const input = fixture();
    input.currentStepSequence = 1;
    input.ruleId = 'rule.deadline';
    input.model.rules.push({
      type: 'rule',
      id: 'rule.deadline',
      kind: 'breach',
      label: '付款期限已过',
      description: '推演时点已过付款期限',
      contextRef: 'context.purchase',
      bindings: {
        request: { ref: 'request.payment' },
        now: { type: 'timestamp' },
      },
      expression: 'now > request.expired_at',
      resultType: 'bool',
    });
    input.hypothesis = { asOf: '2026-04-02T00:00:00Z' };
    const generate = vi.fn().mockResolvedValue(explanation);
    expect(
      (await simulateWhatIf(input, { agent: { generate } })).ruleOutcome,
    ).toEqual({ ruleId: 'rule.deadline', result: true });
  });

  it('retains exact int64 comparisons instead of rounding to JavaScript numbers', async () => {
    const input = fixture();
    Object.assign(input.flow.steps[0]!.values, { amount: '9007199254740993' });
    input.hypothesis = { values: { paid_amount: '9007199254740992' } };
    input.ruleId = 'rule.payment-completion';
    const generate = vi.fn().mockResolvedValue(explanation);
    expect(
      (await simulateWhatIf(input, { agent: { generate } })).ruleOutcome.result,
    ).toBe(false);
  });

  it('recomputes derivations from overridden input, ignoring asserted derived facts', async () => {
    const input = fixture();
    const payment = input.model.entities.find(
      ({ id }) => id === 'confirmation.payment',
    )!;
    payment.attributes!.find(
      ({ name }) => name === 'paid_amount',
    )!.derivedByRuleRef = 'rule.net-payment';
    payment.attributes!.push({
      name: 'gross',
      label: '总付款额',
      meaning: '未扣手续费的总金额',
      valueType: 'int',
    });
    input.model.rules.push({
      type: 'rule',
      id: 'rule.net-payment',
      kind: 'derivation',
      label: '净付款额',
      description: '扣除十元手续费',
      contextRef: 'context.purchase',
      bindings: { payment: { ref: 'confirmation.payment' } },
      expression: 'payment.gross - 10',
      resultType: 'int',
      target: { entityRef: 'confirmation.payment', attribute: 'paid_amount' },
    });
    Object.assign(input.flow.steps[1]!.values, {
      gross: 110,
      paid_amount: 999,
    });
    Object.assign(input.flow.steps[1]!, {
      derivedAssertions: { paid_amount: 999 },
    });
    input.hypothesis = { values: { gross: 80 } };
    input.ruleId = 'rule.payment-completion';
    const generate = vi.fn().mockResolvedValue(explanation);
    expect(
      (await simulateWhatIf(input, { agent: { generate } })).ruleOutcome.result,
    ).toBe(false);
    expect(
      JSON.parse(generate.mock.calls[0]![0].userPrompt).currentValues
        .paid_amount,
    ).toBe(70);
    input.hypothesis = { values: { paid_amount: 200 } };
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('derived field');
  });

  it('resolves transitive dependencies and native many-binding macros', async () => {
    const input = fixture();
    const first = input.flow.steps[0]!;
    const second = stepFixture({
      ...first,
      sequence: 2,
      exampleLabel: '第二笔',
      values: { ...first.values, amount: 50 },
      basedOn: ['request.payment#付款申请'],
    });
    const payment = {
      ...input.flow.steps[1]!,
      sequence: 3,
      basedOn: ['request.payment#第二笔'],
    };
    input.flow = flowFixture([first, second, payment]);
    input.currentStepSequence = 3;
    input.model.rules = [
      {
        type: 'rule',
        id: 'rule.all-requests',
        kind: 'completion',
        label: '覆盖所有请求',
        description: '单笔付款覆盖每份请求',
        contextRef: 'context.purchase',
        bindings: {
          requests: { ref: 'request.payment', cardinality: 'many' },
          payment: { ref: 'confirmation.payment' },
        },
        expression: 'requests.all(r, payment.paid_amount >= r.amount)',
        resultType: 'bool',
      },
    ];
    input.hypothesis = { values: { paid_amount: 75 } };
    const generate = vi.fn().mockResolvedValue(explanation);
    expect(
      (await simulateWhatIf(input, { agent: { generate } })).ruleOutcome.result,
    ).toBe(false);
  });

  it('includes request-only breach rules when inspecting a referencing confirmation', async () => {
    const input = fixture();
    input.model.rules = [
      {
        type: 'rule',
        id: 'rule.request-deadline',
        kind: 'breach',
        label: '付款期限已过',
        description: '判断付款时限',
        contextRef: 'context.purchase',
        bindings: {
          request: { ref: 'request.payment' },
          asOf: { type: 'timestamp' },
        },
        expression: 'asOf > request.expired_at',
        resultType: 'bool',
      },
    ];
    input.hypothesis = { asOf: '2026-04-02T00:00:00Z' };
    const generate = vi.fn().mockResolvedValue(explanation);
    expect(
      (await simulateWhatIf(input, { agent: { generate } })).ruleOutcome.result,
    ).toBe(true);
  });

  it.each([
    { values: { invented: 50 } },
    { values: { paid_amount: 1.2 } },
    { values: { confirmed_at: 'April 2' } },
    { asOf: '2026-04-02' },
    {},
    { ruleOutcome: { result: true } },
  ])(
    'rejects unsupported hypotheses without asking for an impact explanation: %j',
    async (hypothesis) => {
      const generate = vi.fn().mockResolvedValueOnce(hypothesis);
      await expect(
        simulateWhatIf(fixture(), { agent: { generate } }),
      ).rejects.toThrow();
      expect(generate).toHaveBeenCalledOnce();
    },
  );

  it('refuses missing, future and unrelated dependency facts instead of selecting arbitrary examples', async () => {
    const input = fixture();
    input.hypothesis = { values: { paid_amount: 50 } };
    input.flow = flowFixture([
      { ...input.flow.steps[1]!, basedOn: ['request.payment#missing'] },
    ]);
    const generate = vi.fn().mockResolvedValue(explanation);
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('Missing dependency');
    input.flow = flowFixture(
      fixture().flow.steps.map((step) => ({ ...step, basedOn: [] })),
    );
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('found 0');
    input.flow = flowFixture([
      fixture().flow.steps[1]!,
      { ...fixture().flow.steps[0]!, sequence: 3 },
    ]);
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('must precede');
    expect(generate).not.toHaveBeenCalled();
  });

  it('rejects ambiguous one-bindings, never taking the first of multiple upstream requests', async () => {
    const input = fixture();
    const request = input.flow.steps[0]!;
    input.flow = flowFixture([
      request,
      { ...request, sequence: 2, exampleLabel: 'another' },
      {
        ...input.flow.steps[1]!,
        sequence: 3,
        basedOn: ['request.payment#付款申请', 'request.payment#another'],
      },
    ]);
    input.currentStepSequence = 3;
    input.hypothesis = { values: { paid_amount: 50 } };
    const generate = vi.fn().mockResolvedValue(explanation);
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('found 2');
    expect(generate).not.toHaveBeenCalled();
  });

  it('propagates CEL errors and refuses to fabricate outcomes for unavailable scalar bindings', async () => {
    const input = fixture();
    input.hypothesis = { values: { paid_amount: 50 } };
    input.model.rules[0]!.expression = 'payment.missing > 0';
    const generate = vi.fn().mockResolvedValue(explanation);
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('rule.payment-breach');
    input.model.rules[0]!.bindings.penalty = { type: 'int' };
    input.model.rules[0]!.expression = 'penalty > 0';
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow("missing binding 'penalty'");
    expect(generate).not.toHaveBeenCalled();
  });

  it('rejects a missing step, unrelated rule, and malformed explanation', async () => {
    const input = fixture();
    input.hypothesis = { values: { paid_amount: 50 } };
    const generate = vi
      .fn()
      .mockResolvedValue({ ruleOutcome: { result: false } });
    await expect(
      simulateWhatIf(
        { ...input, currentStepSequence: 99 },
        { agent: { generate } },
      ),
    ).rejects.toThrow('current step');
    await expect(
      simulateWhatIf(
        { ...input, ruleId: 'unrelated' },
        { agent: { generate } },
      ),
    ).rejects.toThrow('No relevant');
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow();
    expect(generate).toHaveBeenCalledOnce();
  });

  it('resolves M1 id/ref dependency aliases and deduplicates an alias plus exact reference', async () => {
    const input = fixture();
    const request = input.flow.steps[0]!;
    Object.assign(request.values, { id: 'request-001', ref: 'payment-claim' });
    input.flow = flowFixture([
      request,
      {
        ...input.flow.steps[1]!,
        basedOn: ['request-001', 'request.payment#付款申请', 'payment-claim'],
      },
    ]);
    input.hypothesis = { values: { paid_amount: 50 } };
    const generate = vi.fn().mockResolvedValue(explanation);
    expect(
      (await simulateWhatIf(input, { agent: { generate } })).ruleOutcomes[1]!
        .result,
    ).toBe(false);
    input.flow = flowFixture([
      request,
      { ...request, sequence: 2, exampleLabel: 'another' },
      { ...input.flow.steps[1]!, sequence: 3, basedOn: ['request-001'] },
    ]);
    input.currentStepSequence = 3;
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('Ambiguous dependency');
    expect(generate).toHaveBeenCalledOnce();
  });

  it('fails explicitly when a modeled derivation is missing or cannot make progress', async () => {
    const input = fixture();
    input.hypothesis = { values: { confirmed_at: '2026-04-02T10:00:00Z' } };
    const amount = input.model.entities
      .find(({ id }) => id === 'confirmation.payment')!
      .attributes!.find(({ name }) => name === 'paid_amount')!;
    amount.derivedByRuleRef = 'rule.missing';
    const generate = vi.fn().mockResolvedValue(explanation);
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('Missing derivation');
    input.model.rules.push({
      type: 'rule',
      id: 'rule.missing',
      kind: 'derivation',
      label: '循环推导',
      description: '无输入的循环推导',
      contextRef: 'context.purchase',
      bindings: { payment: { ref: 'confirmation.payment' } },
      expression: 'payment.paid_amount + 1',
      resultType: 'int',
      target: { entityRef: 'confirmation.payment', attribute: 'paid_amount' },
    });
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('Cannot compute');
    expect(generate).not.toHaveBeenCalled();
  });

  it('snapshots the input before awaiting extraction so editor changes cannot mix revisions', async () => {
    const input = fixture();
    const generate = vi
      .fn()
      .mockImplementationOnce(async () => {
        input.model.rules[0]!.expression = 'false';
        Object.assign(input.flow.steps[0]!.values, {
          expired_at: '2026-04-03T23:59:59Z',
        });
        return { values: { confirmed_at: '2026-04-02T12:00:00Z' } };
      })
      .mockResolvedValueOnce(explanation);
    expect(
      (await simulateWhatIf(input, { agent: { generate } })).ruleOutcome.result,
    ).toBe(true);
  });
});
