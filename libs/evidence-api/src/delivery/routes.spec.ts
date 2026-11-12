import { readModelRoot } from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import { API_FIXTURES } from '../../tests/support/fixtures.js';

import { buildDeliveryRoutes } from './routes.js';

const model = async (): Promise<DomainModelDocument> => {
  const { bundle } = await readModelRoot(`${API_FIXTURES}full-lifecycle/fm`);

  return bundle;
};

describe('buildDeliveryRoutes', () => {
  it('gives every fulfillment pair a request route and one confirm route per confirmation', async () => {
    const routes = buildDeliveryRoutes(await model());
    const paymentRequest = routes.find(
      (route) => route.id === 'route.request.request.payment',
    );
    const paymentConfirm = routes.find(
      (route) => route.id === 'route.confirm.confirmation.payment',
    );

    expect(paymentRequest?.method).toBe('POST');
    expect(paymentRequest?.path).toBe(
      '/product-procurement/product-procurement/{contractId}/payment/requests',
    );
    expect(paymentConfirm?.path).toBe(
      '/product-procurement/product-procurement/{contractId}/payment/requests/{requestId}/confirmations/payment',
    );
    expect(paymentConfirm?.requestRef).toBe('request.payment');
    expect(paymentConfirm?.serviceId).toBe('service.product-procurement');
  });

  it('keeps a derived amount and a business time out of the caller inputs', async () => {
    const routes = buildDeliveryRoutes(await model());
    const sign = routes.find((route) => route.purpose === 'sign');

    expect(sign?.fields.map((field) => field.name)).toContain('quantity');
    expect(sign?.stamped.map((field) => field.name)).toEqual(['signed_at']);
    expect(sign?.fields.map((field) => field.name)).not.toContain('signed_at');
  });

  it('routes a pre-contract Context to a channel service', async () => {
    const routes = buildDeliveryRoutes(await model());
    const open = routes.find((route) => route.purpose === 'open');

    expect(open?.path).toBe('/product-sourcing/product-inquiry');
    expect(open?.serviceId).toBe('service.product-sourcing');
    expect(
      routes
        .filter((route) => route.contextRef === 'context.product-sourcing')
        .map((route) => route.serviceId),
    ).toEqual([
      'service.product-sourcing',
      'service.product-sourcing',
      'service.product-sourcing',
    ]);
  });

  it('reads a domain Context instead of writing it', async () => {
    const routes = buildDeliveryRoutes(await model()).filter(
      (route) => route.contextRef === 'context.product-catalog',
    );

    expect(routes.length).toBeGreaterThan(0);
    expect(routes.every((route) => route.method === 'GET')).toBe(true);
  });

  it('states the derivations a service owns instead of exposing them as inputs', async () => {
    const routes = buildDeliveryRoutes(await model());
    const confirm = routes.find(
      (route) => route.id === 'route.confirm.confirmation.delivery',
    );

    for (const field of [...(confirm?.derived ?? []), ...(confirm?.stamped ?? [])]) {
      expect(confirm?.fields.map((input) => input.name)).not.toContain(field.name);
    }
  });
});
