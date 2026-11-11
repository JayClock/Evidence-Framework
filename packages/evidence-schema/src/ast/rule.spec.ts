import { describe, expect, it } from 'vitest';

import {
  BOOLEAN_RULE_KINDS,
  isBooleanRuleKind,
  isDerivationRule,
  isRuleBinding,
  isRuleKind,
  ruleTargetsAttribute,
  type RuleAST,
} from '../index.js';

const derivationRule: RuleAST = {
  type: 'rule',
  id: 'rule.payment-amount',
  kind: 'derivation',
  label: '付款金额计算',
  description: '按单价与数量计算应付金额。',
  contextRef: 'context.procurement',
  bindings: {
    request: { ref: 'request.payment' },
    lines: { ref: 'thing.product', cardinality: 'many' },
    taxRate: { type: 'decimal' },
    now: { type: 'timestamp' },
  },
  expression: 'lines.map(l, l.price * l.quantity).sum()',
  resultType: 'money',
  target: {
    entityRef: 'request.payment',
    attribute: 'requested_minor_units',
  },
};

describe('rule kinds', () => {
  it('accepts every declared kind', () => {
    for (const kind of [
      'derivation',
      'precondition',
      'invariant',
      'eligibility',
      'completion',
      'breach',
    ]) {
      expect(isRuleKind(kind)).toBe(true);
    }
  });

  it('rejects unknown kinds', () => {
    expect(isRuleKind('validation')).toBe(false);
    expect(isRuleKind(undefined)).toBe(false);
  });

  it('only treats decision rules as boolean', () => {
    expect(isBooleanRuleKind('completion')).toBe(true);
    expect(isBooleanRuleKind('breach')).toBe(true);
    expect(isBooleanRuleKind('derivation')).toBe(false);
    expect(BOOLEAN_RULE_KINDS).not.toContain('derivation');
  });
});

describe('rule bindings', () => {
  it('accepts a modeled reference', () => {
    expect(isRuleBinding({ ref: 'request.payment' })).toBe(true);
    expect(isRuleBinding({ ref: 'request.payment', cardinality: 'many' })).toBe(
      true,
    );
  });

  it('accepts a runtime value type', () => {
    expect(isRuleBinding({ type: 'timestamp' })).toBe(true);
    expect(isRuleBinding({ type: 'decimal' })).toBe(true);
  });

  it('rejects a binding that mixes both shapes', () => {
    expect(isRuleBinding({ ref: 'request.payment', type: 'timestamp' })).toBe(
      false,
    );
    expect(isRuleBinding({})).toBe(false);
    expect(isRuleBinding({ ref: 'request.payment', cardinality: 'some' })).toBe(
      false,
    );
    expect(isRuleBinding({ type: 'not-a-value-type' })).toBe(false);
    expect(isRuleBinding({ ref: '' })).toBe(false);
  });

  it('validates bindings declared on the rule', () => {
    for (const binding of Object.values(derivationRule.bindings)) {
      expect(isRuleBinding(binding)).toBe(true);
    }
  });
});

describe('derivation targets', () => {
  it('only derivation rules write attributes', () => {
    expect(isDerivationRule(derivationRule)).toBe(true);
    expect(
      isDerivationRule({ ...derivationRule, kind: 'completion' }),
    ).toBe(false);
    expect(isDerivationRule(undefined)).toBe(false);
  });

  it('matches the exact entity and attribute', () => {
    expect(
      ruleTargetsAttribute(
        derivationRule,
        'request.payment',
        'requested_minor_units',
      ),
    ).toBe(true);
    expect(
      ruleTargetsAttribute(derivationRule, 'request.payment', 'paid_minor_units'),
    ).toBe(false);
    expect(
      ruleTargetsAttribute(derivationRule, 'confirmation.payment', 'requested_minor_units'),
    ).toBe(false);
  });
});
