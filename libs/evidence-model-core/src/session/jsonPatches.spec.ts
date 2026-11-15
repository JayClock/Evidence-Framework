import { describe, expect, it, vi } from 'vitest';
import {
  JsonPatchSchema,
  type JsonPatchOperation,
} from '@evidence-poc/evidence-schema';
import {
  applyModelPatches,
  createModelPatch,
  createModelSession,
  introduceFulfillmentPairMutator,
  toJsonPatches,
} from '../index.js';
import { createProcurementModel } from '../testing/modelFixture.js';

const base = () => createProcurementModel();
const subject = () => createModelSession({ document: base() });

describe('RFC 6902 patch transactions', () => {
  it('supports all six operations as one reversible batch', () => {
    const session = subject();
    const before = session.getDocument();
    session.applyPatchBatch(
      [
        { op: 'test', path: '/entities/0/id', value: 'context.procurement' },
        { op: 'add', path: '/entities/0/notes', value: 'added' },
        { op: 'replace', path: '/entities/0/notes', value: 'replaced' },
        { op: 'copy', from: '/entities/0/notes', path: '/entities/1/notes' },
        { op: 'move', from: '/entities/1/notes', path: '/entities/2/notes' },
        { op: 'remove', path: '/entities/0/notes' },
      ],
      'agent:notes',
    );
    const after = session.getDocument();
    expect(after.entities[2].notes).toBe('replaced');
    expect(after.entities[0]).not.toHaveProperty('notes');
    expect(after.entities[1]).not.toHaveProperty('notes');
    expect(session.undo()).toBe(true);
    expect(session.getDocument()).toStrictEqual(before);
    expect(session.canUndo()).toBe(false);
    session.redo();
    expect(session.getDocument()).toStrictEqual(after);
  });

  it('inserts, appends, copies and moves array entries using their evolving indices', () => {
    const session = subject();
    const before = session.getDocument();
    session.applyPatchBatch([
      { op: 'add', path: '/entities/0/rootRefs/0', value: 'thing.product' },
      { op: 'add', path: '/entities/0/rootRefs/-', value: 'role.buyer' },
      {
        op: 'copy',
        from: '/entities/0/rootRefs/0',
        path: '/entities/0/rootRefs/1',
      },
      {
        op: 'move',
        from: '/entities/0/rootRefs/0',
        path: '/entities/0/rootRefs/3',
      },
    ]);
    const context = session.getDocument().entities[0];
    expect(context.category === 'context' && context.rootRefs).toEqual([
      'thing.product',
      'contract.procurement',
      'role.buyer',
      'thing.product',
    ]);
    session.undo();
    expect(session.getDocument()).toStrictEqual(before);
  });

  it('copies objects by value, without aliasing future writes or freezing caller input', () => {
    const session = subject();
    const entity = {
      type: 'entity',
      id: 'party.auditor',
      category: 'participant',
      kind: 'party',
      label: '审计员',
    };
    session.applyPatchBatch([
      { op: 'add', path: '/entities/-', value: entity },
    ]);
    expect(Object.isFrozen(entity)).toBe(false);
    entity.label = 'caller changed';
    expect(session.getDocument().entities.at(-1)?.label).toBe('审计员');
    session.applyPatchBatch([
      {
        op: 'copy',
        from: '/entities/0/rootRefs',
        path: '/manifest/entryContextRefs',
      },
      {
        op: 'replace',
        path: '/manifest/entryContextRefs/0',
        value: 'context.catalogue',
      },
    ]);
    const context = session.getDocument().entities[0];
    expect(context.category === 'context' && context.rootRefs).toEqual([
      'contract.procurement',
    ]);
  });

  it('supports escaped pointer keys and preserves numeric object keys', () => {
    const session = subject();
    const index = session
      .getDocument()
      .entities.findIndex((entity) => entity.id === 'thing.product');
    session.applyPatchBatch([
      {
        op: 'add',
        path: `/entities/${index}/examples`,
        value: [
          { label: '实例', value: { 'a/b~c': { '0': 'old' }, '': true } },
        ],
      },
      {
        op: 'replace',
        path: `/entities/${index}/examples/0/value/a~1b~0c/0`,
        value: 'new',
      },
      { op: 'test', path: `/entities/${index}/examples/0/value/`, value: true },
    ]);
    expect(session.getDocument().entities[index].examples?.[0]?.value).toEqual({
      'a/b~c': { '0': 'new' },
      '': true,
    });
  });

  it('replaces the root even after earlier writes and restores it exactly', () => {
    const session = subject();
    const before = session.getDocument();
    const replacement = base();
    replacement.manifest.name = 'Replacement';
    session.applyPatchBatch([
      { op: 'replace', path: '/entities/0/label', value: 'discarded' },
      { op: 'replace', path: '', value: replacement },
      { op: 'add', path: '/readme', value: 'new root' },
    ]);
    expect(session.getDocument()).toStrictEqual({
      ...replacement,
      readme: 'new root',
    });
    session.undo();
    expect(session.getDocument()).toStrictEqual(before);
  });

  it('treats successful test-only and empty batches as no-ops, retaining redo and cached graph', () => {
    const session = subject();
    session.mutate((draft) => {
      draft.entities[0].label = 'changed';
    });
    session.undo();
    const before = session.getDocument();
    const graph = session.getGraph();
    const listener = vi.fn();
    session.subscribe(listener);
    session.applyPatchBatch([]);
    session.applyPatchBatch([{ op: 'test', path: '', value: before }]);
    expect(session.getDocument()).toBe(before);
    expect(session.getGraph()).toBe(graph);
    expect(session.canRedo()).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it.each([
    [{ op: 'test', path: '/manifest/id', value: 'wrong' }],
    [{ op: 'replace', path: '/entities/9999/label', value: 'bad' }],
    [{ op: 'remove', path: '/missing' }],
    [{ op: 'copy', from: '/missing', path: '/readme' }],
    [{ op: 'move', from: '/entities/0', path: '/entities/0/child' }],
    [{ op: 'replace', path: '/entities', value: null }],
    [{ op: 'remove', path: '' }],
    [{ op: 'add', path: '/entities/9999', value: {} }],
  ] satisfies [JsonPatchOperation][])(
    'rejects invalid batches atomically: %j',
    (operation) => {
      const session = subject();
      session.mutate((draft) => {
        draft.entities[0].label = 'edited';
      });
      session.undo();
      const before = session.getDocument();
      const graph = session.getGraph();
      const listener = vi.fn();
      session.subscribe(listener);
      expect(() =>
        session.applyPatchBatch([
          { op: 'replace', path: '/entities/0/label', value: 'must roll back' },
          operation,
        ]),
      ).toThrow();
      expect(session.getDocument()).toBe(before);
      expect(session.getGraph()).toBe(graph);
      expect(session.canUndo()).toBe(false);
      expect(session.canRedo()).toBe(true);
      expect(listener).not.toHaveBeenCalled();
    },
  );

  it.each(['01', '-1', '+1', '1.0', '4294967296', '-'])(
    'rejects non-RFC array indices on reads: %s',
    (index) => {
      expect(() =>
        applyModelPatches(base(), [
          {
            op: 'test',
            path: `/entities/${index}/id`,
            value: 'context.procurement',
          },
        ]),
      ).toThrow();
    },
  );

  it('rejects a move destination that is out of bounds after removal', () => {
    const document = base();
    expect(() =>
      applyModelPatches(document, [
        {
          op: 'move',
          from: '/entities/0',
          path: `/entities/${document.entities.length}`,
        },
      ]),
    ).toThrow();
  });

  it('rejects inherited properties as existing locations', () => {
    expect(() =>
      applyModelPatches(base(), [
        { op: 'copy', from: '/manifest/toString', path: '/readme' },
      ]),
    ).toThrow();
  });
});

describe('operator patch generation and preview', () => {
  it('generates serializable standard patches that reproduce a domain operator in a remote session', () => {
    const document = base();
    const snapshot = structuredClone(document);
    const patch = createModelPatch(document, (draft) =>
      introduceFulfillmentPairMutator(draft, {
        contextRef: 'context.procurement',
        request: {
          id: 'request.refund',
          label: '退款请求',
          responsibleRoleRef: 'role.buyer',
        },
        confirmation: {
          id: 'confirmation.refund',
          label: '退款确认',
          responsibleRoleRef: 'role.seller',
        },
      }),
    );
    expect(document).toStrictEqual(snapshot);
    expect(
      JsonPatchSchema.safeParse(JSON.parse(JSON.stringify(patch.patches)))
        .success,
    ).toBe(true);
    const preview = applyModelPatches(document, patch.patches);
    const remote = createModelSession({ document });
    remote.applyPatchBatch(patch.patches);
    expect(remote.getDocument()).toStrictEqual(preview);
    expect(patch.result.createdIds).toEqual([
      'request.refund',
      'confirmation.refund',
    ]);
    remote.undo();
    expect(remote.getDocument()).toStrictEqual(snapshot);
  });

  it('escapes Immer paths and snapshots recipe results', () => {
    expect(
      toJsonPatches([{ op: 'add', path: ['a/b', '~', 0], value: null }]),
    ).toEqual([{ op: 'add', path: '/a~1b/~0/0', value: null }]);
    const document = base();
    const patch = createModelPatch(document, (draft) => ({
      context: draft.entities[0],
    }));
    expect(patch.result.context.id).toBe('context.procurement');
    expect(patch.patches).toEqual([]);
  });
});
