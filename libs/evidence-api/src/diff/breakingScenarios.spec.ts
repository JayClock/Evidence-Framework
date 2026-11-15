import { OasdiffRunner } from './oasdiffRunner.js';
import { buildDelivery, buildProjection } from '../projector.js';
import { loadFmFromDocument } from '../adapter/fmAdapter.js';
import { compareContracts } from './compareContracts.js';
import { procurementEvolution } from '../../tests/support/procurement.js';

const spec = () => ({
  openapi: '3.1.0',
  info: { title: 'Orders', version: '1.0.0' },
  paths: {
    '/orders': {
      post: {
        operationId: 'createOrder',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  quantity: { type: 'integer' },
                  note: { type: 'string' },
                },
                required: ['quantity'],
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    amount: { type: 'number' },
                  },
                  required: ['id', 'amount'],
                },
              },
            },
          },
        },
      },
    },
  },
});

it.each([
  'endpoint',
  'required-input',
  'input-type',
  'input-removal',
  'output-removal',
  'output-optional',
])('detects a breaking contract edit: %s', async (change) => {
  const base = spec(),
    target = spec();
  const input =
    target.paths['/orders'].post.requestBody.content['application/json'].schema;
  const output =
    target.paths['/orders'].post.responses['201'].content['application/json']
      .schema;
  if (change === 'endpoint') target.paths = {} as typeof target.paths;
  if (change === 'required-input') input.required.push('note');
  if (change === 'input-type') input.properties.quantity.type = 'string';
  if (change === 'input-removal')
    Reflect.deleteProperty(input.properties, 'note');
  if (change === 'output-removal') {
    Reflect.deleteProperty(output.properties, 'amount');
    output.required = ['id'];
  }
  if (change === 'output-optional') output.required = ['id'];
  const result = await new OasdiffRunner().compare(base, target);
  expect(result.hasBreakingChanges).toBe(true);
  expect(result.changes).toContainEqual(
    expect.objectContaining({
      path: '/orders',
      operation: 'POST',
      level: change === 'input-removal' ? 2 : 3,
    }),
  );
});

it('accepts optional input additions but detects the reverse removal', async () => {
  const target = spec(),
    base = spec();
  Reflect.deleteProperty(
    base.paths['/orders'].post.requestBody.content['application/json'].schema
      .properties,
    'note',
  );
  expect(
    (await new OasdiffRunner().compare(base, target)).hasBreakingChanges,
  ).toBe(false);
  expect(
    (await new OasdiffRunner().compare(target, base)).hasBreakingChanges,
  ).toBe(true);
});

it('detects forbidden caller values when a field becomes derived', async () => {
  const derived = procurementEvolution()[1]!;
  const caller = structuredClone(derived);
  caller.rules = caller.rules.filter((rule) => rule.id !== 'rule.total-amount');
  delete caller.entities
    .find((entity) => entity.id === 'confirmation.payment')!
    .attributes!.find((field) => field.name === 'total_amount')!
    .derivedByRuleRef;
  const comparison = await compareContracts(
    buildDelivery(caller),
    buildDelivery(derived),
  );
  expect(comparison.hasBreakingChanges).toBe(true);
  expect(
    comparison.changes.some(
      (change) => change.text.includes('total_amount') && change.level >= 2,
    ),
  ).toBe(true);
});

it('does not claim that an unchanged OpenAPI proves unchanged CEL semantics', async () => {
  const base = procurementEvolution()[1]!;
  const target = structuredClone(base);
  target.rules.find((rule) => rule.id === 'rule.total-amount')!.expression =
    '99.0';
  const comparison = await compareContracts(
    buildDelivery(base),
    buildDelivery(target),
  );
  expect(comparison.changes).toEqual([]);
  expect(comparison.baseModelDigest).not.toBe(comparison.targetModelDigest);
});

it('uses the final overlay paths rather than the unmodified model surface', async () => {
  const model = procurementEvolution()[0]!;
  const index = loadFmFromDocument(model).index!;
  const target = buildProjection({
    index,
    design: {
      routes: [{ id: 'route.sign.contract.agreement', path: '/agreements' }],
    },
  }).projection;
  expect(
    (await compareContracts(buildDelivery(model), target)).hasBreakingChanges,
  ).toBe(true);
});

it('rejects invalid models and mismatched identities before invoking a process', async () => {
  const base = buildDelivery(procurementEvolution()[0]!);
  const runner = new OasdiffRunner({ binary: '/does/not/exist' });
  await expect(
    compareContracts(base, { ...base, modelId: 'other' }, runner),
  ).rejects.toThrow('API_MODEL_MISMATCH');
  await expect(
    compareContracts(
      base,
      {
        ...base,
        diagnostics: [
          { code: 'INVALID', severity: 'error', message: 'invalid' },
        ],
      },
      runner,
    ),
  ).rejects.toThrow('invalid');
});

it('blocks external references instead of fetching them', async () => {
  const target = spec();
  Object.assign(
    target.paths['/orders'].post.requestBody.content['application/json'],
    { schema: { $ref: 'https://127.0.0.1:1/private.json' } },
  );
  await expect(new OasdiffRunner().compare(spec(), target)).rejects.toThrow();
});
