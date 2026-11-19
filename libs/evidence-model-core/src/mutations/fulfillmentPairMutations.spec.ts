import { runMutation } from '../testing/runMutation.js';
import type { ModelRecipe } from '../session/types.js';
import { describe, expect, it } from 'vitest';

import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import {
  bindBreachRuleMutator,
  pairFulfillmentMutator,
  breachRuleOf,
  completionRuleOf,
} from './fulfillmentPairMutations.js';

const document = (): DomainModelDocument => ({
  manifest: {
    type: 'fm_model',
    schemaVersion: '6.0',
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
          timeRole: 'start',
          label: '开始时间（Started At）',
          meaning: '请求方登记。',
          valueType: 'timestamp',
          required: true,
          keyData: true,
        },
        {
          name: 'expired_at',
          timeRole: 'deadline',
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
          timeRole: 'occurrence',
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
          timeRole: 'occurrence',
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
          timeRole: 'occurrence',
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

describe('pairFulfillmentMutator', () => {
  it('creates the reference and the completion rule in one step', () => {
    const outcome = runMutation(
      document(),
      (draft: Parameters<ModelRecipe>[0]) =>
        pairFulfillmentMutator(draft, {
          requestRef: 'evidence.request',
          confirmationRef: 'evidence.confirmation',
        }),
    );

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

    const restored = outcome.undo();

    expect(restored.rules).toHaveLength(0);
    expect(restored.relationships).toHaveLength(0);
  });

  it('builds the completion rule from the declared time roles', () => {
    const model = document();
    const rename: Record<string, string> = {
      started_at: 'requested_on',
      expired_at: 'due_by',
      confirmed_at: 'accepted_on',
    };
    for (const entity of model.entities) {
      for (const attr of entity.attributes ?? [])
        attr.name = rename[attr.name] ?? attr.name;
    }
    const { result } = runMutation(model, (draft) =>
      pairFulfillmentMutator(draft, {
        requestRef: 'evidence.request',
        confirmationRef: 'evidence.confirmation',
      }),
    );
    expect(result.rule.expression).toBe(
      'confirmations.exists(c, c.accepted_on >= request.requested_on && c.accepted_on <= request.due_by)',
    );
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
    const outcome = runMutation(
      withReference,
      (draft: Parameters<ModelRecipe>[0]) =>
        pairFulfillmentMutator(draft, {
          requestRef: 'evidence.request',
          confirmationRef: 'evidence.confirmation',
        }),
    );

    expect(outcome.document.relationships).toHaveLength(1);
    expect(outcome.result.reference).toBeNull();
  });

  it('refuses a supporting proof as the result side', () => {
    expect(() =>
      runMutation(document(), (draft: Parameters<ModelRecipe>[0]) =>
        pairFulfillmentMutator(draft, {
          requestRef: 'evidence.request',
          confirmationRef: 'evidence.proof',
        }),
      ),
    ).toThrowError(/not a fulfillment confirmation/);
  });

  it('refuses a confirmation from another contract', () => {
    expect(() =>
      runMutation(document(), (draft: Parameters<ModelRecipe>[0]) =>
        pairFulfillmentMutator(draft, {
          requestRef: 'evidence.request',
          confirmationRef: 'evidence.foreign-confirmation',
        }),
      ),
    ).toThrowError(/same Contract Context/);
  });

  it('refuses to decide the same request twice', () => {
    const paired = runMutation(
      document(),
      (draft: Parameters<ModelRecipe>[0]) =>
        pairFulfillmentMutator(draft, {
          requestRef: 'evidence.request',
          confirmationRef: 'evidence.confirmation',
        }),
    );

    expect(() =>
      runMutation(paired.document, (draft: Parameters<ModelRecipe>[0]) =>
        pairFulfillmentMutator(draft, {
          requestRef: 'evidence.request',
          confirmationRef: 'evidence.confirmation',
        }),
      ),
    ).toThrowError(/already decided by rule/);
  });
});

describe('bindBreachRuleMutator', () => {
  const breachRule = {
    id: 'rule.request-breach',
    label: '超期未交付（Late Delivery）',
    description: '请求失效前没有任何交付确认形成。',
    bindings: { request: { ref: 'evidence.request' } },
    expression:
      '!confirmations.exists(c, c.confirmed_at <= request.expired_at)',
    resultType: 'bool' as const,
  };

  it('adds the breach condition with the request context', () => {
    const outcome = runMutation(
      document(),
      (draft: Parameters<ModelRecipe>[0]) =>
        bindBreachRuleMutator(draft, {
          requestRef: 'evidence.request',
          rule: breachRule,
        }),
    );

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
      runMutation(document(), (draft: Parameters<ModelRecipe>[0]) =>
        bindBreachRuleMutator(draft, {
          requestRef: 'evidence.request',
          rule: { ...breachRule, id: 'rule.unbound', bindings: {} },
        }),
      ),
    ).toThrowError(/must bind the request/);
  });

  it('refuses a second breach rule for the same request', () => {
    const bound = runMutation(document(), (draft: Parameters<ModelRecipe>[0]) =>
      bindBreachRuleMutator(draft, {
        requestRef: 'evidence.request',
        rule: breachRule,
      }),
    );

    expect(() =>
      runMutation(bound.document, (draft: Parameters<ModelRecipe>[0]) =>
        bindBreachRuleMutator(draft, {
          requestRef: 'evidence.request',
          rule: { ...breachRule, id: 'rule.request-breach-2' },
        }),
      ),
    ).toThrowError(/already declares breach rule/);
  });
});
