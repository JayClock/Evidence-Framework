import { describe, expect, it } from 'vitest';

import type {
  EvidenceEntityAST,
  ParticipantEntityAST,
} from '@evidence-poc/evidence-schema';

import {
  CreateContractCommand,
  CreateEntityCommand,
  DeleteEntityCommand,
  ModelCommandError,
  ReplaceContextRootsCommand,
  UpdateEntityCommand,
  entityReferences,
} from '../index.js';
import { createProcurementModel } from '../../tests/support/modelFixture.js';

const base = () => createProcurementModel();

const expectCode = (work: () => unknown, code: string): ModelCommandError => {
  try {
    work();
  } catch (error) {
    expect(error).toBeInstanceOf(ModelCommandError);
    const commandError = error as ModelCommandError;

    expect(commandError.code).toBe(code);
    return commandError;
  }

  throw new Error(`expected command to fail with ${code}`);
};

const newThing = (): ParticipantEntityAST => ({
  type: 'entity',
  id: 'thing.service',
  category: 'participant',
  kind: 'thing',
  label: '服务',
  contextRef: 'context.catalogue',
});

describe('CreateEntityCommand', () => {
  it('appends an entity without mutating the input document', () => {
    const document = base();
    const snapshot = structuredClone(document);
    const entity = newThing();

    const outcome = new CreateEntityCommand(entity).apply(document);

    expect(document).toEqual(snapshot);
    expect(outcome.document.entities.at(-1)).toEqual(entity);
    expect(outcome.affectedIds).toEqual(['thing.service']);
    expect(outcome.result).toEqual(entity);
  });

  it('rejects ids outside the grammar and duplicate ids', () => {
    const document = base();

    expectCode(
      () =>
        new CreateEntityCommand({ ...newThing(), id: 'Thing.Service' }).apply(
          document,
        ),
      'id.invalid',
    );
    expectCode(
      () =>
        new CreateEntityCommand({ ...newThing(), id: 'thing.product' }).apply(
          document,
        ),
      'id.duplicate',
    );
  });

  it('keeps participant kinds with their required context', () => {
    const document = base();

    expectCode(
      () =>
        new CreateEntityCommand({
          type: 'entity',
          id: 'party.new-agent',
          category: 'participant',
          kind: 'party',
          label: '新经办人',
          contextRef: 'context.procurement',
        }).apply(document),
      'participant.contextRef',
    );
    expectCode(
      () =>
        new CreateEntityCommand({
          ...newThing(),
          id: 'thing.raw',
          contextRef: 'context.procurement',
        }).apply(document),
      'context.notDomain',
    );
  });

  it('binds roles to an existing context', () => {
    const document = base();

    expectCode(
      () =>
        new CreateEntityCommand({
          type: 'entity',
          id: 'role.ghost',
          category: 'role',
          kind: 'party',
          label: '外部角色',
          contextRef: 'context.ghost',
        }).apply(document),
      'entity.notFound',
    );
  });

  it('rejects an evidence moment in the wrong context kind', () => {
    const document = base();

    expectCode(
      () =>
        new CreateEntityCommand({
          type: 'entity',
          id: 'request.refund',
          category: 'evidence',
          kind: 'fulfillment_request',
          label: '退款请求',
          contextRef: 'context.catalogue',
          responsibleRoleRef: 'role.buyer',
        }).apply(document),
      'context.responsibility',
    );
  });

  it('requires a responsible Party Role', () => {
    const document = base();

    expectCode(
      () =>
        new CreateEntityCommand({
          type: 'entity',
          id: 'request.refund',
          category: 'evidence',
          kind: 'fulfillment_request',
          label: '退款请求',
          contextRef: 'context.procurement',
        }).apply(document),
      'context.responsibility',
    );
    expectCode(
      () =>
        new CreateEntityCommand({
          type: 'entity',
          id: 'request.refund',
          category: 'evidence',
          kind: 'fulfillment_request',
          label: '退款请求',
          contextRef: 'context.procurement',
          responsibleRoleRef: 'role.catalogue-item',
        }).apply(document),
      'role.notParty',
    );
  });

  it('rejects a Contract without two Party Roles', () => {
    const document = base();

    expectCode(
      () =>
        new CreateEntityCommand({
          type: 'entity',
          id: 'contract.other',
          category: 'evidence',
          kind: 'contract',
          label: '补充协议',
          contextRef: 'context.procurement',
          roleRefs: ['role.buyer'],
        }).apply(document),
      'role.notParty',
    );
  });

  it('requires parent contexts to exist', () => {
    const document = base();

    expectCode(
      () =>
        new CreateEntityCommand({
          type: 'entity',
          id: 'context.ghost',
          category: 'context',
          kind: 'domain',
          label: '幽灵上下文',
          parentContextRef: 'context.ghost',
        }).apply(document),
      'entity.notFound',
    );
  });

  it('is undone by its inverse', () => {
    const document = base();
    const outcome = new CreateEntityCommand(newThing()).apply(document);
    const restored = outcome.inverse.apply(outcome.document);

    expect(restored.document).toEqual(document);
  });
});

describe('CreateContractCommand', () => {
  const contract = (): EvidenceEntityAST => ({
    type: 'entity',
    id: 'contract.service',
    category: 'evidence',
    kind: 'contract',
    label: '服务协议',
    contextRef: 'context.service',
    roleRefs: ['role.client', 'role.provider'],
  });

  const withEmptyContext = () => {
    const document = base();

    document.entities.push(
      {
        type: 'entity',
        id: 'context.service',
        category: 'context',
        kind: 'contract',
        label: '服务合同上下文',
      },
      {
        type: 'entity',
        id: 'role.client',
        category: 'role',
        kind: 'party',
        label: '委托方',
        contextRef: 'context.service',
      },
      {
        type: 'entity',
        id: 'role.provider',
        category: 'role',
        kind: 'party',
        label: '服务方',
        contextRef: 'context.service',
      },
    );

    return document;
  };

  it('creates the contract and links it as the context root', () => {
    const document = withEmptyContext();
    const outcome = new CreateContractCommand(contract()).apply(document);
    const context = outcome.document.entities.find(
      (entity) => entity.id === 'context.service',
    );

    expect(
      outcome.document.entities.some(
        (entity) => entity.id === 'contract.service',
      ),
    ).toBe(true);
    expect(context).toMatchObject({ rootRefs: ['contract.service'] });
    expect(outcome.affectedIds).toEqual([
      'contract.service',
      'context.service',
    ]);
  });

  it('refuses a context that already declares roots', () => {
    const document = base();

    expectCode(
      () =>
        new CreateContractCommand({
          ...contract(),
          id: 'contract.second',
          contextRef: 'context.procurement',
          roleRefs: ['role.buyer', 'role.seller'],
        }).apply(document),
      'context.rootMissing',
    );
  });

  it('refuses non-contract evidence', () => {
    const document = withEmptyContext();

    expectCode(
      () =>
        new CreateContractCommand({
          ...contract(),
          kind: 'proposal',
        }).apply(document),
      'context.responsibility',
    );
  });

  it('is undone by its inverse', () => {
    const document = withEmptyContext();
    const outcome = new CreateContractCommand(contract()).apply(document);

    expect(outcome.inverse.apply(outcome.document).document).toEqual(document);
  });
});

describe('UpdateEntityCommand', () => {
  it('patches fields and restores them on undo', () => {
    const document = base();
    const outcome = new UpdateEntityCommand('request.payment', {
      label: '付款申请',
    }).apply(document);

    expect(
      outcome.document.entities.find(
        (entity) => entity.id === 'request.payment',
      )?.label,
    ).toBe('付款申请');
    expect(outcome.inverse.apply(outcome.document).document).toEqual(document);
  });

  it('deletes a field when the patch value is undefined', () => {
    const document = base();

    document.entities[0]!.notes = '临时说明';

    const outcome = new UpdateEntityCommand('context.procurement', {
      notes: undefined,
    }).apply(document);

    expect(
      'notes' in
        (outcome.document.entities[0] as unknown as Record<string, unknown>),
    ).toBe(false);
    expect(outcome.inverse.apply(outcome.document).document).toEqual(document);
  });

  it('rejects immutable and unknown ids', () => {
    const document = base();

    expectCode(
      () =>
        new UpdateEntityCommand('request.payment', {
          id: 'request.other',
        } as never).apply(document),
      'entity.immutableField',
    );
    expectCode(
      () =>
        new UpdateEntityCommand('request.ghost', { label: 'x' }).apply(
          document,
        ),
      'entity.notFound',
    );
  });
});

describe('DeleteEntityCommand', () => {
  it('deletes an unreferenced entity and restores it on undo', () => {
    const document = base();

    document.entities.push(newThing());

    const outcome = new DeleteEntityCommand('thing.service').apply(document);

    expect(
      outcome.document.entities.some((entity) => entity.id === 'thing.service'),
    ).toBe(false);
    expect(outcome.inverse.apply(outcome.document).document).toEqual(document);
  });

  it('refuses to delete a referenced object unless cascading', () => {
    const document = base();
    const error = expectCode(
      () => new DeleteEntityCommand('request.payment').apply(document),
      'entity.referenced',
    );

    expect(error.details.join(' ')).toContain(
      'relation.confirmation-references-request',
    );
    expect(
      entityReferences(document, 'request.payment').length,
    ).toBeGreaterThan(0);
  });

  it('cascades removable references in one undo step', () => {
    const document = base();
    const outcome = new DeleteEntityCommand('request.payment', {
      cascade: true,
    }).apply(document);

    expect(
      outcome.document.relationships.some(
        (relationship) => relationship.targetRef === 'request.payment',
      ),
    ).toBe(false);
    expect(
      outcome.document.rules.some(
        (rule) => rule.id === 'rule.payment-completed',
      ),
    ).toBe(false);
    expect(outcome.inverse.apply(outcome.document).document).toEqual(document);
  });

  it('still refuses cascade when responsibility depends on the object', () => {
    const document = base();

    expectCode(
      () =>
        new DeleteEntityCommand('role.seller', { cascade: true }).apply(
          document,
        ),
      'entity.referenced',
    );
  });

  it('rejects unknown ids', () => {
    expectCode(
      () => new DeleteEntityCommand('entity.ghost').apply(base()),
      'entity.notFound',
    );
  });
});

describe('ReplaceContextRootsCommand', () => {
  it('replaces roots and restores them on undo', () => {
    const document = base();
    const outcome = new ReplaceContextRootsCommand('context.catalogue', [
      'thing.product',
      'role.catalogue-item',
    ]).apply(document);

    expect(
      outcome.document.entities.find(
        (entity) => entity.id === 'context.catalogue',
      ),
    ).toMatchObject({ rootRefs: ['thing.product', 'role.catalogue-item'] });
    expect(outcome.inverse.apply(outcome.document).document).toEqual(document);
  });

  it('rejects unknown roots', () => {
    expectCode(
      () =>
        new ReplaceContextRootsCommand('context.catalogue', [
          'thing.ghost',
        ]).apply(base()),
      'entity.notFound',
    );
  });
});
