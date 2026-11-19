import { readModelRoot } from '@evidence-poc/evidence-model-io';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import { API_FIXTURES } from '../testing/fixtures.js';
import { sharedConfirmationModel } from '../testing/fulfillment.js';
import { buildModelDelivery } from './modelDelivery.js';

import { buildDeliveryTopology } from './topology.js';

const model = async (): Promise<DomainModelDocument> => {
  const { bundle } = await readModelRoot(`${API_FIXTURES}full-lifecycle/fm`);

  return bundle;
};

describe('buildDeliveryTopology', () => {
  it('turns each Context into exactly one service with business route ownership', async () => {
    const { services } = buildDeliveryTopology(await model());

    expect(services.map((service) => service.id)).toEqual([
      'service.product-catalog',
      'service.product-procurement',
      'service.product-sourcing',
      'service.wechat-payment',
    ]);
    expect(services.map((service) => service.routePrefixes)).toEqual([
      ['/products'],
      [
        '/delivery-confirmations',
        '/invoice-confirmations',
        '/payment-confirmations',
        '/product-inquiries',
        '/product-procurements',
      ],
      ['/product-inquiries'],
      [
        '/wechat-charge-confirmations',
        '/wechat-payment-confirmations',
        '/wechat-payments',
      ],
    ]);
    for (const service of services) {
      expect(service).not.toHaveProperty('lane');
      expect(service.routes.length).toBeGreaterThan(0);
    }
  });

  it('reads a pre-contract Context as a channel and a domain Context as a domain', async () => {
    const { services } = buildDeliveryTopology(await model());
    const kindOf = (id: string) =>
      services.find((service) => service.id === id)?.kind;

    expect(kindOf('service.product-sourcing')).toBe('channel');
    expect(kindOf('service.product-catalog')).toBe('domain');
  });

  it('marks the Context that answers a capability socket as a capability service', async () => {
    const { services, links } = buildDeliveryTopology(await model());
    const wechat = services.find(
      (service) => service.id === 'service.wechat-payment',
    );
    const capability = links.filter((link) => link.kind === 'capability');

    expect(wechat?.kind).toBe('capability');
    expect(wechat?.supplies).toEqual(['role.payment-proof']);
    expect(capability).toHaveLength(1);
    expect(capability[0]?.to).toBe('service.product-procurement');
    expect(capability[0]?.mode).toBe('async');
  });

  it('links a channel to the contract it hands over to', async () => {
    const { links } = buildDeliveryTopology(await model());
    const signs = links.find((link) => link.kind === 'signs');

    expect(signs?.from).toBe('service.product-sourcing');
    expect(signs?.to).toBe('service.product-procurement');
    expect(signs?.viaRef).toBe('contract.product-procurement');
  });

  it('links a contract to the domain Context it reads', async () => {
    const { links } = buildDeliveryTopology(await model());
    const reads = links.filter((link) => link.kind === 'reads');

    expect(
      reads.map((link) => `${link.from}->${link.to}:${link.mode}`),
    ).toContain('service.product-procurement->service.product-catalog:sync');
  });
});

it('serves shared confirmation creation and reverse lookup in the same contract service', async () => {
  const delivery = buildModelDelivery(await sharedConfirmationModel());
  const procurement = delivery.deployment.services['product-procurement']!;
  expect(Object.values(procurement.labels!)).toContain(
    'Method(`POST`) && PathRegexp(`^/payment-confirmations$`)',
  );
  expect(Object.values(procurement.labels!)).toContain(
    'Method(`GET`) && PathRegexp(`^/payment-confirmations/[^/]+$`)',
  );
  expect(Object.values(procurement.labels!)).toContain(
    'Method(`GET`) && PathRegexp(`^/product-procurements/[^/]+/payment-balance/payment-confirmations$`)',
  );
});

it('owns each method/path once, including proposal signing executed by the contract service', async () => {
  const document = await model();
  const { buildDeliveryRoutes } = await import('./routes.js');
  const { buildDeliveryDeployment } = await import('./modelDelivery.js');
  const routes = buildDeliveryRoutes(document);
  const { services } = buildDeliveryTopology(document, routes);
  const owned = services.flatMap((service) => service.routes);
  expect(owned.sort()).toEqual(routes.map((route) => route.id).sort());
  const deployment = buildDeliveryDeployment(document, routes, services);
  for (const service of services) {
    const container =
      deployment.services[service.id.replace(/^service\./, '')]!;
    expect(JSON.parse(container.environment.EVIDENCE_ROUTE_PREFIXES!)).toEqual(
      service.routePrefixes,
    );
    expect(container.environment).not.toHaveProperty('EVIDENCE_BASE_PATH');
    const rules = Object.entries(container.labels!)
      .filter(([key]) => key.endsWith('.rule'))
      .map(([, value]) => value);
    expect(rules).toHaveLength(service.routes.length);
    for (const route of routes.filter((route) =>
      service.routes.includes(route.id),
    )) {
      const concrete = route.path.replace(/\{[^{}]+\}/g, 'one');
      expect(
        rules.filter((rule) => {
          const match = rule.match(
            /^Method\(`(GET|POST)`\) && PathRegexp\(`(.*)`\)$/,
          )!;
          return (
            match[1] === route.method && new RegExp(match[2]!).test(concrete)
          );
        }),
      ).toHaveLength(1);
    }
  }
});
