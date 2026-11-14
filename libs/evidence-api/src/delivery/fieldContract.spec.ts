import { readModelRoot } from '@evidence-poc/evidence-model-io';
import { API_FIXTURES } from '../../tests/support/fixtures.js';
import { buildDeliveryContract } from './modelDelivery.js';
import { buildDeliveryRoutes } from './routes.js';

it('keeps complete response schemas even when GET follows POST and marks server-owned values read-only', async () => {
  const { bundle } = await readModelRoot(`${API_FIXTURES}full-lifecycle/fm`);
  const entity = bundle.entities.find(
    (item) => item.id === 'contract.product-procurement',
  )!;
  entity.attributes!.push({
    name: 'total',
    label: '总额',
    meaning: '计算总额',
    valueType: 'decimal',
    required: true,
    derivedByRuleRef: 'rule.total',
  });
  bundle.rules.push({
    type: 'rule',
    id: 'rule.total',
    kind: 'derivation',
    contextRef: 'context.product-procurement',
    label: '总额',
    description: '数量计算',
    bindings: { contract: { ref: entity.id } },
    expression: 'contract.quantity * 10',
    resultType: 'decimal',
    target: { entityRef: entity.id, attribute: 'total' },
  });
  const routes = buildDeliveryRoutes(bundle);
  const sign = routes.find((route) => route.purpose === 'sign')!;
  const api = buildDeliveryContract(bundle, routes);
  const schema = api.components.schemas['contract_product-procurement'] as {
    properties: Record<string, unknown>;
  };
  expect(schema.properties['quantity']).toBeDefined();
  expect(schema.properties['total']).toMatchObject({
    readOnly: true,
    'x-evidence-derived-by-rule': 'rule.total',
    'x-evidence-caller-input': false,
  });
  expect(schema.properties['signed_at']).toMatchObject({ readOnly: true });
  const operation = api.paths[sign.path]!['post'] as {
    requestBody: {
      content: {
        'application/json': {
          schema: {
            properties: Record<string, unknown>;
            additionalProperties: boolean;
          };
        };
      };
    };
    responses: Record<string, unknown>;
  };
  const input = operation.requestBody.content['application/json'].schema;
  expect(input.properties['total']).toBeUndefined();
  expect(input.properties['signed_at']).toBeUndefined();
  expect(input.additionalProperties).toBe(false);
  expect(operation.responses['201']).toMatchObject({
    headers: { Location: { 'x-evidence-uri-template': sign.itemPath } },
  });
  expect(
    buildDeliveryContract(bundle, [...routes].reverse()).components.schemas[
      'contract_product-procurement'
    ],
  ).toMatchObject({ properties: schema.properties });
});
