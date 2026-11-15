import { expect, it } from 'vitest';
import { createDriftInspector, inspectPayloadDrift } from './driftInspector.js';

it('reports nested extra fields, missing required values and types without mutation', () => {
  const payload = { items: [{ 'secret/key': 1, amount: '12' }] };
  const before = structuredClone(payload);
  const report = inspectPayloadDrift(
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'amount'],
            properties: { id: { type: 'string' }, amount: { type: 'number' } },
          },
        },
      },
    },
    payload,
  );
  expect(report.hasDrift).toBe(true);
  expect(report.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'extraneous_field',
        path: '/items/0/secret~1key',
      }),
      expect.objectContaining({
        type: 'missing_required',
        path: '/items/0/id',
      }),
      expect.objectContaining({
        type: 'type_mismatch',
        path: '/items/0/amount',
      }),
    ]),
  );
  expect(payload).toEqual(before);
});
it('honors open maps, nullable values, local refs and composition', () => {
  const inspect = createDriftInspector({
    $defs: { amount: { type: ['number', 'null'] } },
    allOf: [{ properties: { amount: { $ref: '#/$defs/amount' } } }],
    type: 'object',
    unevaluatedProperties: false,
  });
  expect(inspect({ amount: null }).hasDrift).toBe(false);
  expect(inspect({ amount: 12 }).hasDrift).toBe(false);
  expect(inspect({ extra: 1 }).issues[0]?.type).toBe('extraneous_field');
  expect(
    inspectPayloadDrift(
      { type: 'object', additionalProperties: { type: 'integer' } },
      { arbitrary: 1 },
    ).hasDrift,
  ).toBe(false);
  expect(
    inspectPayloadDrift({ type: 'object' }, { arbitrary: 1 }).hasDrift,
  ).toBe(false);
  expect(
    inspectPayloadDrift(
      { oneOf: [{ type: 'string' }, { type: 'integer' }] },
      false,
    ).hasDrift,
  ).toBe(true);
});
it('checks formats and constraints, and fails closed for invalid or remote schemas', () => {
  expect(
    inspectPayloadDrift({ type: 'string', format: 'date-time' }, 'not-a-time')
      .hasDrift,
  ).toBe(true);
  expect(
    inspectPayloadDrift({ type: 'number', minimum: 1 }, 0).issues[0]?.keyword,
  ).toBe('minimum');
  expect(() =>
    createDriftInspector({ $ref: 'https://invalid.test/schema' }),
  ).toThrow();
  expect(() => createDriftInspector({ type: 'not-a-type' })).toThrow();
});
