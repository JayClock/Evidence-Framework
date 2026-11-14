import { readModelRoot } from '@evidence-poc/evidence-model-io';
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
      '/product-procurement/product-procurement/{contractId}/payment/request',
    );
    expect(paymentConfirm?.path).toBe(
      '/product-procurement/product-procurement/{contractId}/payment/request/confirmation',
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

  it('nests a quote under the enquiry it actually answers', async () => {
    const routes = buildDeliveryRoutes(await model());
    const propose = routes.find((route) => route.purpose === 'propose');

    expect(propose?.path).toBe(
      '/product-sourcing/product-inquiry/{rfpId}/product-quotation',
    );
    expect(propose?.summary).toContain('回应商品询价');
  });

  it('leaves a quote at the lane root when the model ties it to no enquiry', async () => {
    const document = await model();
    const orphaned = {
      ...document,
      relationships: document.relationships.filter(
        (relationship) =>
          relationship.id !== 'relation.inquiry-precedes-quotation',
      ),
    };
    const propose = buildDeliveryRoutes(orphaned).find(
      (route) => route.purpose === 'propose',
    );

    expect(propose?.path).toBe('/product-sourcing/product-quotation');
    expect(propose?.summary).toContain('模型未声明所属征询');
  });

  it('follows both endpoint cardinalities and keeps unplayed roles internal', async () => {
    const document = await model();
    const changed = {
      ...document,
      relationships: document.relationships.map((edge) =>
        edge.id === 'relation.contract-precedes-payment-request'
          ? { ...edge, sourceCardinality: { min: 0, max: 'many' as const } }
          : edge,
      ),
    };
    const routes = buildDeliveryRoutes(changed);
    expect(
      routes.find((route) => route.id === 'route.request.request.payment'),
    ).toMatchObject({
      shape: 'collection',
      itemPath:
        '/product-procurement/product-procurement/{contractId}/payment/request/{requestId}',
      allowedPartyRoleRefs: ['role.seller'],
      exposure: 'external',
    });
    expect(
      routes.find((route) => route.id === 'route.confirm.confirmation.payment')
        ?.path,
    ).toContain('/request/{requestId}/confirmation');
    expect(
      routes.find(
        (route) => route.id === 'route.request.request.wechat-payment',
      ),
    ).toMatchObject({
      allowedPartyRoleRefs: [],
      exposure: 'internal',
    });
    const reversed = {
      ...changed,
      relationships: changed.relationships.map((edge) => ({
        ...edge,
        sourceRef: edge.targetRef,
        targetRef: edge.sourceRef,
        sourceCardinality: edge.targetCardinality,
        targetCardinality: edge.sourceCardinality,
      })),
    };
    expect(
      buildDeliveryRoutes(reversed).find(
        (route) => route.id === 'route.request.request.payment',
      )?.shape,
    ).toBe('collection');
  });

  it('states the derivations a service owns instead of exposing them as inputs', async () => {
    const routes = buildDeliveryRoutes(await model());
    const confirm = routes.find(
      (route) => route.id === 'route.confirm.confirmation.delivery',
    );

    for (const field of [
      ...(confirm?.derived ?? []),
      ...(confirm?.stamped ?? []),
    ]) {
      expect(confirm?.fields.map((input) => input.name)).not.toContain(
        field.name,
      );
    }
  });
});
