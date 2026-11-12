import { describe, expect, it } from 'vitest';

import type { DeliveryBundle } from '@evidence-poc/evidence-api';

import { createMcpDeliveryService } from './mcpDeliveryService';

const bundle = (): DeliveryBundle =>
  ({
    schemaVersion: '1.0',
    modelId: 'procurement',
    modelName: '商品采购',
    modelVersion: '1.1.0',
    routes: [
      {
        id: 'route.sign.contract.procurement',
        operationId: 'signContractProcurement',
        method: 'POST',
        path: '/procurement/procurement',
        purpose: 'sign',
        serviceId: 'service.procurement',
        contextRef: 'context.procurement',
        entityRef: 'contract.procurement',
        contractRef: 'contract.procurement',
        requestRef: null,
        confirmationRef: null,
        summary: '签署采购协议',
        fields: [],
        derived: [],
        stamped: [],
        responses: [],
      },
      {
        id: 'route.read.contract.procurement',
        operationId: 'readContractProcurement',
        method: 'GET',
        path: '/procurement/procurement/{contractId}',
        purpose: 'read',
        serviceId: 'service.procurement',
        contextRef: 'context.procurement',
        entityRef: 'contract.procurement',
        contractRef: 'contract.procurement',
        requestRef: null,
        confirmationRef: null,
        summary: '读取采购协议',
        fields: [],
        derived: [],
        stamped: [],
        responses: [],
      },
    ],
    services: [
      {
        id: 'service.procurement',
        name: '采购',
        kind: 'fulfillment',
        contextRef: 'context.procurement',
        lane: 'procurement',
        rootRefs: ['contract.procurement'],
        evidenceRefs: ['contract.procurement'],
        supplies: [],
        consumes: [],
        notes: '合同上下文。',
      },
    ],
    links: [
      {
        id: 'link.capability',
        from: 'service.wechat-payment',
        to: 'service.procurement',
        kind: 'capability',
        mode: 'async',
        label: '扮演支付凭证',
        viaRef: 'role.payment-proof',
      },
    ],
    openapi: {
      openapi: '3.1.0',
      info: { title: '商品采购', version: '1.1.0', description: '' },
      'x-evidence-model': 'procurement',
      paths: {
        '/procurement/procurement': { post: {} },
        '/procurement/procurement/{contractId}': { get: {} },
      },
      components: { schemas: {} },
      'x-evidence-services': [],
    },
    deployment: { version: '3', services: {} },
    limitations: ['request.delivery 没有履约确认，未生成确认回调接口。'],
  }) as unknown as DeliveryBundle;

const service = () => createMcpDeliveryService(async () => bundle());

describe('createMcpDeliveryService', () => {
  it('counts the routes each service answers', async () => {
    const topology = await service().topology('/models/procurement');

    expect(topology.services[0]).toMatchObject({
      id: 'service.procurement',
      kind: 'fulfillment',
      routeCount: 2,
    });
    expect(topology.links[0]).toMatchObject({ mode: 'async' });
    expect(topology.limitations).toHaveLength(1);
  });

  it('hands back the contract with its path count, not a claim of readiness', async () => {
    const contract = await service().openapi('/models/procurement');

    expect(contract.pathCount).toBe(2);
    expect(contract.document).toMatchObject({ openapi: '3.1.0' });
    expect(contract.limitations).toHaveLength(1);
  });
});
