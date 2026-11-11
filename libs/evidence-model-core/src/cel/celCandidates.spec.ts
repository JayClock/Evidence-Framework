import { describe, expect, it } from 'vitest';

import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import { createDomainGraph } from '../model/graph.js';
import {
  aliasFor,
  bindingsForAliases,
  collectCelCandidates,
  derivationRuleOf,
} from './celCandidates.js';

const document = (): DomainModelDocument => ({
  manifest: {
    type: 'fm_model',
    schemaVersion: '5.0',
    id: 'cel-candidates',
    name: 'CEL 候选夹具（CEL Candidates Fixture）',
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
          name: 'quantity',
          label: '数量（Quantity）',
          meaning: '请求方填写。',
          valueType: 'int',
          required: true,
          keyData: true,
        },
        {
          name: 'total_amount',
          label: '请求金额（Total Amount）',
          meaning: '按数量与单价派生。',
          valueType: 'money',
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
      },
      expression: 'request.quantity * contract.unit_price',
      resultType: 'money',
      target: { entityRef: 'evidence.request', attribute: 'total_amount' },
    },
  ],
});

describe('collectCelCandidates', () => {
  it('reuses the existing bindings of the derivation rule', () => {
    const graph = createDomainGraph(document());
    const candidates = collectCelCandidates({
      graph,
      entityRef: 'evidence.request',
      ruleId: 'rule.request-total',
    });

    expect(candidates.map((candidate) => candidate.alias)).toEqual([
      'request',
      'contract',
    ]);
    expect(candidates[1]?.attributes.map((item) => item.name)).toEqual([
      'unit_price',
    ]);
  });

  it('seeds `self` and sibling objects when no rule exists yet', () => {
    const graph = createDomainGraph(document());
    const candidates = collectCelCandidates({
      graph,
      entityRef: 'evidence.request',
    });
    const aliases = candidates.map((candidate) => candidate.alias);

    expect(aliases[0]).toBe('self');
    expect(aliases).toContain('contract');
    expect(aliases).not.toContain('buyer');
    expect(aliases).not.toContain('procurement');
  });
});

describe('bindingsForAliases', () => {
  it('turns picked aliases into rule bindings', () => {
    const graph = createDomainGraph(document());
    const candidates = collectCelCandidates({
      graph,
      entityRef: 'evidence.request',
    });

    expect(bindingsForAliases(candidates, ['self', 'contract'])).toEqual({
      self: { ref: 'evidence.request' },
      contract: { ref: 'evidence.contract' },
    });
  });

  it('drops aliases that are not candidates', () => {
    const graph = createDomainGraph(document());
    const candidates = collectCelCandidates({
      graph,
      entityRef: 'evidence.request',
    });

    expect(bindingsForAliases(candidates, ['nope'])).toEqual({});
  });
});

describe('aliasFor', () => {
  it('keeps a CEL-safe alias from the last id segment', () => {
    expect(aliasFor('evidence.contract', 'evidence')).toBe('contract');
    expect(aliasFor('evidence.request-1', 'evidence')).toBe('request_1');
  });
});

describe('derivationRuleOf', () => {
  it('reads the rule bound to the attribute', () => {
    const graph = createDomainGraph(document());

    expect(
      derivationRuleOf(graph, 'evidence.request', 'total_amount')?.id,
    ).toBe('rule.request-total');
    expect(
      derivationRuleOf(graph, 'evidence.request', 'quantity'),
    ).toBeUndefined();
  });
});
