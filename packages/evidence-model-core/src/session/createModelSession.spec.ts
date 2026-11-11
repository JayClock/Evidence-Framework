import { describe, expect, it, vi } from 'vitest';

import {
  CreateEntityCommand,
  CreateFulfillmentPairCommand,
  ModelSessionValidationError,
  UpdateEntityCommand,
  createModelSession,
  type ModelCommand,
  type ModelSessionEvent,
} from '../index.js';
import { createProcurementModel } from '../../tests/support/modelFixture.js';

const session = (overrides: Partial<Parameters<typeof createModelSession>[0]> = {}) =>
  createModelSession({ document: createProcurementModel(), ...overrides });

describe('dispatch', () => {
  it('applies a command and exposes the new document', () => {
    const subject = session();

    subject.dispatch(new UpdateEntityCommand('request.payment', { label: '付款申请' }));

    expect(
      subject.getDocument().entities.find((entity) => entity.id === 'request.payment')
        ?.label,
    ).toBe('付款申请');
  });

  it('rebuilds the graph only after the document changes', () => {
    const subject = session();
    const before = subject.getGraph();

    expect(subject.getGraph()).toBe(before);

    subject.dispatch(new UpdateEntityCommand('request.payment', { label: '付款申请' }));

    expect(subject.getGraph()).not.toBe(before);
    expect(subject.getGraph().getEntity('request.payment')?.label).toBe('付款申请');
  });

  it('emits document and history events', () => {
    const subject = session();
    const events: ModelSessionEvent[] = [];

    subject.subscribe((event) => events.push(event));
    subject.dispatch(new UpdateEntityCommand('request.payment', { label: '付款申请' }));

    expect(events).toEqual([
      {
        type: 'document-changed',
        commands: ['update-entity'],
        affectedIds: ['request.payment'],
      },
      { type: 'history-changed', canUndo: true, canRedo: false },
    ]);
  });

  it('stops notifying unsubscribed listeners', () => {
    const subject = session();
    const listener = vi.fn();
    const unsubscribe = subject.subscribe(listener);

    unsubscribe();
    subject.dispatch(new UpdateEntityCommand('request.payment', { label: '付款申请' }));

    expect(listener).not.toHaveBeenCalled();
  });

  it('returns the command result', () => {
    const subject = session();
    const entity = {
      type: 'entity' as const,
      id: 'party.new-agent',
      label: '新经办人',
      category: 'participant' as const,
      kind: 'party' as const,
    };

    expect(subject.dispatch(new CreateEntityCommand(entity))).toEqual(entity);
  });
});

describe('undo and redo', () => {
  it('restores the exact previous document', () => {
    const subject = session();
    const before = structuredClone(subject.getDocument());

    subject.dispatch(new UpdateEntityCommand('request.payment', { label: '付款申请' }));

    expect(subject.canUndo()).toBe(true);
    expect(subject.undo()).toBe(true);
    expect(subject.getDocument()).toEqual(before);
    expect(subject.canUndo()).toBe(false);
    expect(subject.canRedo()).toBe(true);
  });

  it('replays a command on redo', () => {
    const subject = session();

    subject.dispatch(new UpdateEntityCommand('request.payment', { label: '付款申请' }));
    subject.undo();
    expect(subject.redo()).toBe(true);
    expect(
      subject.getDocument().entities.find((entity) => entity.id === 'request.payment')
        ?.label,
    ).toBe('付款申请');
    expect(subject.canRedo()).toBe(false);
  });

  it('drops the redo stack when a new command lands', () => {
    const subject = session();

    subject.dispatch(new UpdateEntityCommand('request.payment', { label: 'A' }));
    subject.undo();
    subject.dispatch(new UpdateEntityCommand('request.payment', { label: 'B' }));

    expect(subject.canRedo()).toBe(false);
  });

  it('survives a long undo/redo chain', () => {
    const subject = session();
    const before = structuredClone(subject.getDocument());

    for (let index = 0; index < 10; index += 1) {
      subject.dispatch(
        new UpdateEntityCommand('request.payment', { label: `label-${index}` }),
      );
    }

    expect(subject.undo()).toBe(true);
    expect(subject.undo()).toBe(true);
    expect(subject.undo()).toBe(true);
    expect(subject.redo()).toBe(true);

    while (subject.undo()) {
      // drain
    }

    expect(subject.getDocument()).toEqual(before);
  });

  it('caps history at the configured limit', () => {
    const subject = session({ historyLimit: 2 });
    const start = structuredClone(subject.getDocument());

    subject.dispatch(new UpdateEntityCommand('request.payment', { label: 'A' }));
    subject.dispatch(new UpdateEntityCommand('request.payment', { label: 'B' }));
    subject.dispatch(new UpdateEntityCommand('request.payment', { label: 'C' }));

    expect(subject.undo()).toBe(true);
    expect(subject.undo()).toBe(true);
    expect(subject.undo()).toBe(false);
    expect(subject.getDocument()).not.toEqual(start);
  });

  it('does nothing on an empty stack', () => {
    const subject = session();

    expect(subject.undo()).toBe(false);
    expect(subject.redo()).toBe(false);
    expect(subject.getDocument()).toEqual(createProcurementModel());
  });
});

describe('dispatchAll', () => {
  it('applies commands as one undo step', () => {
    const subject = session();
    const before = structuredClone(subject.getDocument());
    const results = subject.dispatchAll([
      new UpdateEntityCommand('request.payment', { label: 'A' }),
      new UpdateEntityCommand('confirmation.payment', { label: 'B' }),
    ]);

    expect(results).toHaveLength(2);
    expect(subject.undo()).toBe(true);
    expect(subject.getDocument()).toEqual(before);
    expect(subject.canUndo()).toBe(false);
  });

  it('reports the label and combined affected ids', () => {
    const subject = session();
    const events: ModelSessionEvent[] = [];

    subject.subscribe((event) => events.push(event));
    subject.dispatchAll(
      [
        new UpdateEntityCommand('request.payment', { label: 'A' }),
        new UpdateEntityCommand('confirmation.payment', { label: 'B' }),
      ],
      'batch-label',
    );

    expect(events[0]).toEqual({
      type: 'document-changed',
      commands: ['update-entity', 'update-entity'],
      affectedIds: ['request.payment', 'confirmation.payment'],
    });
  });

  it('does not commit when a command fails midway', () => {
    const subject = session();
    const before = structuredClone(subject.getDocument());

    expect(() =>
      subject.dispatchAll([
        new UpdateEntityCommand('request.payment', { label: 'A' }),
        new UpdateEntityCommand('request.ghost', { label: 'B' }),
      ]),
    ).toThrow();
    expect(subject.getDocument()).toEqual(before);
    expect(subject.canUndo()).toBe(false);
  });
});

describe('validation gate', () => {
  const breakingCommand = (): ModelCommand<unknown> =>
    ({
      type: 'break-model',
      apply: (document) => ({
        document: {
          ...document,
          entities: document.entities.filter(
            (entity) => entity.id !== 'request.payment',
          ),
        },
        inverse: {
          type: 'noop',
          apply: () => ({ document, inverse: {} as never, affectedIds: [], result: null }),
        },
        affectedIds: ['request.payment'],
        result: null,
      }),
    }) as ModelCommand<unknown>;

  it('accepts valid transitions when the gate is on', () => {
    const subject = session({ validateOnDispatch: true });

    expect(() =>
      subject.dispatch(new UpdateEntityCommand('request.payment', { label: 'A' })),
    ).not.toThrow();
    expect(subject.validate().valid).toBe(true);
  });

  it('rejects an invalid document without committing it', () => {
    const subject = session({ validateOnDispatch: true });
    const before = structuredClone(subject.getDocument());

    expect(() => subject.dispatch(breakingCommand())).toThrow(
      ModelSessionValidationError,
    );
    expect(subject.getDocument()).toEqual(before);
    expect(subject.canUndo()).toBe(false);
  });

  it('allows transiently incomplete edits when the gate is off', () => {
    const subject = session();

    expect(() => subject.dispatch(breakingCommand())).not.toThrow();
    expect(subject.validate().valid).toBe(false);
  });

  it('reports issues from validate()', () => {
    const subject = session();

    subject.dispatch(breakingCommand());

    expect(subject.validate().issues.map((issue) => issue.code)).toContain(
      'relationship.endpoint.unresolved',
    );
  });
});

describe('selection', () => {
  it('tracks node and attribute selection', () => {
    const subject = session();
    const events: ModelSessionEvent[] = [];

    subject.subscribe((event) => events.push(event));
    subject.select('request.payment');
    subject.selectAttribute('request.payment', 'requested_minor_units');

    expect(subject.getSelection()).toEqual({
      nodeId: 'request.payment',
      attributeName: 'requested_minor_units',
    });
    expect(events.filter((event) => event.type === 'selection-changed')).toHaveLength(2);
  });

  it('clears the selection when the selected object disappears', () => {
    const subject = session();
    const events: ModelSessionEvent[] = [];

    subject.select('confirmation.payment');
    subject.subscribe((event) => events.push(event));
    subject.dispatchAll([
      new UpdateEntityCommand('confirmation.payment', { label: 'x' }),
    ]);
    subject.dispatch(
      new (class {
        readonly type = 'drop-confirmation';
        apply = (document: ReturnType<typeof subject.getDocument>) => ({
          document: {
            ...document,
            relationships: document.relationships.filter(
              (relationship) =>
                relationship.targetRef !== 'confirmation.payment' &&
                relationship.sourceRef !== 'confirmation.payment',
            ),
            entities: document.entities.filter(
              (entity) => entity.id !== 'confirmation.payment',
            ),
          },
          inverse: {
            type: 'noop',
            apply: () => ({ document, inverse: {} as never, affectedIds: [], result: null }),
          },
          affectedIds: ['confirmation.payment'],
          result: null,
        });
      })(),
    );

    expect(subject.getSelection()).toEqual({ nodeId: null, attributeName: null });
    expect(events.some((event) => event.type === 'selection-changed')).toBe(true);
  });

  it('clears the selection explicitly', () => {
    const subject = session();

    subject.selectAttribute('request.payment', 'started_at');
    subject.clearSelection();

    expect(subject.getSelection()).toEqual({ nodeId: null, attributeName: null });
  });
});

describe('replaceDocument', () => {
  it('replaces the document and undoes back to the previous one', () => {
    const subject = session();
    const before = structuredClone(subject.getDocument());
    const next = createProcurementModel();

    next.manifest.name = '重命名模型';

    subject.replaceDocument(next);

    expect(subject.getDocument().manifest.name).toBe('重命名模型');
    expect(subject.undo()).toBe(true);
    expect(subject.getDocument()).toEqual(before);
  });

  it('can reset history on reload', () => {
    const subject = session();

    subject.dispatch(new UpdateEntityCommand('request.payment', { label: 'A' }));
    subject.replaceDocument(createProcurementModel(), { resetHistory: true });

    expect(subject.canUndo()).toBe(false);
    expect(subject.canRedo()).toBe(false);
  });
});

describe('composite commands through the session', () => {
  it('treats a fulfillment pair as one undo step', () => {
    const subject = session();
    const before = structuredClone(subject.getDocument());

    subject.dispatch(
      new CreateFulfillmentPairCommand({
        contextRef: 'context.procurement',
        request: {
          id: 'request.delivery',
          label: '发货请求',
          responsibleRoleRef: 'role.seller',
          attributes: [
            {
              name: 'started_at',
              label: '请求时间',
              meaning: '卖方提出发货请求的业务时间',
              valueType: 'timestamp',
              required: true,
              keyData: true,
            },
            {
              name: 'expired_at',
              label: '截止时间',
              meaning: '卖方完成发货的截止时间',
              valueType: 'timestamp',
              required: true,
              keyData: true,
            },
          ],
        },
        confirmation: {
          id: 'confirmation.delivery',
          label: '收货确认',
          responsibleRoleRef: 'role.buyer',
          attributes: [
            {
              name: 'confirmed_at',
              label: '确认时间',
              meaning: '买方形成收货确认的业务时间',
              valueType: 'timestamp',
              required: true,
              keyData: true,
            },
          ],
        },
      }),
    );

    expect(subject.getDocument().entities).toHaveLength(14);
    expect(subject.undo()).toBe(true);
    expect(subject.getDocument()).toEqual(before);
  });
});
