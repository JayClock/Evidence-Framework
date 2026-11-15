import { runMutation } from '../testing/runMutation.js';
import type { ModelRecipe } from '../session/types.js';
import { describe, expect, it } from 'vitest';

import {
  bindDerivedRuleMutator,
  ModelMutationError,
  assertMandatoryTime,
} from '../index.js';
import { createProcurementModel } from '../testing/modelFixture.js';

const base = () => createProcurementModel();

const expectCode = (work: () => unknown, code: string): void => {
  try {
    work();
  } catch (error) {
    expect(error).toBeInstanceOf(ModelMutationError);
    expect((error as ModelMutationError).code).toBe(code);
    return;
  }

  throw new Error(`expected mutation to fail with ${code}`);
};

const bind =
  (attribute = 'requested_minor_units') =>
  (draft: Parameters<ModelRecipe>[0]) =>
    bindDerivedRuleMutator(draft, {
      entityRef: 'request.payment',
      attribute,
      rule: {
        id: 'rule.requested-amount-derived',
        label: '请求金额派生',
        description: '按协议数量与约定单价派生请求金额。',
        bindings: { contract: { ref: 'contract.procurement' } },
        expression: 'contract.quantity * 100',
        resultType: 'int',
      },
    });

describe('bindDerivedRuleMutator', () => {
  it('creates the rule and the attribute reference together', () => {
    const document = base();
    const snapshot = structuredClone(document);
    const outcome = runMutation(document, bind());
    const request = outcome.document.entities.find(
      (entity) => entity.id === 'request.payment',
    );
    const rule = outcome.document.rules.find(
      (candidate) => candidate.id === 'rule.requested-amount-derived',
    );

    expect(document).toEqual(snapshot);
    expect(
      request?.attributes?.find(
        (attribute) => attribute.name === 'requested_minor_units',
      )?.derivedByRuleRef,
    ).toBe('rule.requested-amount-derived');
    expect(rule).toMatchObject({
      kind: 'derivation',
      contextRef: 'context.procurement',
      target: {
        entityRef: 'request.payment',
        attribute: 'requested_minor_units',
      },
    });
    expect(new Set(outcome.affectedIds)).toEqual(
      new Set(['rule.requested-amount-derived', 'request.payment']),
    );
  });

  it('is undone in one step', () => {
    const document = base();
    const outcome = runMutation(document, bind());

    expect(outcome.undo()).toEqual(document);
  });

  it('refuses to rebind an attribute that already has a derivation', () => {
    const bound = runMutation(base(), bind()).document;

    expectCode(
      () =>
        runMutation(bound, (draft: Parameters<ModelRecipe>[0]) =>
          bindDerivedRuleMutator(draft, {
            entityRef: 'request.payment',
            attribute: 'requested_minor_units',
            rule: {
              id: 'rule.requested-amount-again',
              label: '重复派生',
              description: '重复派生同一字段。',
              bindings: { contract: { ref: 'contract.procurement' } },
              expression: '1',
              resultType: 'int',
            },
          }),
        ),
      'derivation.alreadyBound',
    );
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          bindDerivedRuleMutator(draft, {
            entityRef: 'contract.procurement',
            attribute: 'total_minor_units',
            rule: {
              id: 'rule.total-again',
              label: '重复派生',
              description: '重复派生同一字段。',
              bindings: { contract: { ref: 'contract.procurement' } },
              expression: '1',
              resultType: 'int',
            },
          }),
        ),
      'derivation.alreadyBound',
    );
  });

  it('requires the attribute to exist', () => {
    expectCode(
      () => runMutation(base(), bind('ghost_attribute')),
      'attribute.notFound',
    );
  });

  it('rejects entities without a Context', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          bindDerivedRuleMutator(draft, {
            entityRef: 'party.buyer-agent',
            attribute: 'anything',
            rule: {
              id: 'rule.party-derived',
              label: '无意义派生',
              description: '外部参与者没有上下文。',
              bindings: {},
              expression: '1',
              resultType: 'int',
            },
          }),
        ),
      'attribute.notFound',
    );
  });
});

describe('assertMandatoryTime', () => {
  it('accepts a required keyData timestamp', () => {
    expect(() =>
      assertMandatoryTime('confirmation', {
        id: 'confirmation.payment',
        attributes: [
          {
            name: 'confirmed_at',
            label: '确认时间',
            meaning: '买方形成确认的业务时间',
            valueType: 'timestamp',
            required: true,
            keyData: true,
          },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects missing or weak business times', () => {
    expectCode(
      () =>
        assertMandatoryTime('request', {
          id: 'request.payment',
          attributes: [],
        }),
      'attribute.time.missing',
    );
    expectCode(
      () =>
        assertMandatoryTime('request', {
          id: 'request.payment',
          attributes: [
            {
              name: 'started_at',
              label: '请求时间',
              meaning: '卖方提出请求的时间',
              valueType: 'timestamp',
              required: true,
              keyData: true,
            },
            {
              name: 'expired_at',
              label: '截止时间',
              meaning: '买方完成付款的截止时间',
              valueType: 'date',
              required: true,
              keyData: true,
            },
          ],
        }),
      'attribute.time.missing',
    );
  });
});
