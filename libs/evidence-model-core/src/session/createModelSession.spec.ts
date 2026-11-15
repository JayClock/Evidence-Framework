import { describe, expect, it, vi } from 'vitest';
import {
  createModelSession,
  ModelSessionValidationError,
  addAttributeMutator,
  deleteEntityMutator,
  removeAttributeMutator,
  updateEntityMutator,
  type ModelSessionEvent,
} from '../index.js';
import { createProcurementModel } from '../testing/modelFixture.js';

const base = () => createProcurementModel();
const session = (options = {}) =>
  createModelSession({ document: base(), ...options });

describe('mutate', () => {
  it('updates a document immutably, invalidates the cached graph and emits labels and affected ids', () => {
    const subject = session();
    const before = subject.getDocument();
    const graph = subject.getGraph();
    expect(subject.getGraph()).toBe(graph);
    const listener = vi.fn();
    subject.subscribe(listener);
    const result = subject.mutate(
      (draft) =>
        updateEntityMutator(draft, 'request.payment', { label: '付款申请' }),
      'update-entity',
    );
    expect(result.label).toBe('付款申请');
    expect(
      before.entities.find((entity) => entity.id === 'request.payment')?.label,
    ).not.toBe('付款申请');
    expect(subject.getGraph()).not.toBe(graph);
    expect(subject.getDocument().entities[0]).toBe(before.entities[0]);
    expect(listener.mock.calls.map(([event]) => event)).toEqual([
      {
        type: 'document-changed',
        commands: ['update-entity'],
        affectedIds: ['request.payment'],
      },
      { type: 'history-changed', canUndo: true, canRedo: false },
    ]);
  });

  it('snapshots nested draft results instead of leaking revoked proxies', () => {
    const subject = session();
    const result = subject.mutate((draft) => {
      draft.entities[0].label = '新名称';
      return { entity: draft.entities[0], entities: [draft.entities[1]] };
    });
    expect(result.entity.label).toBe('新名称');
    expect(JSON.stringify(result)).toContain('新名称');
  });

  it('treats a closure with several writes as one undo step', () => {
    const subject = session();
    const before = subject.getDocument();
    subject.mutate((draft) => {
      updateEntityMutator(draft, 'request.payment', { label: 'A' });
      updateEntityMutator(draft, 'confirmation.payment', { label: 'B' });
    }, 'pair-labels');
    const after = subject.getDocument();
    expect(subject.undo()).toBe(true);
    expect(subject.getDocument()).toStrictEqual(before);
    expect(subject.canUndo()).toBe(false);
    expect(subject.redo()).toBe(true);
    expect(subject.getDocument()).toStrictEqual(after);
    expect(subject.redo()).toBe(false);
  });

  it('ignores no-ops without events, graph invalidation or redo loss', () => {
    const subject = session();
    subject.mutate((draft) => {
      draft.entities[0].label = 'changed';
    });
    subject.undo();
    const before = subject.getDocument();
    const graph = subject.getGraph();
    const listener = vi.fn();
    subject.subscribe(listener);
    expect(subject.mutate(() => 42)).toBe(42);
    subject.mutate((draft) => {
      draft.entities[0].label = before.entities[0].label;
    });
    expect(subject.getDocument()).toBe(before);
    expect(subject.getGraph()).toBe(graph);
    expect(subject.canRedo()).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it('rolls back recipe exceptions without changing state, selection, history, graph or events', () => {
    const subject = session();
    subject.select('request.payment');
    const before = subject.getDocument();
    const graph = subject.getGraph();
    const listener = vi.fn();
    subject.subscribe(listener);
    expect(() =>
      subject.mutate((draft) => {
        updateEntityMutator(draft, 'request.payment', { label: 'A' });
        updateEntityMutator(draft, 'request.ghost', { label: 'B' });
      }),
    ).toThrow(/unknown entity/);
    expect(subject.getDocument()).toBe(before);
    expect(subject.getGraph()).toBe(graph);
    expect(subject.getSelection().nodeId).toBe('request.payment');
    expect(subject.canUndo()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('unsubscribe stops notifications', () => {
    const subject = session();
    const listener = vi.fn();
    const unsubscribe = subject.subscribe(listener);
    unsubscribe();
    subject.mutate((draft) => {
      draft.entities[0].label = 'changed';
    });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('undo and redo', () => {
  it('returns false on empty history and clears redo after a new edit', () => {
    const subject = session();
    expect(subject.undo()).toBe(false);
    expect(subject.redo()).toBe(false);
    subject.mutate((draft) => {
      draft.entities[0].label = 'A';
    });
    subject.undo();
    subject.mutate((draft) => {
      draft.entities[0].label = 'B';
    });
    expect(subject.canRedo()).toBe(false);
  });

  it.each([1, 3, 100])('caps history at %i steps', (historyLimit) => {
    const subject = session({ historyLimit });
    for (let i = 0; i < historyLimit + 2; i++) {
      subject.mutate((draft) => {
        draft.entities[0].label = String(i);
      });
    }
    for (let i = 0; i < historyLimit; i++) expect(subject.undo()).toBe(true);
    expect(subject.getDocument().entities[0].label).toBe('1');
    expect(subject.undo()).toBe(false);
    for (let i = 0; i < historyLimit; i++) expect(subject.redo()).toBe(true);
    expect(subject.redo()).toBe(false);
  });

  it('round-trips cascading deletion and reports deleted ids, not just shifted indices', () => {
    const subject = session();
    const before = subject.getDocument();
    const listener = vi.fn();
    subject.subscribe(listener);
    subject.mutate(
      (draft) =>
        deleteEntityMutator(draft, 'request.payment', { cascade: true }),
      'delete-entity',
    );
    const event = listener.mock.calls[0][0] as Extract<
      ModelSessionEvent,
      { type: 'document-changed' }
    >;
    expect(event.affectedIds).toContain('request.payment');
    expect(event.affectedIds).toContain('rule.payment-completed');
    expect(event.affectedIds).not.toContain('thing.product');
    const after = subject.getDocument();
    subject.undo();
    expect(subject.getDocument()).toStrictEqual(before);
    subject.redo();
    expect(subject.getDocument()).toStrictEqual(after);
  });

  it('round-trips absent optional fields and original attribute order', () => {
    const subject = session();
    const before = subject.getDocument();
    subject.mutate((draft) => {
      updateEntityMutator(draft, 'thing.product', { notes: 'memo' });
      addAttributeMutator(
        draft,
        'thing.product',
        {
          name: 'memo',
          label: '备注',
          meaning: '用户填写',
          valueType: 'string',
        },
        0,
      );
    });
    subject.undo();
    expect(subject.getDocument()).toStrictEqual(before);
  });
});

describe('static validation', () => {
  it('rejects mutations and patch batches atomically while preserving redo', () => {
    const subject = session({ validateOnDispatch: true });
    subject.mutate((draft) => {
      draft.entities[0].label = 'A';
    });
    subject.undo();
    const before = subject.getDocument();
    const listener = vi.fn();
    subject.subscribe(listener);
    expect(() =>
      subject.mutate((draft) => {
        draft.relationships[0].targetRef = 'entity.ghost';
      }),
    ).toThrow(ModelSessionValidationError);
    expect(() =>
      subject.applyPatchBatch([
        {
          op: 'replace',
          path: '/relationships/0/targetRef',
          value: 'entity.ghost',
        },
      ]),
    ).toThrow(ModelSessionValidationError);
    expect(subject.getDocument()).toBe(before);
    expect(subject.canRedo()).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it('permits progressive edits by default and exposes their diagnostics', () => {
    const subject = session();
    subject.mutate((draft) => {
      draft.relationships[0].targetRef = 'entity.ghost';
    });
    expect(subject.validate().valid).toBe(false);
    subject.undo();
    expect(subject.validate().valid).toBe(true);
  });
});

describe('selection and replacement', () => {
  it('keeps selection outside history and clears removed entities and attributes', () => {
    const subject = session();
    subject.select('thing.product');
    subject.selectAttribute('contract.procurement', 'total_minor_units');
    expect(subject.canUndo()).toBe(false);
    subject.mutate((draft) =>
      removeAttributeMutator(
        draft,
        'contract.procurement',
        'total_minor_units',
        { cascade: true },
      ),
    );
    expect(subject.getSelection()).toEqual({
      nodeId: 'contract.procurement',
      attributeName: null,
    });
    subject.select('request.payment');
    subject.mutate((draft) =>
      deleteEntityMutator(draft, 'request.payment', { cascade: true }),
    );
    expect(subject.getSelection()).toEqual({
      nodeId: null,
      attributeName: null,
    });
    subject.undo();
    expect(subject.getSelection().nodeId).toBe(null);
    subject.clearSelection();
  });

  it('records replacements in history unless reloading with resetHistory', () => {
    const subject = session();
    const before = subject.getDocument();
    const replacement = base();
    replacement.manifest.name = 'Replacement';
    subject.replaceDocument(replacement);
    expect(subject.undo()).toBe(true);
    expect(subject.getDocument()).toStrictEqual(before);
    expect(subject.redo()).toBe(true);
    expect(subject.getDocument()).toStrictEqual(replacement);
    subject.replaceDocument(before, { resetHistory: true });
    expect(subject.canUndo()).toBe(false);
    expect(subject.canRedo()).toBe(false);
  });
});
