import { describe, expect, it } from 'vitest';
import { JsonPatchItemSchema, ModelPatchRequestSchema } from './jsonPatch.js';

describe('JSON Patch tool/IPC contract', () => {
  it.each([
    { op: 'add', path: '/entities/-', value: { id: 'party.auditor' } },
    { op: 'remove', path: '/entities/0' },
    { op: 'replace', path: '', value: null },
    { op: 'move', path: '/entities/1', from: '/entities/0' },
    { op: 'copy', path: '/readme', from: '/manifest/name' },
    { op: 'test', path: '/manifest/id', value: 'model' },
  ])('accepts a standard operation: $op', (operation) => {
    expect(JsonPatchItemSchema.parse(operation)).toEqual(operation);
  });

  it.each([
    { op: 'replace', path: ['entities', 0, 'label'], value: 'not RFC 6901' },
    { type: 'create-entity', entity: {} },
    { op: '_get', path: '/entities' },
    { op: 'add', path: '/readme' },
    { op: 'replace', path: '/readme', value: undefined },
    { op: 'test', path: '/readme' },
    { op: 'move', path: '/readme' },
    { op: 'copy', path: '/readme', from: [] },
    { op: 'remove', path: 'entities/0' },
    { op: 'remove', path: '/bad~2escape' },
    { op: 'remove', path: '/trailing~' },
    { op: 'add', path: '/readme', value: NaN },
    { op: 'add', path: '/readme', value: Infinity },
    { op: 'add', path: '/readme', value: { nested: undefined } },
    { op: 'add', path: '/readme', value: new Date() },
    { op: 'remove', path: '/__proto__/polluted' },
    { op: 'copy', path: '/readme', from: '/constructor/prototype' },
    { op: 'move', path: '/readme', from: '/manifest/__proto__' },
  ])('rejects a malformed or unsafe operation: %j', (operation) => {
    expect(JsonPatchItemSchema.safeParse(operation).success).toBe(false);
  });

  it('rejects cycles without overflowing and accepts repeated non-cyclic values', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(
      JsonPatchItemSchema.safeParse({
        op: 'add',
        path: '/readme',
        value: cycle,
      }).success,
    ).toBe(false);
    const shared = { name: 'shared' };
    expect(
      JsonPatchItemSchema.safeParse({
        op: 'add',
        path: '/readme',
        value: [shared, shared],
      }).success,
    ).toBe(true);
  });

  it('requires rationale and a non-empty standard batch, with no legacy commands field', () => {
    for (const request of [
      {},
      { rationale: '', patches: [] },
      { rationale: '   ', patches: [{ op: 'remove', path: '/readme' }] },
      { rationale: 'edit', commands: [{ type: 'create-entity' }] },
      { rationale: 'edit', patches: [] },
    ])
      expect(ModelPatchRequestSchema.safeParse(request).success).toBe(false);
    expect(
      ModelPatchRequestSchema.parse({
        rationale: ' edit ',
        patches: [{ op: 'add', path: '/readme', value: 'text' }],
      }).rationale,
    ).toBe('edit');
  });
});
