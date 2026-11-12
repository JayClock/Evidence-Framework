import { readModelRoot } from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import { API_FIXTURES } from '../../tests/support/fixtures.js';

import {
  buildDelivery,
  buildDeliveryContract,
  buildDeliveryDeployment,
} from './delivery.js';

const model = async (): Promise<DomainModelDocument> => {
  const { bundle } = await readModelRoot(`${API_FIXTURES}full-lifecycle/fm`);

  return bundle;
};

type OpenApi = ReturnType<typeof buildDeliveryContract>;

const operationAt = (contract: OpenApi, path: string, method: string): Record<string, unknown> =>
  (contract.paths[path] as Record<string, Record<string, unknown>>)[method] as Record<
    string,
    unknown
  >;

describe('buildDeliveryContract', () => {
  it('names one operation id per route and tags it with its Context', async () => {
    const contract = buildDeliveryContract(await model());
    const sign = operationAt(contract, '/product-procurement/product-procurement', 'post');

    expect(sign['operationId']).toBe('signContractProductProcurement');
    expect(sign['tags']).toEqual(['context:context.product-procurement']);
    expect(sign['x-evidence-service']).toBe('service.product-procurement');
  });

  it('refuses a derived value and a business time in the request body', async () => {
    const contract = buildDeliveryContract(await model());
    const confirm = operationAt(
      contract,
      '/product-procurement/product-procurement/{contractId}/payment/requests/{requestId}/confirmations/payment',
      'post',
    );
    const body = confirm['requestBody'] as {
      content: { 'application/json': { schema: { properties: Record<string, unknown> } } };
    };
    const names = Object.keys(body.content['application/json'].schema.properties);

    expect(names).not.toContain('confirmed_at');
    expect(confirm['x-evidence-stamped']).toContain('confirmed_at');
    expect(confirm['x-evidence-fulfillment-request']).toBe('request.payment');
  });

  it('declares a conflict for a request whose window already closed', async () => {
    const contract = buildDeliveryContract(await model());
    const request = operationAt(
      contract,
      '/product-procurement/product-procurement/{contractId}/payment/requests',
      'post',
    );

    expect(Object.keys(request['responses'] as Record<string, unknown>)).toContain('409');
  });

  it('publishes the service base paths with the document', async () => {
    const contract = buildDeliveryContract(await model());

    expect(contract['x-evidence-services']).toEqual([
      {
        id: 'service.product-catalog',
        kind: 'domain',
        contextRef: 'context.product-catalog',
        basePath: '/product-catalog',
      },
      {
        id: 'service.product-procurement',
        kind: 'fulfillment',
        contextRef: 'context.product-procurement',
        basePath: '/product-procurement',
      },
      {
        id: 'service.product-sourcing',
        kind: 'channel',
        contextRef: 'context.product-sourcing',
        basePath: '/product-sourcing',
      },
      {
        id: 'service.wechat-payment',
        kind: 'capability',
        contextRef: 'context.wechat-payment',
        basePath: '/wechat-payment',
      },
    ]);
  });
});

describe('buildDeliveryDeployment', () => {
  it('runs one container per Context and depends on what it calls', async () => {
    const document = await model();
    const deployment = buildDeliveryDeployment(document);

    expect(Object.keys(deployment.services)).toEqual([
      'product-catalog',
      'product-procurement',
      'product-sourcing',
      'wechat-payment',
    ]);
    expect(deployment.services['product-sourcing']?.dependsOn).toEqual([
      'product-catalog',
      'product-procurement',
    ]);
    expect(deployment.services['wechat-payment']?.dependsOn).toEqual([
      'product-procurement',
    ]);
  });
});

/** A model small enough to reason about, with one unanswered question. */
const openEndedModel = (): DomainModelDocument => ({
  manifest: {
    type: 'fm_model',
    schemaVersion: '5.0',
    id: 'open-ended',
    name: '未闭合模型',
    version: '1.0.0',
    ruleLanguage: 'CEL',
    entryContextRefs: ['context.procurement'],
  },
  entities: [
    {
      type: 'entity',
      id: 'context.procurement',
      category: 'context',
      kind: 'contract',
      label: '采购',
      rootRefs: ['contract.procurement'],
    },
    {
      type: 'entity',
      id: 'contract.procurement',
      category: 'evidence',
      kind: 'contract',
      label: '采购协议',
      contextRef: 'context.procurement',
      roleRefs: ['role.buyer', 'role.seller'],
      attributes: [
        {
          name: 'signed_at',
          label: '签署时间',
          meaning: '签约时刻。',
          valueType: 'timestamp',
          required: true,
        },
        {
          name: 'quantity',
          label: '数量',
          meaning: '合同约定数量。',
          valueType: 'int',
          required: true,
          keyData: true,
        },
        {
          name: 'total_amount',
          label: '总额',
          meaning: '由数量与单价算出。',
          valueType: 'decimal',
          required: true,
          keyData: true,
          derivedByRuleRef: 'rule.total',
        },
      ],
    },
    {
      type: 'entity',
      id: 'role.buyer',
      category: 'role',
      kind: 'party',
      label: '采购方',
      contextRef: 'context.procurement',
    },
    {
      type: 'entity',
      id: 'role.seller',
      category: 'role',
      kind: 'party',
      label: '供应方',
      contextRef: 'context.procurement',
    },
    {
      type: 'entity',
      id: 'request.delivery',
      category: 'evidence',
      kind: 'fulfillment_request',
      label: '交付请求',
      contextRef: 'context.procurement',
      responsibleRoleRef: 'role.seller',
      attributes: [
        {
          name: 'started_at',
          label: '发起时间',
          meaning: '权利方发起时刻。',
          valueType: 'timestamp',
          required: true,
        },
        {
          name: 'expired_at',
          label: '截止时间',
          meaning: '履约窗口终点。',
          valueType: 'timestamp',
          required: true,
        },
      ],
    },
  ],
  relationships: [],
  rules: [
    {
      type: 'rule',
      id: 'rule.total',
      kind: 'derivation',
      label: '总额计算',
      description: '总额由合同数量与单价算出。',
      contextRef: 'context.procurement',
      bindings: { contract: { ref: 'contract.procurement' } },
      expression: 'contract.quantity * 10',
      resultType: 'decimal',
      target: { entityRef: 'contract.procurement', attribute: 'total_amount' },
    },
  ],
});

describe('buildDelivery', () => {
  it('reports what the model cannot answer yet instead of guessing it', async () => {
    const bundle = buildDelivery(openEndedModel());
    const report = bundle.limitations.join('\n');

    expect(bundle.schemaVersion).toBe('1.0');
    expect(bundle.modelId).toBe('open-ended');
    expect(report).toContain('request.delivery 没有履约确认');
    expect(report).toContain('派生属性 total_amount');
  });

  it('has nothing to report when every pair is closed and nothing is derived', async () => {
    expect(buildDelivery(await model()).limitations).toEqual([]);
  });

  it('keeps the contract and the topology naming the same services', async () => {
    const bundle = buildDelivery(await model());
    const fromTopology = bundle.services.map((service) => service.id).sort();
    const fromContract = bundle.openapi['x-evidence-services']
      .map((service) => String(service.id))
      .sort();

    expect(fromContract).toEqual(fromTopology);
  });
});
