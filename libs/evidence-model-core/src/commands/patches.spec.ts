import { describe, expect, it } from 'vitest';

import type { EntityAST } from '@evidence-poc/evidence-schema';

import { createModelSession } from '../session/createModelSession.js';
import { createProcurementModel } from '../testing/modelFixture.js';
import {
  ModelPatchError,
  decodeModelPatch,
  decodeModelPatchCommand,
} from './patches.js';

const newParticipant = (): EntityAST => ({
  type: 'entity',
  id: 'party.auditor',
  category: 'participant',
  kind: 'party',
  label: '审计员',
});

describe('decodeModelPatchCommand', () => {
  it('decodes every declared command type', () => {
    const model = createProcurementModel();
    const request = model.entities.find(
      (entity) => entity.id === 'request.payment',
    );

    const types = [
      { type: 'create-entity', entity: newParticipant() },
      {
        type: 'create-contract',
        entity: {
          type: 'entity',
          id: 'contract.other',
          category: 'evidence',
          kind: 'contract',
          label: '另一份合同',
          contextRef: 'context.procurement',
          roleRefs: ['role.buyer', 'role.seller'],
        },
      },
      { type: 'update-entity', entityId: 'party.buyer-agent', patch: {} },
      { type: 'delete-entity', entityId: 'party.buyer-agent' },
      {
        type: 'replace-context-roots',
        contextId: 'context.procurement',
        rootRefs: ['contract.procurement'],
      },
      {
        type: 'create-relationship',
        relationship: {
          id: 'relation.audit',
          type: 'relationship',
          kind: 'references',
          from: 'contract.procurement',
          to: 'contract.procurement',
          label: '引用',
        },
      },
      { type: 'delete-relationship', relationshipId: 'relation.audit' },
      {
        type: 'create-rule',
        rule: model.rules[0] as never,
      },
      { type: 'update-rule', ruleId: model.rules[0]?.id ?? '', patch: {} },
      { type: 'delete-rule', ruleId: model.rules[0]?.id ?? '' },
      {
        type: 'bind-derived-rule',
        input: {
          entityRef: 'contract.procurement',
          attribute: 'total_minor_units',
          ruleId: 'rule.contract-total',
          id: 'rule.contract-total-bound',
          label: '协议总金额',
          contextRef: 'context.procurement',
          meaning: '按约定单价与数量计算',
          cel: 'true',
          bindings: {},
        },
      },
      {
        type: 'create-fulfillment-pair',
        input: {
          contextRef: 'context.procurement',
          request: {
            entity: 'request.payment',
          } as never,
          confirmation: { entity: 'confirmation.payment' } as never,
        },
      },
    ];

    expect(() =>
      types.map((command, index) =>
        decodeModelPatchCommand(command, `commands[${index}]`),
      ),
    ).not.toThrow();
    expect(request).toBeDefined();
  });

  it('keeps the session undoable for a decoded patch', () => {
    const session = createModelSession({ document: createProcurementModel() });
    const before = session.getDocument();

    const commands = decodeModelPatch([
      { type: 'create-entity', entity: newParticipant() },
    ]);

    session.dispatchAll(commands, 'agent:新增审计员');

    expect(
      session.getDocument().entities.some((e) => e.id === 'party.auditor'),
    ).toBe(true);
    expect(session.canUndo()).toBe(true);

    session.undo();

    expect(session.getDocument()).toEqual(before);
  });

  it('rejects non-objects, missing fields and unknown types with a path', () => {
    expect(() => decodeModelPatchCommand('nope')).toThrow(ModelPatchError);
    expect(() => decodeModelPatchCommand({})).toThrow(
      'commands[0].type is required.',
    );
    expect(() =>
      decodeModelPatchCommand({ type: 'create-entity' }, 'commands[2]'),
    ).toThrow('commands[2].entity is required.');
    expect(() => decodeModelPatchCommand({ type: 'drop-table' })).toThrow(
      /not a supported model command/,
    );
  });

  it('reports the index of the failing command in a batch', () => {
    expect(() =>
      decodeModelPatch([
        { type: 'create-entity', entity: newParticipant() },
        { type: 'update-entity' },
      ]),
    ).toThrow('commands[1].entityId is required.');
  });

  it('rejects a payload that is not an array', () => {
    expect(() => decodeModelPatch({ type: 'create-entity' })).toThrow(
      'commands must be an array.',
    );
  });

  it('lets the command guards reject illegal edits', () => {
    const session = createModelSession({ document: createProcurementModel() });
    const commands = decodeModelPatch([
      { type: 'delete-entity', entityId: 'contract.procurement' },
    ]);

    expect(() => session.dispatchAll(commands)).toThrow();
  });
});
