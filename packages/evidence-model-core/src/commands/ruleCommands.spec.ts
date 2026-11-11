import { describe, expect, it } from 'vitest';

import type { RuleAST } from '@evidence-poc/evidence-schema';

import {
  CreateRuleCommand,
  DeleteRuleCommand,
  ModelCommandError,
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

const completionRule = (
  overrides: Partial<RuleAST> = {},
): RuleAST => ({
  type: 'rule',
  id: 'rule.payment-breach',
  kind: 'breach',
  label: '付款违约判断',
  description: '付款截止时间已过且没有有效付款确认时，付款违约。',
  contextRef: 'context.procurement',
  bindings: {
    request: { ref: 'request.payment' },
    confirmations: { ref: 'confirmation.payment', cardinality: 'many' },
    now: { type: 'timestamp' },
  },
  expression:
    'now > request.expired_at && !confirmations.exists(c, c.confirmed_at <= request.expired_at)',
  resultType: 'bool',
  ...overrides,
});

describe('CreateRuleCommand', () => {
  it('appends a decision rule', () => {
    const document = base();
    const snapshot = structuredClone(document);
    const outcome = new CreateRuleCommand(completionRule()).apply(document);

    expect(document).toEqual(snapshot);
    expect(outcome.document.rules).toHaveLength(3);
    expect(outcome.inverse.apply(outcome.document).document).toEqual(document);
  });

  it('requires boolean result types for decision rules', () => {
    expectCode(
      () =>
        new CreateRuleCommand(
          completionRule({ resultType: 'string' }),
        ).apply(base()),
      'rule.context',
    );
  });

  it('resolves the rule context', () => {
    expectCode(
      () =>
        new CreateRuleCommand(completionRule({ contextRef: 'context.ghost' })).apply(
          base(),
        ),
      'entity.notFound',
    );
    expectCode(
      () =>
        new CreateRuleCommand(
          completionRule({ contextRef: 'request.payment' }),
        ).apply(base()),
      'rule.context',
    );
  });

  it('rejects targets on non-derivation rules', () => {
    expectCode(
      () =>
        new CreateRuleCommand(
          completionRule({
            target: { entityRef: 'request.payment', attribute: 'requested_minor_units' },
          }),
        ).apply(base()),
      'rule.context',
    );
  });

  it('requires derivation targets to be writable', () => {
    expectCode(
      () =>
        new CreateRuleCommand({
          ...completionRule(),
          id: 'rule.broken-derivation',
          kind: 'derivation',
          resultType: 'int',
          target: {
            entityRef: 'contract.procurement',
            attribute: 'total_minor_units',
          },
          expression: '1',
        }).apply(base()),
      'derivation.alreadyBound',
    );
    expectCode(
      () =>
        new CreateRuleCommand({
          ...completionRule(),
          id: 'rule.missing-attribute',
          kind: 'derivation',
          resultType: 'int',
          target: { entityRef: 'contract.procurement', attribute: 'ghost' },
          expression: '1',
        }).apply(base()),
      'attribute.notFound',
    );
    expectCode(
      () => new CreateRuleCommand(completionRule({ resultType: 'int' })).apply(base()),
      'rule.context',
    );
  });

  it('accepts a derivation for an unwritten attribute in the same context', () => {
    const outcome = new CreateRuleCommand({
      ...completionRule(),
      id: 'rule.quantity-check',
      kind: 'derivation',
      resultType: 'int',
      target: { entityRef: 'contract.procurement', attribute: 'quantity' },
      expression: '1',
    }).apply(base());

    expect(outcome.document.rules).toHaveLength(3);
  });

  it('rejects unknown binding ids', () => {
    expectCode(
      () =>
        new CreateRuleCommand(
          completionRule({ bindings: { request: { ref: 'request.ghost' } } }),
        ).apply(base()),
      'rule.context',
    );
  });

  it('rejects duplicate ids', () => {
    expectCode(
      () =>
        new CreateRuleCommand({ ...completionRule(), id: 'rule.payment-completed' }).apply(
          base(),
        ),
      'id.duplicate',
    );
  });
});

describe('DeleteRuleCommand', () => {
  it('deletes an unreferenced rule and restores it on undo', () => {
    const document = base();
    const outcome = new DeleteRuleCommand('rule.payment-completed').apply(document);

    expect(outcome.document.rules).toHaveLength(1);
    expect(outcome.inverse.apply(outcome.document).document).toEqual(document);
  });

  it('refuses to orphan an attribute derivation', () => {
    expectCode(
      () => new DeleteRuleCommand('rule.contract-total').apply(base()),
      'rule.referenced',
    );
  });

  it('cascades by clearing the attribute reference', () => {
    const document = base();
    const outcome = new DeleteRuleCommand('rule.contract-total', {
      cascade: true,
    }).apply(document);
    const contract = outcome.document.entities.find(
      (entity) => entity.id === 'contract.procurement',
    );
    const total = contract?.attributes?.find(
      (attribute) => attribute.name === 'total_minor_units',
    );

    expect(total?.derivedByRuleRef).toBeUndefined();
    expect(outcome.document.rules).toHaveLength(1);
    expect(outcome.inverse.apply(outcome.document).document).toEqual(document);
  });

  it('rejects unknown rule ids', () => {
    expectCode(
      () => new DeleteRuleCommand('rule.ghost').apply(base()),
      'rule.notFound',
    );
  });
});
