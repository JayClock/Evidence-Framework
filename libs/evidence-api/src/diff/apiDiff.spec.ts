import { diffDomainModels } from '@evidence-poc/evidence-model-core';
import { readModelRoot } from '@evidence-poc/evidence-model-io';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { API_FIXTURES } from '../../tests/support/fixtures.js';
import { buildDelivery } from '../projector.js';
import { buildDeliveryRoutes } from '../delivery/routes.js';
import { diffApiSnapshots, diffModelToApi } from './apiDiff.js';
import { patchDeliveryRoutes } from './patchDeliveryRoutes.js';

const model = async () =>
  (await readModelRoot(`${API_FIXTURES}full-lifecycle/fm`)).bundle;
const addTotal = (document: DomainModelDocument, derived: boolean) => {
  const contract = document.entities.find(
    (entity) => entity.id === 'contract.product-procurement',
  )!;
  contract.attributes!.push({
    name: 'total',
    label: '总额',
    meaning: '合同总额',
    required: true,
    valueType: 'decimal',
    ...(derived ? { derivedByRuleRef: 'rule.total' } : {}),
  });
  if (derived)
    document.rules.push({
      type: 'rule',
      id: 'rule.total',
      kind: 'derivation',
      label: '总额',
      description: '计算总额',
      contextRef: 'context.product-procurement',
      bindings: { contract: { ref: contract.id } },
      target: { entityRef: contract.id, attribute: 'total' },
      resultType: 'decimal',
      expression: 'contract.quantity * 10',
    });
};

it('adds two write operations and a read ledger for a new fulfillment without breaking existing operations', async () => {
  const before = await model(),
    after = structuredClone(before);
  for (const [old, id] of [
    ['request.delivery', 'request.warranty'],
    ['confirmation.delivery', 'confirmation.warranty'],
  ]) {
    const entity = structuredClone(
      after.entities.find((item) => item.id === old)!,
    );
    entity.id = id!;
    after.entities.push(entity);
  }
  for (const [sourceRef, targetRef] of [
    ['request.warranty', 'contract.product-procurement'],
    ['confirmation.warranty', 'request.warranty'],
  ])
    after.relationships.push({
      type: 'relationship',
      id: `relation.${sourceRef}`,
      kind: 'references',
      sourceRef: sourceRef!,
      targetRef: targetRef!,
      label: '凭证前提',
      sourceCardinality: { min: 1, max: 1 },
      targetCardinality: { min: 1, max: 1 },
    });
  const diff = diffModelToApi(before, after);
  expect(
    diff.routes.filter(
      (route) => route.changeType === 'added' && route.method === 'POST',
    ),
  ).toHaveLength(2);
  expect(diff.summary.hasBreakingChanges).toBe(false);
  expect(
    diff.routes.find((route) => route.id === 'route.request.request.warranty')
      ?.path,
  ).toContain('/warranty/request');
  expect(
    diff.routes.find(
      (route) => route.id === 'route.confirm.confirmation.warranty',
    )?.path,
  ).toContain('/warranty/request/confirmation');
  expect(
    patchDeliveryRoutes(
      buildDeliveryRoutes(before),
      diffDomainModels(before, after),
      after,
    ),
  ).toEqual(buildDeliveryRoutes(after));
});

it('tracks input-to-derived transitions and the reverse required-input change', async () => {
  const before = await model(),
    after = structuredClone(before);
  addTotal(before, false);
  addTotal(after, true);
  const diff = diffModelToApi(before, after);
  const sign = diff.routes.find(
    (route) => route.id === 'route.sign.contract.product-procurement',
  )!;
  expect(sign.fieldDiffs).toContainEqual(
    expect.objectContaining({ name: 'total', shifted: 'to_derived' }),
  );
  expect(sign.breakingChanges.map((item) => item.kind)).toContain(
    'INPUT_FIELD_REMOVED',
  );
  const reverse = diffModelToApi(after, before);
  expect(reverse.breakingChanges.map((item) => item.kind)).toContain(
    'REQUIRED_FIELD_ADDED',
  );
  after.rules[after.rules.length - 1]!.expression = 'contract.quantity * 20';
  const originalDerived = structuredClone(after);
  originalDerived.rules[originalDerived.rules.length - 1]!.expression =
    'contract.quantity * 10';
  expect(
    diffModelToApi(originalDerived, after).breakingChanges.map(
      (item) => item.kind,
    ),
  ).toContain('RULE_CHANGED');
});

it('reports deleted routes and changed cardinalities, types and caller roles', async () => {
  const before = await model(),
    after = structuredClone(before);
  after.entities = after.entities.filter(
    (entity) => entity.id !== 'confirmation.payment',
  );
  after.relationships = after.relationships.filter(
    (edge) => edge.sourceRef !== 'confirmation.payment',
  );
  const removed = diffModelToApi(before, after);
  expect(
    removed.routes.filter((route) => route.changeType === 'removed'),
  ).toHaveLength(1);
  expect(removed.breakingChanges.map((item) => item.kind)).toContain(
    'ROUTE_REMOVED',
  );
  const changed = structuredClone(before);
  changed.relationships.find(
    (edge) => edge.id === 'relation.contract-precedes-payment-request',
  )!.sourceCardinality = { min: 0, max: 'many' };
  changed.relationships = changed.relationships.filter(
    (edge) => edge.id !== 'relation.seller-sales-plays-seller',
  );
  changed.entities
    .find((entity) => entity.id === 'contract.product-procurement')!
    .attributes!.find((field) => field.name === 'quantity')!.valueType =
    'string';
  const kinds = diffModelToApi(before, changed).breakingChanges.map(
    (item) => item.kind,
  );
  expect(kinds).toEqual(
    expect.arrayContaining([
      'PATH_CHANGED',
      'CALLER_ROLE_RESTRICTED',
      'FIELD_TYPE_CHANGED',
    ]),
  );
});

it('diffs final overlays and ignores declaration reordering', async () => {
  const before = await model(),
    after = structuredClone(before);
  after.entities.reverse();
  after.relationships.reverse();
  after.rules.reverse();
  for (const entity of after.entities) entity.attributes?.reverse();
  expect(diffModelToApi(before, after).routes).toEqual([]);
  const changed = diffModelToApi(before, before, {
    targetDesign: {
      routes: [
        {
          id: 'route.sign.contract.product-procurement',
          path: '/custom-contracts',
        },
      ],
    },
  });
  expect(changed.breakingChanges.map((item) => item.kind)).toContain(
    'PATH_CHANGED',
  );
  expect(() =>
    diffModelToApi(before, {
      ...before,
      manifest: { ...before.manifest, id: 'other' },
    }),
  ).toThrow('API_MODEL_MISMATCH');
});

it('classifies method, success status, operation identifiers and response field removal', async () => {
  const before = buildDelivery(await model()),
    after = structuredClone(before);
  const route = after.routes.find((item) => item.purpose === 'sign')!;
  route.method = 'GET';
  route.operationId = 'changed';
  route.responses = [{ status: 202, description: 'accepted' }];
  route.outputFields = [];
  expect(
    diffApiSnapshots(before, after).breakingChanges.map((item) => item.kind),
  ).toEqual(
    expect.arrayContaining([
      'METHOD_CHANGED',
      'STATUS_CODE_CHANGED',
      'OPERATION_ID_CHANGED',
      'FIELD_REMOVED_FROM_RESPONSE',
    ]),
  );
});

it('records navigation removals when a dependency moves, without inventing an execution order', async () => {
  const before = await model(),
    after = structuredClone(before);
  after.relationships.find(
    (edge) => edge.id === 'relation.contract-precedes-delivery-request',
  )!.targetRef = 'confirmation.payment';
  const diff = diffModelToApi(before, after);
  expect(diff.hypermediaLinks).toContainEqual(
    expect.objectContaining({
      sourceRouteId: 'route.sign.contract.product-procurement',
      rel: 'next:request.delivery',
      changeType: 'removed',
    }),
  );
  expect(diff.hypermediaLinks).toContainEqual(
    expect.objectContaining({
      sourceRouteId: 'route.confirm.confirmation.payment',
      rel: 'next:request.delivery',
      changeType: 'added',
    }),
  );
});

it('patches affected contexts, including global name collisions, and preserves unrelated route identities', async () => {
  const before = await model(),
    after = structuredClone(before);
  addTotal(after, true);
  const current = buildDeliveryRoutes(before);
  const patched = patchDeliveryRoutes(
    current,
    diffDomainModels(before, after),
    after,
  );
  expect(patched).toEqual(buildDeliveryRoutes(after));
  const unchanged = current.find(
    (route) => route.contextRef === 'context.product-sourcing',
  )!;
  expect(patched.find((route) => route.id === unchanged.id)).toBe(unchanged);
  const collision = structuredClone(before);
  const entity = structuredClone(
    collision.entities.find((item) => item.id === 'request.payment')!,
  );
  entity.id = 'request.aaa.payment';
  collision.entities.push(entity);
  expect(
    patchDeliveryRoutes(
      current,
      diffDomainModels(before, collision),
      collision,
    ),
  ).toEqual(buildDeliveryRoutes(collision));
  expect(() =>
    patchDeliveryRoutes(current, diffDomainModels(before, after), before),
  ).toThrow('API_PATCH_TARGET_MISMATCH');
});
