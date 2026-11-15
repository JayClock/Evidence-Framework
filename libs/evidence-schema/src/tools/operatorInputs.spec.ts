import { describe, expect, it } from 'vitest';
import {
  BreachCompensationIntentSchema,
  DomainCalculatorIntentSchema,
  FulfillmentPairIntentSchema,
  RoleInversionIntentSchema,
} from '../index.js';

const pair = {
  contextRef: 'context.procurement',
  request: {
    id: 'request.refund',
    label: 'Refund',
    responsibleRoleRef: 'role.buyer',
    window: '7 days',
  },
  confirmation: {
    id: 'confirmation.refund',
    label: 'Refunded',
    responsibleRoleRef: 'role.seller',
  },
  proof: { id: 'evidence.receipt', label: 'Receipt' },
};
const calculator = {
  host: {
    ref: 'request.payment',
    attribute: {
      name: 'total_amount',
      label: 'Total',
      meaning: 'computed from price',
      valueType: 'money',
    },
  },
  context: { id: 'context.pricing', label: 'Pricing' },
  calculator: {
    id: 'thing.calculator',
    label: 'Calculator',
    role: 'calculator',
  },
  rule: {
    id: 'rule.price',
    label: 'Price',
    description: 'Price',
    expression: '1',
    resultType: 'money',
    alias: 'calculator',
  },
};

describe('shared operator schemas', () => {
  it('preserves optional fields without adding defaults', () => {
    expect(FulfillmentPairIntentSchema.parse(pair)).toEqual(pair);
    expect(DomainCalculatorIntentSchema.parse(calculator)).toEqual(calculator);
  });
  it('derives the compensation pair from the same moment contract', () => {
    const moments = {
      request: pair.request,
      confirmation: pair.confirmation,
      proof: pair.proof,
    };
    expect(
      BreachCompensationIntentSchema.safeParse({
        ...moments,
        requestRef: 'request.payment',
        confirmationRef: 'confirmation.payment',
        condition: 'missed deadline',
      }).success,
    ).toBe(true);
    expect(
      BreachCompensationIntentSchema.safeParse({
        ...pair,
        requestRef: 'request.payment',
        confirmationRef: 'confirmation.payment',
        condition: 'missed deadline',
      }).success,
    ).toBe(false);
  });
  it.each([
    {
      ...calculator,
      host: {
        ...calculator.host,
        attribute: { ...calculator.host.attribute, name: 'camelCase' },
      },
    },
    {
      ...calculator,
      host: {
        ...calculator.host,
        attribute: { ...calculator.host.attribute, valueType: 'number' },
      },
    },
    {
      ...calculator,
      calculator: { ...calculator.calculator, role: 'invented' },
    },
    { ...calculator, rule: { ...calculator.rule, alias: 'not-a-variable' } },
    { ...calculator, bindings: { 'bad-alias': { ref: 'request.payment' } } },
  ])('rejects values outside the shared AST vocabulary', (input) => {
    expect(DomainCalculatorIntentSchema.safeParse(input).success).toBe(false);
  });
  it('keeps nested role inversion input strict', () => {
    const named = { id: 'sample', label: 'Sample' };
    const intent = {
      targetConfirmationRef: 'confirmation.payment',
      socket: named,
      supporting: {
        context: named,
        contract: named,
        provider: named,
        consumer: named,
        request: named,
        confirmation: named,
      },
    };
    expect(RoleInversionIntentSchema.safeParse(intent).success).toBe(true);
    expect(
      RoleInversionIntentSchema.safeParse({
        ...intent,
        socket: { ...named, extra: true },
      }).success,
    ).toBe(false);
  });
});
