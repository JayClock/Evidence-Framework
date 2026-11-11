import {
  type AttributeAST,
  type DomainModelDocument,
  type EntityAST,
  type RelationshipAST,
  type RuleAST,
} from '@evidence-poc/evidence-schema';
import {
  createDomainGraph,
  type DomainGraph,
} from '@evidence-poc/evidence-model-core';

import { createGraphLayout, type DomainGraphLayout } from '../../src/index.js';

const timestamp = (
  name: string,
  label: string,
  meaning: string,
): AttributeAST => ({
  name,
  label,
  meaning,
  valueType: 'timestamp',
  required: true,
  keyData: true,
});

const context = (
  id: string,
  label: string,
  kind: 'contract' | 'domain' | 'pre_contract',
  rootRefs: string[],
  parentContextRef?: string,
): EntityAST => ({
  type: 'entity',
  id,
  category: 'context',
  kind,
  label,
  rootRefs,
  ...(parentContextRef === undefined ? {} : { parentContextRef }),
});

const role = (id: string, label: string, contextRef: string): EntityAST => ({
  type: 'entity',
  id,
  category: 'role',
  kind: 'party',
  label,
  contextRef,
});

const party = (id: string, label: string): EntityAST => ({
  type: 'entity',
  id,
  category: 'participant',
  kind: 'party',
  label,
});

const evidence = (
  id: string,
  label: string,
  kind:
    | 'contract'
    | 'fulfillment_request'
    | 'fulfillment_confirmation'
    | 'other_evidence',
  contextRef: string,
  attributes: AttributeAST[],
  extra: { roleRefs?: string[]; responsibleRoleRef?: string } = {},
): EntityAST => ({
  type: 'entity',
  id,
  category: 'evidence',
  kind,
  label,
  contextRef,
  attributes,
  ...extra,
});

const relationship = (
  id: string,
  kind: 'plays_role' | 'references',
  sourceRef: string,
  targetRef: string,
  label: string,
): RelationshipAST => ({
  type: 'relationship',
  id,
  kind,
  sourceRef,
  targetRef,
  label,
});

const derivation: RuleAST = {
  type: 'rule',
  id: 'rule.delivery-window',
  kind: 'derivation',
  label: '交付期限（Delivery Window）',
  description: '交付期限由合同约定天数与请求开始时间算出。',
  contextRef: 'context.product-procurement',
  bindings: {
    request: { ref: 'evidence.delivery-request' },
  },
  expression: 'request.expired_at - request.started_at',
  resultType: 'duration',
  target: {
    entityRef: 'evidence.delivery-request',
    attribute: 'delivery_window',
  },
};

const completion: RuleAST = {
  type: 'rule',
  id: 'rule.delivery-completion',
  kind: 'completion',
  label: '交付完成（Delivery Completion）',
  description: '交付确认到达即视为交付请求完成。',
  contextRef: 'context.product-procurement',
  bindings: {
    request: { ref: 'evidence.delivery-request' },
    confirmation: { ref: 'evidence.delivery-confirmation' },
  },
  expression: 'confirmation.confirmed_at <= request.expired_at',
  resultType: 'bool',
};

/**
 * Two nested Contexts, one free party pair, one Fulfillment pair with a proof,
 * a cross-Context reference and explicit responsibility fields.
 */
export const createFixtureDocument = (): DomainModelDocument => ({
  manifest: {
    type: 'fm_model',
    schemaVersion: '5.0',
    id: 'fixture-desktop-layout',
    name: '桌面画布布局夹具',
    version: '1.0.0',
    ruleLanguage: 'CEL',
    entryContextRefs: ['context.product-sourcing'],
  },
  entities: [
    context(
      'context.product-sourcing',
      '前期采购（Product Sourcing）',
      'pre_contract',
      ['evidence.rfp'],
    ),
    context(
      'context.product-procurement',
      '商品采购（Product Procurement）',
      'contract',
      ['evidence.procurement-contract'],
      'context.product-sourcing',
    ),
    context(
      'context.product-catalog',
      '商品目录（Product Catalog）',
      'domain',
      ['role.inventory'],
    ),
    evidence(
      'evidence.rfp',
      '询价单（RFP）',
      'other_evidence',
      'context.product-sourcing',
      [timestamp('created_at', '创建时间', '采购方创建')],
    ),
    evidence(
      'evidence.procurement-contract',
      '商品采购协议（Procurement Contract）',
      'contract',
      'context.product-procurement',
      [timestamp('signed_at', '签署时间', '双方签署')],
      {
        roleRefs: ['role.buyer', 'role.supplier'],
      },
    ),
    role('role.buyer', '采购方（Buyer）', 'context.product-procurement'),
    role('role.supplier', '供应方（Supplier）', 'context.product-procurement'),
    evidence(
      'evidence.delivery-request',
      '交付请求（Delivery Request）',
      'fulfillment_request',
      'context.product-procurement',
      [
        timestamp('started_at', '开始时间', '采购方发起'),
        timestamp('expired_at', '截止时间', '合同约定'),
        {
          name: 'delivery_window',
          label: '交付期限（Delivery Window）',
          meaning: '由合同天数与开始时间派生。',
          valueType: 'duration',
          required: true,
          keyData: true,
          derivedByRuleRef: 'rule.delivery-window',
        },
      ],
      {
        responsibleRoleRef: 'role.supplier',
      },
    ),
    evidence(
      'evidence.delivery-confirmation',
      '交付确认（Delivery Confirmation）',
      'fulfillment_confirmation',
      'context.product-procurement',
      [timestamp('confirmed_at', '确认时间', '采购方确认')],
      { responsibleRoleRef: 'role.buyer' },
    ),
    evidence(
      'evidence.delivery-note',
      '签收单（Delivery Note）',
      'other_evidence',
      'context.product-procurement',
      [timestamp('created_at', '创建时间', '供应方出具')],
    ),
    party('participant.buyer', '采购方企业（Buyer Org）'),
    party('participant.supplier', '供应方企业（Supplier Org）'),
    {
      type: 'entity',
      id: 'participant.product',
      category: 'participant',
      kind: 'thing',
      label: '商品（Product）',
      contextRef: 'context.product-catalog',
    },
    {
      type: 'entity',
      id: 'role.inventory',
      category: 'role',
      kind: 'domain',
      label: '库存（Inventory）',
      contextRef: 'context.product-catalog',
      attributes: [
        {
          name: 'available_quantity',
          label: '可用数量（Available Quantity）',
          meaning: '库存系统维护。',
          valueType: 'decimal',
          required: true,
          keyData: true,
        },
      ],
    },
  ],
  relationships: [
    relationship(
      'relation.buyer-plays-role',
      'plays_role',
      'participant.buyer',
      'role.buyer',
      '采购方企业扮演采购方',
    ),
    relationship(
      'relation.supplier-plays-role',
      'plays_role',
      'participant.supplier',
      'role.supplier',
      '供应方企业扮演供应方',
    ),
    relationship(
      'relation.confirmation-references-request',
      'references',
      'evidence.delivery-confirmation',
      'evidence.delivery-request',
      '交付确认回应交付请求',
    ),
    relationship(
      'relation.note-references-confirmation',
      'references',
      'evidence.delivery-note',
      'evidence.delivery-confirmation',
      '签收单证明交付确认',
    ),
    relationship(
      'relation.request-references-product',
      'references',
      'evidence.delivery-request',
      'participant.product',
      '交付请求指向商品',
    ),
  ],
  rules: [derivation, completion],
});

export interface FixtureModel {
  document: DomainModelDocument;
  graph: DomainGraph;
  layout: DomainGraphLayout;
}

export const createFixtureModel = (): FixtureModel => {
  const document = createFixtureDocument();
  const graph = createDomainGraph(document);

  return { document, graph, layout: createGraphLayout(graph) };
};
