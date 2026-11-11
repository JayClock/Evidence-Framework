import { describe, expect, it } from 'vitest';

import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import {
  BindBreachRuleCommand,
  PairFulfillmentCommand,
  breachRuleOf,
  completionRuleOf,
} from './fulfillmentPairCommands.js';

const document = (): DomainModelDocument => ({
  manifest: {
    type: 'fm_model',
    schemaVersion: '5.0',
    id: 'fulfillment-pair',
    name: '履约配对夹具（Fulfillment Pair Fixture）',
    version: '1.0.0',
    ruleLanguage: 'CEL',
    entryContextRefs: ['context.procurement'],
  },
  entities: [
    {
      type: 'entity',
      id: 'context.procurement',
      category: 'context',
      kind: 'contract',
      label: '商品采购（Procurement）',
      rootRefs: ['evidence.contract'],
    },
    {
      type: 'entity',
      id: 'context.logistics',
      category: 'context',
      kind: 'contract',
      label: '物流服务（Logistics）',
      rootRefs: [],
    },
    {
      type: 'entity',
      id: 'evidence.contract',
      category: 'evidence',
      kind: 'contract',
      label: '采购协议（Procurement Contract）',
      contextRef: 'context.procurement',
      roleRefs: ['role.buyer', 'role.supplier'],
    },
    {
      type: 'entity',
      id: 'evidence.request',
      category: 'evidence',
      kind: 'fulfillment_request',
      label: '交付请求（Delivery Request）',
      contextRef: 'context.procurement',
      responsibleRoleRef: 'role.supplier',
      attributes: [
        {
          name: 'started_at',
          label: '开始时间（Started At）',
          meaning: '请求方登记。',
          valueType: 'timestamp',
          required: true,
          keyData: true,
        },
        {
          name: 'expired_at',
          label: '截止时间（Expired At）',
          meaning: '合同约定。',
          valueType: 'timestamp',
          required: true,
          keyData: true,
        },
      ],
    },
    {
      type: 'entity',
      id: 'evidence.confirmation',
      category: 'evidence',
      kind: 'fulfillment_confirmation',
      label: '交付确认（Delivery Confirmation）',
      contextRef: 'context.procurement',
      responsibleRoleRef: 'role.buyer',
      attributes: [
        {
          name: 'confirmed_at',
          label: '确认时间（Confirmed At）',
          meaning: '签署确认时登记。',
          valueType: 'timestamp',
          required: true,
          keyData: true,
        },
      ],
    },
    {
      type: 'entity',
      id: 'evidence.foreign-confirmation',
      category: 'evidence',
      kind: 'fulfillment_confirmation',
      label: '外部确认（Foreign Confirmation）',
      contextRef: 'context.logistics',
      responsibleRoleRef: 'role.buyer',
      attributes: [
        {
          name: 'confirmed_at',
          label: '确认时间（Confirmed At）',
          meaning: '签署确认时登记。',
          valueType: 'timestamp',
          required: true,
          keyData: true,
        },
      ],
    },
    {
      type: 'entity',
      id: 'evidence.proof',
      category: 'evidence',
      kind: 'other_evidence',
      label: '物流单据（Shipping Document）',
      contextRef: 'context.procurement',
      responsibleRoleRef: 'role.supplier',
      attributes: [
        {
          name: 'created_at',
          label: '形成时间（Created At）',
          meaning: '承运方开具。',
          valueType: 'timestamp',
          required: true,
          keyData: true,
        },
      ],
    },
    {
      type: 'entity',
      id: 'role.buyer',
      category: 'role',
      kind: 'party',
      label: '采购方（Buyer）',
      contextRef: 'context.procurement',
    },
    {
      type: 'entity',
      id: 'role.supplier',
      category: 'role',
      kind: 'party',
      label: '供应方（Supplier）',
      contextRef: 'context.procurement',
    },
  ],
  relationships: [],
  rules: [],
});

describe('PairFulfillmentCommand', () => {
  it('creates the reference and the completion rule in one step', () => {
    const outcome = new PairFulfillmentCommand({
      requestRef: 'evidence.request',
      confirmationRef: 'evidence.confirmation',
    }).apply(document());

    expect(outcome.document.rules).toHaveLength(1);
    expect(outcome.document.relationships).toHaveLength(1);
    expect(outcome.result.rule).toMatchObject({
      kind: 'completion',
      contextRef: 'context.procurement',
      resultType: 'bool',
      bindings: {
        request: { ref: 'evidence.request' },
        confirmations: { ref: 'evidence.confirmation', cardinality: 'many' },
      },
    });
    expect(completionRuleOf(outcome.document, 'evidence.request')?.id).toBe(
      'rule.evidence.request-completed',
    );

    const restored = outcome.inverse.apply(outcome.document).document;

    expect(restored.rules).toHaveLength(0);
    expect(restored.relationships).toHaveLength(0);
  });

  it('reuses an existing reference instead of duplicating it', () => {
    const withReference: DomainModelDocument = {
      ...document(),
      relationships: [
        {
          type: 'relationship',
          id: 'relation.confirmation-references-request',
          kind: 'references',
          sourceRef: 'evidence.confirmation',
          targetRef: 'evidence.request',
          label: '交付确认回应交付请求',
        },
      ],
    };
    const outcome = new PairFulfillmentCommand({
      requestRef: 'evidence.request',
      confirmationRef: 'evidence.confirmation',
    }).apply(withReference);

    expect(outcome.document.relationships).toHaveLength(1);
    expect(outcome.result.reference).toBeNull();
  });

  it('refuses a supporting proof as the result side', () => {
    expect(() =>
      new PairFulfillmentCommand({
        requestRef: 'evidence.request',
        confirmationRef: 'evidence.proof',
      }).apply(document()),
    ).toThrowError(/not a fulfillment confirmation/);
  });

  it('refuses a confirmation from another contract', () => {
    expect(() =>
      new PairFulfillmentCommand({
        requestRef: 'evidence.request',
        confirmationRef: 'evidence.foreign-confirmation',
      }).apply(document()),
    ).toThrowError(/same Contract Context/);
  });

  it('refuses to decide the same request twice', () => {
    const paired = new PairFulfillmentCommand({
      requestRef: 'evidence.request',
      confirmationRef: 'evidence.confirmation',
    }).apply(document());

    expect(() =>
      new PairFulfillmentCommand({
        requestRef: 'evidence.request',
        confirmationRef: 'evidence.confirmation',
      }).apply(paired.document),
    ).toThrowError(/already decided by rule/);
  });
});

describe('BindBreachRuleCommand', () => {
  const breachRule = {
    id: 'rule.request-breach',
    label: '超期未交付（Late Delivery）',
    description: '请求失效前没有任何交付确认形成。',
    bindings: { request: { ref: 'evidence.request' } },
    expression: '!confirmations.exists(c, c.confirmed_at <= request.expired_at)',
    resultType: 'bool' as const,
  };

  it('adds the breach condition with the request context', () => {
    const outcome = new BindBreachRuleCommand({
      requestRef: 'evidence.request',
      rule: breachRule,
    }).apply(document());

    const rule = breachRuleOf(outcome.document, 'evidence.request');

    expect(rule).toMatchObject({
      id: 'rule.request-breach',
      kind: 'breach',
      contextRef: 'context.procurement',
    });
    expect(rule?.target).toBeUndefined();
  });

  it('requires the rule to bind its request', () => {
    expect(() =>
      new BindBreachRuleCommand({
        requestRef: 'evidence.request',
        rule: { ...breachRule, id: 'rule.unbound', bindings: {} },
      }).apply(document()),
    ).toThrowError(/must bind the request/);
  });

  it('refuses a second breach rule for the same request', () => {
    const bound = new BindBreachRuleCommand({
      requestRef: 'evidence.request',
      rule: breachRule,
    }).apply(document());

    expect(() =>
      new BindBreachRuleCommand({
        requestRef: 'evidence.request',
        rule: { ...breachRule, id: 'rule.request-breach-2' },
      }).apply(bound.document),
    ).toThrowError(/already declares breach rule/);
  });
});
