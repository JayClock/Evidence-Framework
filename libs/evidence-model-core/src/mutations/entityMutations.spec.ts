import { runMutation } from '../testing/runMutation.js';
import type { ModelRecipe } from '../session/types.js';
import { describe, expect, it } from 'vitest';

import type {
  EvidenceEntityAST,
  ParticipantEntityAST,
} from '@evidence-poc/evidence-schema';

import {
  createContractMutator,
  createEntityMutator,
  deleteEntityMutator,
  ModelMutationError,
  replaceContextRootsMutator,
  updateEntityMutator,
  entityReferences,
} from '../index.js';
import { createProcurementModel } from '../testing/modelFixture.js';

const base = () => createProcurementModel();

const expectCode = (work: () => unknown, code: string): ModelMutationError => {
  try {
    work();
  } catch (error) {
    expect(error).toBeInstanceOf(ModelMutationError);
    const mutationError = error as ModelMutationError;

    expect(mutationError.code).toBe(code);
    return mutationError;
  }

  throw new Error(`expected mutation to fail with ${code}`);
};

const newThing = (): ParticipantEntityAST => ({
  type: 'entity',
  id: 'thing.service',
  category: 'participant',
  kind: 'thing',
  label: '服务',
  contextRef: 'context.catalogue',
});

describe('createEntityMutator', () => {
  it('appends an entity without mutating the input document', () => {
    const document = base();
    const snapshot = structuredClone(document);
    const entity = newThing();

    const outcome = runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
      createEntityMutator(draft, entity),
    );

    expect(document).toEqual(snapshot);
    expect(outcome.document.entities.at(-1)).toEqual(entity);
    expect(new Set(outcome.affectedIds)).toEqual(new Set(['thing.service']));
    expect(outcome.result).toEqual(entity);
  });

  it('rejects ids outside the grammar and duplicate ids', () => {
    const document = base();

    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          createEntityMutator(draft, { ...newThing(), id: 'Thing.Service' }),
        ),
      'id.invalid',
    );
    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          createEntityMutator(draft, { ...newThing(), id: 'thing.product' }),
        ),
      'id.duplicate',
    );
  });

  it('keeps participant kinds with their required context', () => {
    const document = base();

    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          createEntityMutator(draft, {
            type: 'entity',
            id: 'party.new-agent',
            category: 'participant',
            kind: 'party',
            label: '新经办人',
            contextRef: 'context.procurement',
          }),
        ),
      'participant.contextRef',
    );
    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          createEntityMutator(draft, {
            ...newThing(),
            id: 'thing.raw',
            contextRef: 'context.procurement',
          }),
        ),
      'context.notDomain',
    );
  });

  it('binds roles to an existing context', () => {
    const document = base();

    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          createEntityMutator(draft, {
            type: 'entity',
            id: 'role.ghost',
            category: 'role',
            kind: 'party',
            label: '外部角色',
            contextRef: 'context.ghost',
          }),
        ),
      'entity.notFound',
    );
  });

  it('rejects an evidence moment in the wrong context kind', () => {
    const document = base();

    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          createEntityMutator(draft, {
            type: 'entity',
            id: 'request.refund',
            category: 'evidence',
            kind: 'fulfillment_request',
            label: '退款请求',
            contextRef: 'context.catalogue',
            responsibleRoleRef: 'role.buyer',
          }),
        ),
      'context.responsibility',
    );
  });

  it('checks the kind of a supplied responsible role', () => {
    const document = base();
    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          createEntityMutator(draft, {
            type: 'entity',
            id: 'request.refund',
            category: 'evidence',
            kind: 'fulfillment_request',
            label: '退款请求',
            contextRef: 'context.procurement',
            responsibleRoleRef: 'role.catalogue-item',
          }),
        ),
      'role.notParty',
    );
  });

  it('rejects a Contract with a non-Party Role', () => {
    const document = base();

    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          createEntityMutator(draft, {
            type: 'entity',
            id: 'contract.other',
            category: 'evidence',
            kind: 'contract',
            label: '补充协议',
            contextRef: 'context.procurement',
            roleRefs: ['role.catalogue-item'],
          }),
        ),
      'role.notParty',
    );
  });

  it('requires parent contexts to exist', () => {
    const document = base();

    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          createEntityMutator(draft, {
            type: 'entity',
            id: 'context.ghost',
            category: 'context',
            kind: 'domain',
            label: '幽灵上下文',
            parentContextRef: 'context.ghost',
          }),
        ),
      'entity.notFound',
    );
  });

  it('is undone by its inverse', () => {
    const document = base();
    const outcome = runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
      createEntityMutator(draft, newThing()),
    );
    const restored = { document: outcome.undo() };

    expect(restored.document).toEqual(document);
  });
});

describe('createContractMutator', () => {
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
    const outcome = runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
      createContractMutator(draft, contract()),
    );
    const context = outcome.document.entities.find(
      (entity) => entity.id === 'context.service',
    );

    expect(
      outcome.document.entities.some(
        (entity) => entity.id === 'contract.service',
      ),
    ).toBe(true);
    expect(context).toMatchObject({ rootRefs: ['contract.service'] });
    expect(new Set(outcome.affectedIds)).toEqual(
      new Set(['contract.service', 'context.service']),
    );
  });

  it('refuses a context that already declares roots', () => {
    const document = base();

    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          createContractMutator(draft, {
            ...contract(),
            id: 'contract.second',
            contextRef: 'context.procurement',
            roleRefs: ['role.buyer', 'role.seller'],
          }),
        ),
      'context.rootMissing',
    );
  });

  it('refuses non-contract evidence', () => {
    const document = withEmptyContext();

    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          createContractMutator(draft, {
            ...contract(),
            kind: 'proposal',
          }),
        ),
      'context.responsibility',
    );
  });

  it('is undone by its inverse', () => {
    const document = withEmptyContext();
    const outcome = runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
      createContractMutator(draft, contract()),
    );

    expect(outcome.undo()).toEqual(document);
  });
});

describe('updateEntityMutator', () => {
  it('patches fields and restores them on undo', () => {
    const document = base();
    const outcome = runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
      updateEntityMutator(draft, 'request.payment', {
        label: '付款申请',
      }),
    );

    expect(
      outcome.document.entities.find(
        (entity) => entity.id === 'request.payment',
      )?.label,
    ).toBe('付款申请');
    expect(outcome.undo()).toEqual(document);
  });

  it('deletes a field when the patch value is undefined', () => {
    const document = base();

    document.entities[0]!.notes = '临时说明';

    const outcome = runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
      updateEntityMutator(draft, 'context.procurement', {
        notes: undefined,
      }),
    );

    expect(
      'notes' in
        (outcome.document.entities[0] as unknown as Record<string, unknown>),
    ).toBe(false);
    expect(outcome.undo()).toEqual(document);
  });

  it('rejects immutable and unknown ids', () => {
    const document = base();

    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          updateEntityMutator(draft, 'request.payment', {
            id: 'request.other',
          } as never),
        ),
      'entity.immutableField',
    );
    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          updateEntityMutator(draft, 'request.ghost', { label: 'x' }),
        ),
      'entity.notFound',
    );
  });
});

describe('deleteEntityMutator', () => {
  it('deletes an unreferenced entity and restores it on undo', () => {
    const document = base();

    document.entities.push(newThing());

    const outcome = runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
      deleteEntityMutator(draft, 'thing.service'),
    );

    expect(
      outcome.document.entities.some((entity) => entity.id === 'thing.service'),
    ).toBe(false);
    expect(outcome.undo()).toEqual(document);
  });

  it('refuses to delete a referenced object unless cascading', () => {
    const document = base();
    const error = expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          deleteEntityMutator(draft, 'request.payment'),
        ),
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
    const outcome = runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
      deleteEntityMutator(draft, 'request.payment', {
        cascade: true,
      }),
    );

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
    expect(outcome.undo()).toEqual(document);
  });

  it('still refuses cascade when responsibility depends on the object', () => {
    const document = base();

    expectCode(
      () =>
        runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
          deleteEntityMutator(draft, 'role.seller', { cascade: true }),
        ),
      'entity.referenced',
    );
  });

  it('rejects unknown ids', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          deleteEntityMutator(draft, 'entity.ghost'),
        ),
      'entity.notFound',
    );
  });
});

describe('replaceContextRootsMutator', () => {
  it('replaces roots and restores them on undo', () => {
    const document = base();
    const outcome = runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
      replaceContextRootsMutator(draft, 'context.catalogue', [
        'thing.product',
        'role.catalogue-item',
      ]),
    );

    expect(
      outcome.document.entities.find(
        (entity) => entity.id === 'context.catalogue',
      ),
    ).toMatchObject({ rootRefs: ['thing.product', 'role.catalogue-item'] });
    expect(outcome.undo()).toEqual(document);
  });

  it('rejects unknown roots', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          replaceContextRootsMutator(draft, 'context.catalogue', [
            'thing.ghost',
          ]),
        ),
      'entity.notFound',
    );
  });
});
