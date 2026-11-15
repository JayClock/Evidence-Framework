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
    { asOf, bindings: { request: { quantity: '10', unit_price: 50 } } },
    { asOf, bindings: { request: {}, unknown: true } },
  ])('refuses incomplete or mistyped activation %j', (input) => {
    expect(() => evaluateRuleOnExample(model, rule, input)).toThrow(
      'rule.amount',
    );
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
