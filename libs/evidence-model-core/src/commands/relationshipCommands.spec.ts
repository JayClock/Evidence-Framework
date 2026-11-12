import { describe, expect, it } from 'vitest';

import type { RelationshipAST } from '@evidence-poc/evidence-schema';

import {
  CreateRelationshipCommand,
  DeleteRelationshipCommand,
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

describe('CreateRelationshipCommand', () => {
  it('appends a relationship and exposes both endpoints', () => {
    const document = base();
    const snapshot = structuredClone(document);
    const outcome = new CreateRelationshipCommand(relation()).apply(document);

    expect(document).toEqual(snapshot);
    expect(outcome.document.relationships).toHaveLength(7);
    expect(outcome.affectedIds).toEqual([
      'relation.seller-plays-seller',
      'party.seller-sales',
      'role.seller',
    ]);
  });

  it('accepts every supported plays_role pair', () => {
    const document = base();

    expect(() =>
      new CreateRelationshipCommand(relation()).apply(document),
    ).not.toThrow();
    expect(() =>
      new CreateRelationshipCommand({
        ...relation(),
        id: 'relation.product-plays-item',
        sourceRef: 'thing.product',
        targetRef: 'role.catalogue-item',
      }).apply(document),
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
      new CreateRelationshipCommand({
        type: 'relationship',
        id: 'relation.contract-plays-evidence-role',
        kind: 'plays_role',
        sourceRef: 'contract.procurement',
        targetRef: 'role.payment-evidence',
        label: '时刻合约扮演凭证角色',
      }).apply(docWithEvidenceRole),
    ).not.toThrow();
  });

  it('rejects invalid plays_role pairs', () => {
    const document = base();

    expectCode(
      () =>
        new CreateRelationshipCommand(
          relation({ targetRef: 'role.catalogue-item' }),
        ).apply(document),
      'relationship.endpoint',
    );
    expectCode(
      () =>
        new CreateRelationshipCommand({
          ...relation(),
          id: 'relation.thing-plays-party',
          sourceRef: 'thing.product',
          targetRef: 'role.buyer',
        }).apply(document),
      'relationship.endpoint',
    );
  });

  it('rejects self and contract-to-contract relationships', () => {
    const document = base();

    expectCode(
      () =>
        new CreateRelationshipCommand(
          relation({ targetRef: 'party.seller-sales' }),
        ).apply(document),
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
        new CreateRelationshipCommand({
          type: 'relationship',
          id: 'relation.contract-pair',
          kind: 'references',
          sourceRef: 'contract.procurement',
          targetRef: 'contract.other',
          label: '错误连接',
        }).apply(document),
      'relationship.endpoint',
    );
  });

  it('rejects duplicate and malformed ids', () => {
    const document = base();

    expectCode(
      () =>
        new CreateRelationshipCommand(
          relation({ id: 'relation.contract-references-product' }),
        ).apply(document),
      'id.duplicate',
    );
    expectCode(
      () =>
        new CreateRelationshipCommand(relation({ id: 'Relation.Bad' })).apply(
          document,
        ),
      'id.invalid',
    );
  });

  it('is undone by its inverse', () => {
    const document = base();
    const outcome = new CreateRelationshipCommand(relation()).apply(document);

    expect(outcome.inverse.apply(outcome.document).document).toEqual(document);
  });
});

describe('DeleteRelationshipCommand', () => {
  it('deletes an existing relationship and restores it on undo', () => {
    const document = base();
    const outcome = new DeleteRelationshipCommand(
      'relation.contract-references-product',
    ).apply(document);

    expect(outcome.document.relationships).toHaveLength(5);
    expect(outcome.inverse.apply(outcome.document).document).toEqual(document);
  });

  it('rejects unknown relationships', () => {
    expectCode(
      () => new DeleteRelationshipCommand('relation.ghost').apply(base()),
      'relationship.notFound',
    );
  });
});
