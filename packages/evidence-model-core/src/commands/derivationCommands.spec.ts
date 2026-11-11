import { describe, expect, it } from 'vitest';

import {
  BindDerivedRuleCommand,
  ModelCommandError,
  assertMandatoryTime,
} from '../index.js';
import { createProcurementModel } from '../../tests/support/modelFixture.js';

const base = () => createProcurementModel();

const expectCode = (work: () => unknown, code: string): void => {
  try {
    work();
  } catch (error) {
    expect(error).toBeInstanceOf(ModelCommandError);
    expect((error as ModelCommandError).code).toBe(code);
    return;
  }

  throw new Error(`expected command to fail with ${code}`);
};

const bind = (attribute = 'requested_minor_units') =>
  new BindDerivedRuleCommand({
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

describe('BindDerivedRuleCommand', () => {
  it('creates the rule and the attribute reference together', () => {
    const document = base();
    const snapshot = structuredClone(document);
    const outcome = bind().apply(document);
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
    expect(outcome.affectedIds).toEqual([
      'rule.requested-amount-derived',
      'request.payment',
    ]);
  });

  it('is undone in one step', () => {
    const document = base();
    const outcome = bind().apply(document);

    expect(outcome.inverse.apply(outcome.document).document).toEqual(document);
  });

  it('refuses to rebind an attribute that already has a derivation', () => {
    const bound = bind().apply(base()).document;

    expectCode(
      () =>
        new BindDerivedRuleCommand({
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
        }).apply(bound),
      'derivation.alreadyBound',
    );
    expectCode(
      () =>
        new BindDerivedRuleCommand({
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
        }).apply(base()),
      'derivation.alreadyBound',
    );
  });

  it('requires the attribute to exist', () => {
    expectCode(() => bind('ghost_attribute').apply(base()), 'attribute.notFound');
  });

  it('rejects entities without a Context', () => {
    expectCode(
      () =>
        new BindDerivedRuleCommand({
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
        }).apply(base()),
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
      () => assertMandatoryTime('request', { id: 'request.payment', attributes: [] }),
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
