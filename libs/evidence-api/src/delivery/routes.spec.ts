import { readModelRoot } from '@evidence-poc/evidence-model-io';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import { API_FIXTURES } from '../testing/fixtures.js';
import { sharedConfirmationModel } from '../testing/fulfillment.js';

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
      '/product-procurements/{contractId}/payment',
    );
    expect(paymentConfirm?.path).toBe(
      '/product-procurements/{contractId}/payment/confirmation',
    );
    expect(paymentConfirm?.requestRef).toBe('request.payment');
    expect(paymentConfirm?.serviceId).toBe('service.product-procurement');
    expect(paymentConfirm?.itemPath).toBe(
      '/payment-confirmations/{paymentConfirmationId}',
    );
    expect(
      routes.find(({ id }) => id === 'route.read.confirmation.payment'),
    ).toMatchObject({
      path: paymentConfirm?.itemPath,
      method: 'GET',
      parameterEntityRefs: { paymentConfirmationId: 'confirmation.payment' },
    });
    expect(
      routes.some(
        ({ method, path }) => method === 'GET' && path === paymentConfirm?.path,
      ),
    ).toBe(false);
  });

  it('appends to a contract-scoped collection when the request is a singleton', async () => {
    const document = await model();
    const edge = document.relationships.find(
      ({ id }) => id === 'relation.payment-request-precedes-confirmation',
    )!;
    edge.sourceCardinality = { min: 0, max: 'many' };
    const routes = buildDeliveryRoutes(document).filter(
      ({ entityRef }) => entityRef === 'confirmation.payment',
    );
    expect(routes).toMatchObject([
      {
        method: 'POST',
        path: '/product-procurements/{contractId}/payment-confirmations',
      },
      {
        method: 'GET',
        path: '/product-procurements/{contractId}/payment-confirmations',
        responseShape: 'collection',
      },
      {
        method: 'GET',
        path: '/payment-confirmations/{paymentConfirmationId}',
        responseShape: 'item',
      },
    ]);
    expect(new Set(routes.map(({ itemPath }) => itemPath))).toEqual(
      new Set(['/payment-confirmations/{paymentConfirmationId}']),
    );
  });

  it('creates one shared resource and traces it from each request item', async () => {
    const routes = buildDeliveryRoutes(await sharedConfirmationModel()).filter(
      ({ entityRef }) => entityRef === 'confirmation.payment',
    );
    expect(routes).toMatchObject([
      {
        method: 'POST',
        path: '/payment-confirmations',
        requestRefs: ['request.payment', 'request.wechat-charge'],
        fields: expect.arrayContaining([
          expect.objectContaining({ name: 'request_ids', required: true }),
        ]),
      },
      {
        method: 'GET',
        path: '/product-procurements/{contractId}/payments/{paymentId}/payment-confirmations',
        responseShape: 'collection',
      },
      {
        method: 'GET',
        path: '/payment-confirmations/{paymentConfirmationId}',
        responseShape: 'item',
      },
      {
        method: 'GET',
        path: '/wechat-payments/{contractId}/wechat-charge/payment-confirmations',
        responseShape: 'collection',
      },
    ]);
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

    expect(open?.path).toBe('/product-inquiries');
    expect(open?.serviceId).toBe('service.product-sourcing');
    expect(
      routes
        .filter((route) => route.contextRef === 'context.product-sourcing')
        .every((route) => route.serviceId === 'service.product-sourcing'),
    ).toBe(true);
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
      '/product-inquiries/{inquiryId}/product-quotation',
    );
    expect(propose?.summary).toContain('回应商品询价');
  });

  it('leaves a quote at its business root when the model ties it to no enquiry', async () => {
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

    expect(propose?.path).toBe('/product-quotations');
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
      itemPath: '/product-procurements/{contractId}/payments/{paymentId}',
      allowedPartyRoleRefs: ['role.seller'],
      exposure: 'external',
    });
    expect(
      routes.find((route) => route.id === 'route.confirm.confirmation.payment')
        ?.path,
    ).toContain('/payments/{paymentId}/confirmation');
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

  it('gives every created resource a canonical GET, including proposal signing', async () => {
    const routes = buildDeliveryRoutes(await model());
    for (const route of routes.filter((route) => route.method === 'POST')) {
      expect(
        routes.some(
          (read) =>
            read.method === 'GET' &&
            read.path === route.itemPath &&
            read.entityRef === route.entityRef,
        ),
      ).toBe(true);
    }
    const sign = routes.find(
      (route) =>
        route.id ===
        'route.sign-from-proposal.product-quotation.contract.product-procurement',
    );
    expect(sign).toMatchObject({
      path: '/product-inquiries/{inquiryId}/product-quotation/product-procurements',
      itemPath: '/product-procurements/{contractId}',
      serviceId: 'service.product-procurement',
    });
  });

  it('keeps addresses when contexts move or a projection is scoped', async () => {
    const document = await model();
    const paths = (routes: ReturnType<typeof buildDeliveryRoutes>) =>
      routes
        .map(({ id, path, itemPath }) => ({ id, path, itemPath }))
        .sort((a, b) => a.id.localeCompare(b.id));
    const original = buildDeliveryRoutes(document);
    const moved = JSON.parse(
      JSON.stringify(document).replaceAll(
        'context.product-procurement',
        'context.new-deployment',
      ),
    );
    expect(paths(buildDeliveryRoutes(moved))).toEqual(paths(original));
    expect(
      paths(
        buildDeliveryRoutes(document, new Set(['context.product-procurement'])),
      ),
    ).toEqual(
      paths(
        original.filter(
          (route) => route.contextRef === 'context.product-procurement',
        ),
      ),
    );
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
