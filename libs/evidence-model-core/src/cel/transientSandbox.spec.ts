import { describe, expect, it } from 'vitest';
import {
  createEmptyDomainModel,
  type RuleAST,
} from '@evidence-poc/evidence-schema';
import { evaluateRuleOnExample } from './transientSandbox.js';

const model = createEmptyDomainModel({
  id: 'example',
  name: 'Example',
  version: '1.0.0',
  entryContextRefs: [],
});
model.entities.push({
  type: 'entity',
  id: 'request.payment',
  category: 'evidence',
  kind: 'fulfillment_request',
  contextRef: 'context.trade',
  label: 'Payment',
  attributes: [
    {
      name: 'quantity',
      label: 'Quantity',
      meaning: 'Quantity',
      valueType: 'int',
    },
    {
      name: 'unit_price',
      label: 'Price',
      meaning: 'Price',
      valueType: 'decimal',
    },
    {
      name: 'expired_at',
      timeRole: 'deadline',
      label: 'Deadline',
      meaning: 'Deadline',
      valueType: 'timestamp',
    },
  ],
});
const rule: RuleAST = {
  type: 'rule',
  id: 'rule.amount',
  kind: 'derivation',
  label: 'Amount',
  description: 'Amount',
  contextRef: 'context.trade',
  bindings: { request: { ref: 'request.payment' } },
  expression: 'double(request.quantity) * request.unit_price',
  resultType: 'decimal',
};
const asOf = '2026-03-31T10:00:00Z';
const inputs = {
  asOf,
  bindings: { request: { quantity: 10, unit_price: 50 } },
};

describe('transient example oracle', () => {
  it('evaluates deterministically without mutating source facts', () => {
    const before = structuredClone(inputs);
    expect(evaluateRuleOnExample(model, rule, inputs)).toBe(500);
    expect(evaluateRuleOnExample(model, rule, inputs)).toBe(500);
    expect(inputs).toEqual(before);
  });
  it('converts typed timestamps and injects only an explicit clock', () => {
    const clockRule: RuleAST = {
      ...rule,
      kind: 'breach',
      bindings: {
        request: { ref: 'request.payment' },
        now: { type: 'timestamp' },
      },
      expression: 'now > request.expired_at',
      resultType: 'bool',
    };
    expect(
      evaluateRuleOnExample(model, clockRule, {
        asOf,
        bindings: { request: { expired_at: '2026-03-30T10:00:00Z' } },
      }),
    ).toBe(true);
    expect(() =>
      evaluateRuleOnExample(model, clockRule, {
        asOf,
        bindings: { now: '2026-01-01T00:00:00Z', request: {} },
      }),
    ).toThrow('must use asOf');
  });
  it('supports explicit many cardinality', () => {
    expect(
      evaluateRuleOnExample(
        model,
        {
          ...rule,
          bindings: {
            requests: { ref: 'request.payment', cardinality: 'many' },
          },
          expression: 'size(requests)',
          resultType: 'int',
        },
        { asOf, bindings: { requests: [{}, {}] } },
      ),
    ).toBe(2);
  });
  it.each([
    { asOf, bindings: {} },
    { asOf: 'yesterday', bindings: inputs.bindings },
    { asOf, bindings: { request: { quantity: 'ten', unit_price: 50 } } },
    { asOf, bindings: { request: {}, unknown: true } },
  ])('refuses incomplete or mistyped activation %j', (input) => {
    expect(() => evaluateRuleOnExample(model, rule, input)).toThrow(
      'rule.amount',
    );
  });
  it.each([
    ['9007199254740991', 9007199254740991],
    ['9007199254740992', '9007199254740992'],
    ['1857392817294827136', '1857392817294827136'],
    ['-9223372036854775808', '-9223372036854775808'],
    ['9223372036854775807', '9223372036854775807'],
  ])(
    'round-trips exact int64 JSON input %s through entity attributes',
    (quantity, expected) => {
      const input = { asOf, bindings: { request: { quantity } } };
      expect(
        evaluateRuleOnExample(
          model,
          {
            ...rule,
            expression: 'request.quantity',
            resultType: 'int',
          },
          input,
        ),
      ).toBe(expected);
      expect(input.bindings.request.quantity).toBe(quantity);
    },
  );

  it('uses bigint arithmetic rather than silently rounding wide integers', () => {
    expect(
      evaluateRuleOnExample(
        model,
        {
          ...rule,
          expression: 'request.quantity + 1',
          resultType: 'int',
        },
        { asOf, bindings: { request: { quantity: '1857392817294827136' } } },
      ),
    ).toBe('1857392817294827137');
  });

  it('converts scalar uint bindings to native unsigned CEL values', () => {
    expect(
      evaluateRuleOnExample(
        model,
        {
          ...rule,
          bindings: { count: { type: 'uint' } },
          expression: 'count - 1u',
          resultType: 'uint',
        },
        { asOf, bindings: { count: '18446744073709551615' } },
      ),
    ).toBe('18446744073709551614');
  });

  it('consumes native durations and serializes nanosecond precision', () => {
    expect(
      evaluateRuleOnExample(
        model,
        {
          ...rule,
          bindings: { elapsed: { type: 'duration' } },
          expression: 'elapsed + duration("1ns")',
          resultType: 'duration',
        },
        { asOf, bindings: { elapsed: '1ms' } },
      ),
    ).toBe('0.001000001s');
    expect(
      evaluateRuleOnExample(
        model,
        {
          ...rule,
          bindings: { now: { type: 'timestamp' }, delay: { type: 'duration' } },
          expression: 'now + delay',
          resultType: 'timestamp',
        },
        { asOf, bindings: { delay: '30m' } },
      ),
    ).toBe('2026-03-31T10:30:00Z');
  });

  it.each([9007199254740992, '9223372036854775808', '1.5', '01'])(
    'refuses unsafe or invalid integer input %s before conversion',
    (quantity) => {
      expect(() =>
        evaluateRuleOnExample(model, rule, {
          asOf,
          bindings: { request: { quantity, unit_price: 1 } },
        }),
      ).toThrow('request.quantity must be an integer');
    },
  );

  it('serializes nested CEL integer results as JSON and never mutates source collections', () => {
    const input = {
      asOf,
      bindings: {
        requests: [{ quantity: 2 }, { quantity: '1857392817294827136' }],
      },
    };
    const before = structuredClone(input);
    const value = evaluateRuleOnExample(
      model,
      {
        ...rule,
        bindings: { requests: { ref: 'request.payment', cardinality: 'many' } },
        expression: 'requests.map(r, {"quantity": r.quantity})',
        resultType: 'list',
      },
      input,
    );
    expect(value).toEqual([
      { quantity: 2 },
      { quantity: '1857392817294827136' },
    ]);
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
    expect(input).toEqual(before);
  });

  it('refuses invalid CEL and result type mismatches', () => {
    expect(() =>
      evaluateRuleOnExample(
        model,
        { ...rule, expression: 'missing()' },
        inputs,
      ),
    ).toThrow('rule.amount');
    expect(() =>
      evaluateRuleOnExample(model, { ...rule, resultType: 'bool' }, inputs),
    ).toThrow('result must be a boolean');
  });
});
