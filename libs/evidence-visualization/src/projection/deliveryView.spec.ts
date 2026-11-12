import { buildDelivery, type DeliveryBundle } from '@evidence-poc/evidence-api';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import { deliveryViewOf } from './deliveryView.js';

const document = (): DomainModelDocument => ({
  manifest: {
    type: 'fm_model',
    schemaVersion: '5.0',
    id: 'delivery-view',
    name: '交付视图',
    version: '1.0.0',
    ruleLanguage: 'CEL',
    entryContextRefs: ['context.core'],
  },
  entities: [
    {
      type: 'entity',
      id: 'context.core',
      category: 'context',
      kind: 'contract',
      label: '核心合同',
      rootRefs: ['contract.core'],
    },
    {
      type: 'entity',
      id: 'context.payment',
      category: 'context',
      kind: 'contract',
      label: '支付服务',
      rootRefs: ['contract.payment'],
    },
    {
      type: 'entity',
      id: 'contract.core',
      category: 'evidence',
      kind: 'contract',
      label: '核心协议',
      contextRef: 'context.core',
      roleRefs: ['role.buyer', 'role.seller'],
      attributes: [
        {
          name: 'signed_at',
          label: '签署时间',
          meaning: '签约时刻。',
          valueType: 'timestamp',
          required: true,
        },
      ],
    },
    {
      type: 'entity',
      id: 'role.buyer',
      category: 'role',
      kind: 'party',
      label: '采购方',
      contextRef: 'context.core',
    },
    {
      type: 'entity',
      id: 'role.seller',
      category: 'role',
      kind: 'party',
      label: '供应方',
      contextRef: 'context.core',
    },
    {
      type: 'entity',
      id: 'role.capability',
      category: 'role',
      kind: 'evidence',
      label: '支付能力',
      contextRef: 'context.core',
    },
    {
      type: 'entity',
      id: 'request.payment',
      category: 'evidence',
      kind: 'fulfillment_request',
      label: '支付请求',
      contextRef: 'context.core',
      responsibleRoleRef: 'role.seller',
      attributes: [
        {
          name: 'started_at',
          label: '发起时间',
          meaning: '发起时刻。',
          valueType: 'timestamp',
          required: true,
        },
        {
          name: 'expired_at',
          label: '截止时间',
          meaning: '窗口终点。',
          valueType: 'timestamp',
          required: true,
        },
      ],
    },
    {
      type: 'entity',
      id: 'confirmation.payment',
      category: 'evidence',
      kind: 'fulfillment_confirmation',
      label: '支付确认',
      contextRef: 'context.core',
      responsibleRoleRef: 'role.buyer',
      attributes: [
        {
          name: 'confirmed_at',
          label: '确认时间',
          meaning: '确认时刻。',
          valueType: 'timestamp',
          required: true,
        },
      ],
    },
    {
      type: 'entity',
      id: 'context.supplier-payment',
      category: 'context',
      kind: 'contract',
      label: '渠道支付',
      rootRefs: ['contract.supplier-payment'],
    },
    {
      type: 'entity',
      id: 'contract.supplier-payment',
      category: 'evidence',
      kind: 'contract',
      label: '渠道支付协议',
      contextRef: 'context.supplier-payment',
      roleRefs: ['role.channel', 'role.merchant'],
      attributes: [
        {
          name: 'signed_at',
          label: '签署时间',
          meaning: '签约时刻。',
          valueType: 'timestamp',
          required: true,
        },
      ],
    },
    {
      type: 'entity',
      id: 'role.channel',
      category: 'role',
      kind: 'party',
      label: '渠道方',
      contextRef: 'context.supplier-payment',
    },
    {
      type: 'entity',
      id: 'role.merchant',
      category: 'role',
      kind: 'party',
      label: '商户',
      contextRef: 'context.supplier-payment',
    },
    {
      type: 'entity',
      id: 'request.charge',
      category: 'evidence',
      kind: 'fulfillment_request',
      label: '扣款请求',
      contextRef: 'context.supplier-payment',
      responsibleRoleRef: 'role.merchant',
      attributes: [
        {
          name: 'started_at',
          label: '发起时间',
          meaning: '发起时刻。',
          valueType: 'timestamp',
          required: true,
        },
        {
          name: 'expired_at',
          label: '截止时间',
          meaning: '窗口终点。',
          valueType: 'timestamp',
          required: true,
        },
      ],
    },
    {
      type: 'entity',
      id: 'confirmation.charge',
      category: 'evidence',
      kind: 'fulfillment_confirmation',
      label: '扣款确认',
      contextRef: 'context.supplier-payment',
      responsibleRoleRef: 'role.channel',
      attributes: [
        {
          name: 'confirmed_at',
          label: '确认时间',
          meaning: '确认时刻。',
          valueType: 'timestamp',
          required: true,
        },
      ],
    },
  ],
  relationships: [
    {
      type: 'relationship',
      id: 'relation.payment-request-precedes-confirmation',
      kind: 'references',
      sourceRef: 'confirmation.payment',
      targetRef: 'request.payment',
      label: '支付确认回应支付请求',
    },
    {
      type: 'relationship',
      id: 'relation.charge-request-precedes-confirmation',
      kind: 'references',
      sourceRef: 'confirmation.charge',
      targetRef: 'request.charge',
      label: '扣款确认回应扣款请求',
    },
    {
      type: 'relationship',
      id: 'relation.payment-uses-capability',
      kind: 'references',
      sourceRef: 'confirmation.payment',
      targetRef: 'role.capability',
      label: '确认引用支付能力',
    },
    {
      type: 'relationship',
      id: 'relation.charge-plays-capability',
      kind: 'plays_role',
      sourceRef: 'confirmation.charge',
      targetRef: 'role.capability',
      label: '渠道确认扮演支付能力',
    },
  ],
  rules: [],
});

const bundle = (): DeliveryBundle => buildDelivery(document());

describe('deliveryViewOf', () => {
  it('keeps one entry per service with the routes it answers', () => {
    const view = deliveryViewOf(bundle());
    const core = view.services.find((service) => service.lane === 'core');

    expect(view.services).toHaveLength(3);
    expect(core?.kind).toBe('fulfillment');
    expect(core?.routes.map((route) => `${route.method} ${route.path}`)).toEqual([
      'GET /core/core/{contractId}',
      'GET /core/core/{contractId}/payment',
      'POST /core/core',
      'POST /core/core/{contractId}/payment/requests',
      'POST /core/core/{contractId}/payment/requests/{requestId}/confirmations/payment',
    ]);
  });

  it('marks the supplying Context as a capability service and keeps the link async', () => {
    const view = deliveryViewOf(bundle());

    expect(
      view.services.find((service) => service.lane === 'supplier-payment')?.kind,
    ).toBe('capability');
    expect(view.links).toEqual([
      expect.objectContaining({
        kind: 'capability',
        mode: 'async',
        to: 'service.core',
      }),
    ]);
  });

  it('carries the limitations the projector reported', () => {
    expect(deliveryViewOf(bundle()).limitations).toEqual([]);
  });
});
