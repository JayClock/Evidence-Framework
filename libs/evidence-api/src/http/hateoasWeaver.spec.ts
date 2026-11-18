import { readModelRoot } from '@evidence-poc/evidence-model-io';
import { API_FIXTURES } from '../testing/fixtures.js';
import { buildDelivery, buildProjection } from '../projector.js';
import { loadFmFromDocument } from '../adapter/fmAdapter.js';
import { halLinksFor } from './hateoasWeaver.js';
import { procurementEvolution } from '../testing/procurement.js';
import { operationFor } from '../testing/contract.js';

it('keeps branch links, HAL responses and journeys consistent without imposing a sequence', () => {
  const document = procurementEvolution()[3]!;
  const snapshot = buildDelivery(document);
  const paymentId = 'route.confirm.confirmation.payment';
  const links = halLinksFor(snapshot.hypermedia, paymentId);
  expect(Object.keys(links).sort()).toEqual([
    'next:request.delivery',
    'next:request.invoicing',
    'self',
  ]);
  const operation = operationFor(snapshot, paymentId);
  expect(
    operation.responses['201']!.content!['application/hal+json'],
  ).toMatchObject({
    'x-evidence-link-templates': links,
  });
  const routeIds = new Set(snapshot.routes.map((route) => route.id));
  const stepIds = new Set(snapshot.journeys.map((step) => step.id));
  for (const link of snapshot.hypermedia) {
    expect(routeIds.has(link.sourceRouteId)).toBe(true);
    expect(routeIds.has(link.targetRouteId)).toBe(true);
    const target = snapshot.routes.find(
      (route) => route.id === link.targetRouteId,
    )!;
    expect(link.href).toBe(target.path);
    if (link.rel === 'self') expect(target.method).toBe('GET');
  }
  for (const step of snapshot.journeys)
    for (const next of step.nextPossibleSteps)
      expect(stepIds.has(next)).toBe(true);
  // Reversing a modeled dependency changes navigation, not an assumed business order.
  const reversed = structuredClone(document);
  const edge = reversed.relationships.find(
    (edge) =>
      edge.sourceRef === 'request.delivery' &&
      edge.targetRef === 'confirmation.payment',
  )!;
  [edge.sourceRef, edge.targetRef] = [edge.targetRef, edge.sourceRef];
  const changed = buildDelivery(reversed);
  expect(halLinksFor(changed.hypermedia, paymentId)).not.toHaveProperty(
    'next:request.delivery',
  );
  expect(
    halLinksFor(changed.hypermedia, 'route.request.request.delivery'),
  ).toHaveProperty('next:confirmation.payment');
  // A cycle is a valid graph of possibilities; it must terminate deterministically.
  reversed.relationships.push({
    ...edge,
    id: 'relation.cycle',
    sourceRef: 'request.delivery',
    targetRef: 'confirmation.payment',
  });
  const cyclic = buildDelivery(reversed);
  expect(cyclic.journeys).toEqual(buildDelivery(reversed).journeys);
  expect(halLinksFor(cyclic.hypermedia, paymentId)).toHaveProperty(
    'next:request.delivery',
  );
});

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

it('uses GET self links for every creation and signs proposals into the contract primary URI', () => {
  const snapshot = buildDelivery(procurementEvolution()[1]!);
  const sign = snapshot.routes.find((route) =>
    route.id.startsWith('route.sign-from-'),
  )!;
  const proposal = snapshot.routes.find(
    (route) => route.id === 'route.read.proposal.quotation',
  )!;
  expect(
    halLinksFor(snapshot.hypermedia, proposal.id)['next:contract.agreement'],
  ).toMatchObject({ href: sign.path, method: 'POST' });
  expect(halLinksFor(snapshot.hypermedia, sign.id).self).toMatchObject({
    href: '/agreements/{contractId}',
  });
  expect(
    operationFor(snapshot, sign.id).responses['201']!.headers!['Location'],
  ).toMatchObject({ 'x-evidence-uri-template': '/agreements/{contractId}' });
  for (const route of snapshot.routes.filter(
    (route) => route.method === 'POST',
  )) {
    const self = snapshot.hypermedia.find(
      (link) => link.sourceRouteId === route.id && link.rel === 'self',
    )!;
    expect(self).toMatchObject({ method: 'GET', href: route.itemPath });
  }
});

it('keeps creation identities synchronized when the primary GET is overridden', () => {
  const snapshot = buildProjection({
    index: loadFmFromDocument(procurementEvolution()[1]!).index!,
    design: {
      routes: [
        { id: 'route.read.contract.agreement', path: '/signed/{contractId}' },
      ],
    },
  }).projection;
  expect(snapshot.diagnostics).toEqual([]);
  for (const sign of snapshot.routes.filter(
    (route) =>
      route.entityRef === 'contract.agreement' && route.method === 'POST',
  )) {
    expect(sign.itemPath).toBe('/signed/{contractId}');
    expect(halLinksFor(snapshot.hypermedia, sign.id).self).toMatchObject({
      href: '/signed/{contractId}',
    });
  }
});
