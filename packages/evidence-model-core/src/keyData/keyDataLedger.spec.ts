import { describe, expect, it } from 'vitest';

import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import { buildKeyDataLedger, keyDataEntryOf } from './keyDataLedger.js';

const document = (): DomainModelDocument => ({
  manifest: {
    type: 'fm_model',
    schemaVersion: '5.0',
    id: 'key-data-ledger',
    name: '关键数据夹具（Key Data Fixture）',
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
      label: '商品采购（Procurement）',
      rootRefs: ['evidence.contract'],
    },
    {
      type: 'entity',
      id: 'evidence.contract',
      category: 'evidence',
      kind: 'contract',
      label: '采购协议（Procurement Contract）',
      contextRef: 'context.procurement',
      roleRefs: ['role.buyer', 'role.supplier'],
      attributes: [
        {
          name: 'unit_price',
          label: '单价（Unit Price）',
          meaning: '双方议定单价。',
          valueType: 'money',
          keyData: true,
        },
      ],
    },
    {
      type: 'entity',
      id: 'evidence.request',
      category: 'evidence',
      kind: 'fulfillment_request',
      label: '发货请求（Shipment Request）',
      contextRef: 'context.procurement',
      responsibleRoleRef: 'role.buyer',
      attributes: [
        {
          name: 'delivery_address',
          label: '送货地址（Delivery Address）',
          meaning: '请求方填写。',
          valueType: 'string',
          keyData: true,
        },
        {
          name: 'penalty_amount',
          label: '违约金（Penalty）',
          meaning: '待补充提供方。',
          valueType: 'money',
          keyData: true,
        },
        {
          name: 'quantity',
          label: '数量（Quantity）',
          meaning: '按请求数量与合同单价派生。',
          valueType: 'int',
          keyData: true,
          derivedByRuleRef: 'rule.request-total',
        },
      ],
    },
    {
      type: 'entity',
      id: 'role.buyer',
      category: 'role',
      kind: 'party',
      label: '采购方（Buyer）',
      contextRef: 'context.procurement',
    },
    {
      type: 'entity',
      id: 'role.supplier',
      category: 'role',
      kind: 'party',
      label: '供应方（Supplier）',
      contextRef: 'context.procurement',
    },
  ],
  relationships: [],
  rules: [
    {
      type: 'rule',
      id: 'rule.request-total',
      kind: 'derivation',
      label: '请求金额派生',
      description: '请求数量乘以合同单价。',
      contextRef: 'context.procurement',
      bindings: {
        request: { ref: 'evidence.request' },
        contract: { ref: 'evidence.contract' },
        tax_rate: { type: 'decimal' },
      },
      expression: 'request.quantity * contract.unit_price',
      resultType: 'money',
      target: { entityRef: 'evidence.request', attribute: 'quantity' },
    },
  ],
});

describe('buildKeyDataLedger', () => {
  it('counts every key data item by the provider the checker accepts', () => {
    const ledger = buildKeyDataLedger(document());

    expect(ledger.entries).toHaveLength(4);
    expect(ledger.counts['contract-term']).toBe(1);
    expect(ledger.counts['request-input']).toBe(1);
    expect(ledger.counts['needs-decision']).toBe(1);
    expect(ledger.counts.derived).toBe(1);
  });

  it('lists the owed decision separately from the resolved items', () => {
    const ledger = buildKeyDataLedger(document());

    expect(ledger.decisionOwed.map((entry) => entry.attribute)).toEqual([
      'penalty_amount',
    ]);
    expect(ledger.derived.map((entry) => entry.attribute)).toEqual(['quantity']);
  });

  it('exposes the derivation providers so the inspector can name a source', () => {
    const ledger = buildKeyDataLedger(document());
    const derived = ledger.derived[0]!;

    expect(derived.ruleRef).toBe('rule.request-total');
    expect(derived.providers).toEqual([
      { alias: 'request', ref: 'evidence.request' },
      { alias: 'contract', ref: 'evidence.contract' },
      { alias: 'tax_rate', ref: '', valueType: 'decimal' },
    ]);
  });

  it('ignores attributes that are not marked as key data', () => {
    const ledger = buildKeyDataLedger(document());

    expect(ledger.entries.every((entry) => entry.attribute !== 'signed_at')).toBe(
      true,
    );
    expect(
      keyDataEntryOf(document(), 'evidence.contract', 'unit_price')?.source,
    ).toBe('contract-term');
    expect(
      keyDataEntryOf(document(), 'evidence.contract', 'missing'),
    ).toBeUndefined();
  });
});
