import { runMutation } from '../testing/runMutation.js';
import type { ModelRecipe } from '../session/types.js';
import { describe, expect, it } from 'vitest';

import type { RuleAST } from '@evidence-poc/evidence-schema';

import {
  createRuleMutator,
  deleteRuleMutator,
  ModelMutationError,
  updateRuleMutator,
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

const completionRule = (overrides: Partial<RuleAST> = {}): RuleAST => ({
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

describe('createRuleMutator', () => {
  it('appends a decision rule', () => {
    const document = base();
    const snapshot = structuredClone(document);
    const outcome = runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
      createRuleMutator(draft, completionRule()),
    );

    expect(document).toEqual(snapshot);
    expect(outcome.document.rules).toHaveLength(3);
    expect(outcome.undo()).toEqual(document);
  });

  it('requires boolean result types for decision rules', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          createRuleMutator(draft, completionRule({ resultType: 'string' })),
        ),
      'rule.context',
    );
  });

  it('resolves the rule context', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          createRuleMutator(
            draft,
            completionRule({ contextRef: 'context.ghost' }),
          ),
        ),
      'entity.notFound',
    );
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          createRuleMutator(
            draft,
            completionRule({ contextRef: 'request.payment' }),
          ),
        ),
      'rule.context',
    );
  });

  it('rejects targets on non-derivation rules', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          createRuleMutator(
            draft,
            completionRule({
              target: {
                entityRef: 'request.payment',
                attribute: 'requested_minor_units',
              },
            }),
          ),
        ),
      'rule.context',
    );
  });

  it('requires derivation targets to be writable', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          createRuleMutator(draft, {
            ...completionRule(),
            id: 'rule.broken-derivation',
            kind: 'derivation',
            resultType: 'int',
            target: {
              entityRef: 'contract.procurement',
              attribute: 'total_minor_units',
            },
            expression: '1',
          }),
        ),
      'derivation.alreadyBound',
    );
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          createRuleMutator(draft, {
            ...completionRule(),
            id: 'rule.missing-attribute',
            kind: 'derivation',
            resultType: 'int',
            target: { entityRef: 'contract.procurement', attribute: 'ghost' },
            expression: '1',
          }),
        ),
      'attribute.notFound',
    );
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          createRuleMutator(draft, completionRule({ resultType: 'int' })),
        ),
      'rule.context',
    );
  });

  it('accepts a derivation for an unwritten attribute in the same context', () => {
    const outcome = runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
      createRuleMutator(draft, {
        ...completionRule(),
        id: 'rule.quantity-check',
        kind: 'derivation',
        resultType: 'int',
        target: { entityRef: 'contract.procurement', attribute: 'quantity' },
        expression: '1',
      }),
    );

    expect(outcome.document.rules).toHaveLength(3);
  });

  it('rejects unknown binding ids', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          createRuleMutator(
            draft,
            completionRule({ bindings: { request: { ref: 'request.ghost' } } }),
          ),
        ),
      'rule.context',
    );
  });

  it('rejects duplicate ids', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          createRuleMutator(draft, {
            ...completionRule(),
            id: 'rule.payment-completed',
          }),
        ),
      'id.duplicate',
    );
  });
});

describe('deleteRuleMutator', () => {
  it('deletes an unreferenced rule and restores it on undo', () => {
    const document = base();
    const outcome = runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
      deleteRuleMutator(draft, 'rule.payment-completed'),
    );

    expect(outcome.document.rules).toHaveLength(1);
    expect(outcome.undo()).toEqual(document);
  });

  it('refuses to orphan an attribute derivation', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          deleteRuleMutator(draft, 'rule.contract-total'),
        ),
      'rule.referenced',
    );
  });

  it('cascades by clearing the attribute reference', () => {
    const document = base();
    const outcome = runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
      deleteRuleMutator(draft, 'rule.contract-total', {
        cascade: true,
      }),
    );
    const contract = outcome.document.entities.find(
      (entity) => entity.id === 'contract.procurement',
    );
    const total = contract?.attributes?.find(
      (attribute) => attribute.name === 'total_minor_units',
    );

    expect(total?.derivedByRuleRef).toBeUndefined();
    expect(outcome.document.rules).toHaveLength(1);
    expect(outcome.undo()).toEqual(document);
  });

  it('rejects unknown rule ids', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          deleteRuleMutator(draft, 'rule.ghost'),
        ),
      'rule.notFound',
    );
  });
});

describe('updateRuleMutator', () => {
  it('edits the expression and description of a saved rule', () => {
    const model = base();
    const contract = model.entities.find(
      ({ id }) => id === 'contract.procurement',
    );

    expect(contract).toBeDefined();

    const outcome = runMutation(model, (draft: Parameters<ModelRecipe>[0]) =>
      updateRuleMutator(draft, 'rule.contract-total', {
        description: '按协议数量与最新约定单价派生协议总金额。',
        expression: 'contract.quantity * 120',
      }),
    );

    expect(outcome.result.expression).toBe('contract.quantity * 120');
    expect(
      outcome.document.rules.find(({ id }) => id === 'rule.contract-total')
        ?.description,
    ).toBe('按协议数量与最新约定单价派生协议总金额。');
    expect(
      outcome.document.entities.find(({ id }) => id === 'contract.procurement'),
    ).toEqual(contract);

    const restored = { document: outcome.undo() };

    expect(restored.document).toEqual(model);
  });

  it('keeps rule identity, kind, context and target immutable', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          updateRuleMutator(draft, 'rule.contract-total', {
            contextRef: 'context.catalogue',
          }),
        ),
      'rule.context',
    );
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          updateRuleMutator(draft, 'rule.contract-total', {
            kind: 'completion',
          }),
        ),
      'rule.context',
    );
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          updateRuleMutator(draft, 'rule.contract-total', {
            target: {
              entityRef: 'contract.procurement',
              attribute: 'quantity',
            },
          }),
        ),
      'rule.context',
    );
  });

  it('rejects unknown rules and non-boolean decisions', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          updateRuleMutator(draft, 'rule.missing', {}),
        ),
      'rule.notFound',
    );
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          updateRuleMutator(draft, 'rule.payment-completed', {
            resultType: 'money',
          }),
        ),
      'rule.context',
    );
  });
});
