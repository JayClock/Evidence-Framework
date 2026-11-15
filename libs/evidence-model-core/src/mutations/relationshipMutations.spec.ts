import { runMutation } from '../testing/runMutation.js';
import type { ModelRecipe } from '../session/types.js';
import { describe, expect, it } from 'vitest';

import type { RelationshipAST } from '@evidence-poc/evidence-schema';

import {
  createRelationshipMutator,
  deleteRelationshipMutator,
  ModelMutationError,
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

const relation = (
  overrides: Partial<RelationshipAST> = {},
): RelationshipAST => ({
  type: 'relationship',
  id: 'relation.seller-plays-seller',
  kind: 'plays_role',
  sourceRef: 'party.seller-sales',
  targetRef: 'role.seller',
  label: '卖方销售扮演卖方',
  ...overrides,
});

describe('createRelationshipMutator', () => {
  it('appends a relationship and exposes both endpoints', () => {
    const document = base();
    const snapshot = structuredClone(document);
    const outcome = runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
      createRelationshipMutator(draft, relation()),
    );

    expect(document).toEqual(snapshot);
    expect(outcome.document.relationships).toHaveLength(7);
    expect(new Set(outcome.affectedIds)).toEqual(
      new Set([
        'relation.seller-plays-seller',
        'party.seller-sales',
        'role.seller',
      ]),
    );
  });

  it('accepts every supported plays_role pair', () => {
    const document = base();

    expect(() =>
      runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
        createRelationshipMutator(draft, relation()),
      ),
    ).not.toThrow();
    expect(() =>
      runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
        createRelationshipMutator(draft, {
          ...relation(),
          id: 'relation.product-plays-item',
          sourceRef: 'thing.product',
          targetRef: 'role.catalogue-item',
        }),
      ),
    ).not.toThrow();
    const docWithEvidenceRole = {
      ...document,
      entities: [
        ...document.entities,
        {
          type: 'entity' as const,
          id: 'role.payment-evidence',
          label: '支付凭证角色',
          category: 'role' as const,
          kind: 'evidence' as const,
          contextRef: 'context.procurement',
        },
      ],
    };

    expect(() =>
      runMutation(docWithEvidenceRole, (draft: Parameters<ModelRecipe>[0]) =>
        createRelationshipMutator(draft, {
          type: 'relationship',
          id: 'relation.contract-plays-evidence-role',
          kind: 'plays_role',
          sourceRef: 'contract.procurement',
          targetRef: 'role.payment-evidence',
          label: '时刻合约扮演凭证角色',
        }),
      ),
    ).not.toThrow();
  });

  it('rejects invalid plays_role pairs', () => {
    const document = base();

    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          createRelationshipMutator(
            draft,
            relation({ targetRef: 'role.catalogue-item' }),
          ),
        ),
      'relationship.endpoint',
    );
    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          createRelationshipMutator(draft, {
            ...relation(),
            id: 'relation.thing-plays-party',
            sourceRef: 'thing.product',
            targetRef: 'role.buyer',
          }),
        ),
      'relationship.endpoint',
    );
  });

  it('rejects self and contract-to-contract relationships', () => {
    const document = base();

    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          createRelationshipMutator(
            draft,
            relation({ targetRef: 'party.seller-sales' }),
          ),
        ),
      'relationship.self',
    );
    document.entities.push({
      type: 'entity',
      id: 'contract.other',
      category: 'evidence',
      kind: 'contract',
      label: '补充协议',
      contextRef: 'context.procurement',
      roleRefs: ['role.buyer', 'role.seller'],
    });

    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          createRelationshipMutator(draft, {
            type: 'relationship',
            id: 'relation.contract-pair',
            kind: 'references',
            sourceRef: 'contract.procurement',
            targetRef: 'contract.other',
            label: '错误连接',
          }),
        ),
      'relationship.endpoint',
    );
  });

  it('rejects duplicate and malformed ids', () => {
    const document = base();

    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          createRelationshipMutator(
            draft,
            relation({ id: 'relation.contract-references-product' }),
          ),
        ),
      'id.duplicate',
    );
    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          createRelationshipMutator(draft, relation({ id: 'Relation.Bad' })),
        ),
      'id.invalid',
    );
  });

  it('is undone by its inverse', () => {
    const document = base();
    const outcome = runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
      createRelationshipMutator(draft, relation()),
    );

    expect(outcome.undo()).toEqual(document);
  });
});

describe('deleteRelationshipMutator', () => {
  it('deletes an existing relationship and restores it on undo', () => {
    const document = base();
    const outcome = runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
      deleteRelationshipMutator(draft, 'relation.contract-references-product'),
    );

    expect(outcome.document.relationships).toHaveLength(5);
    expect(outcome.undo()).toEqual(document);
  });

  it('rejects unknown relationships', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          deleteRelationshipMutator(draft, 'relation.ghost'),
        ),
      'relationship.notFound',
    );
  });
});
