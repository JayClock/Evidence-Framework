import { readModelRoot } from '@evidence-poc/evidence-model-core';
import { API_FIXTURES } from '../../tests/support/fixtures.js';
import { buildDelivery, buildProjection } from '../projector.js';
import { loadFmFromDocument } from '../adapter/fmAdapter.js';
import { halLinksFor } from './hateoasWeaver.js';

it('moves possible navigation and journeys when a prerequisite changes', async () => {
  const { bundle } = await readModelRoot(`${API_FIXTURES}full-lifecycle/fm`);
  const before = buildDelivery(bundle);
  const changed = {
    ...bundle,
    relationships: bundle.relationships.map((edge) =>
      edge.id === 'relation.contract-precedes-delivery-request'
        ? { ...edge, targetRef: 'confirmation.payment' }
        : edge,
    ),
  };
  const after = buildDelivery(changed);
  const target = 'route.request.request.delivery';
  expect(before.hypermedia).toContainEqual(
    expect.objectContaining({
      sourceRouteId: 'route.sign.contract.product-procurement',
      targetRouteId: target,
    }),
  );
  expect(after.hypermedia).not.toContainEqual(
    expect.objectContaining({
      sourceRouteId: 'route.sign.contract.product-procurement',
      targetRouteId: target,
    }),
  );
  expect(after.hypermedia).toContainEqual(
    expect.objectContaining({
      sourceRouteId: 'route.confirm.confirmation.payment',
      targetRouteId: target,
    }),
  );
  const payment = after.journeys.find(
    (step) => step.routeId === 'route.confirm.confirmation.payment',
  )!;
  const delivery = after.journeys.find((step) => step.routeId === target)!;
  expect(payment.nextPossibleSteps).toContain(delivery.id);
  expect(
    after.hypermedia.some((link) => link.rel.includes('role.payment-proof')),
  ).toBe(false);
});

it('uses final overlay paths, keeps templates explicit, and never fabricates links from an empty graph', async () => {
  const { bundle } = await readModelRoot(`${API_FIXTURES}full-lifecycle/fm`);
  const result = buildProjection({
    index: loadFmFromDocument(bundle).index!,
    design: {
      routes: [
        {
          id: 'route.request.request.delivery',
          path: '/custom/{contractId}/delivery/request',
        },
      ],
    },
  }).projection;
  expect(
    halLinksFor(result.hypermedia, 'route.sign.contract.product-procurement'),
  ).toMatchObject({
    'next:request.delivery': {
      href: '/custom/{contractId}/delivery/request',
      templated: true,
      method: 'POST',
    },
  });
  const empty = buildDelivery({ ...bundle, relationships: [] });
  expect(empty.hypermedia.every((link) => link.rel === 'self')).toBe(true);
  for (const route of result.routes) {
    const responses = (
      result.openapi.paths[route.path]![route.method.toLowerCase()] as {
        responses: Record<string, { content?: Record<string, unknown> }>;
      }
    ).responses;
    for (const response of Object.values(responses))
      if (response.content !== undefined)
        expect(response.content['application/hal+json']).toBeDefined();
  }
});
