import { readModelRoot } from '@evidence-poc/evidence-model-io';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import { API_FIXTURES } from '../../tests/support/fixtures.js';

import { buildDeliveryTopology } from './topology.js';

const model = async (): Promise<DomainModelDocument> => {
  const { bundle } = await readModelRoot(`${API_FIXTURES}full-lifecycle/fm`);

  return bundle;
};

describe('buildDeliveryTopology', () => {
  it('turns each Context into exactly one service with a lane', async () => {
    const { services } = buildDeliveryTopology(await model());

    expect(services.map((service) => service.id)).toEqual([
      'service.product-catalog',
      'service.product-procurement',
      'service.product-sourcing',
      'service.wechat-payment',
    ]);
    expect(services.map((service) => service.lane)).toEqual([
      'product-catalog',
      'product-procurement',
      'product-sourcing',
      'wechat-payment',
    ]);
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
    const wechat = services.find((service) => service.id === 'service.wechat-payment');
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
