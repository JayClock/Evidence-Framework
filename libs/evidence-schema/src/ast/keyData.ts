import type { AttributeAST, EntityAST } from './entity.js';

/**
 * How the value of one key data item is established.
 *
 * This vocabulary is the authority behind the key data ledger: the inspector,
 * the ledger and the sensors classify an item with it, so a green inspector never
 * hides a decision owed downstream.
 */
export const KEY_DATA_SOURCE_KINDS = [
  'derived',
  'contract-term',
  'domain-source',
  'negotiation-source',
  'result-fact',
  'request-input',
  'needs-decision',
  'other',
] as const;

export type KeyDataSourceKind = (typeof KEY_DATA_SOURCE_KINDS)[number];

/**
 * Values a requesting party records when it forms the request itself.
 *
 * An unknown name falls into `needs-decision` until the business decision lands.
 */
export const REQUEST_FORMATION_FIELDS: readonly string[] = [
  'started_at',
  'request_number',
  'delivery_address',
  'return_address',
  'fault_description',
  'asset_code',
  'billing_period',
  'settlement_period',
];

export const KEY_DATA_SOURCE_LABELS: Record<KeyDataSourceKind, string> = {
  derived: '派生规则（Derived）',
  'contract-term': '合同参数（Contract Term）',
  'domain-source': '领域对象（Domain Source）',
  'negotiation-source': '协商来源（Negotiation Source）',
  'result-fact': '结果事实（Result Fact）',
  'request-input': '请求形成事实（Request Input）',
  'needs-decision': '待决（Decision Owed）',
  other: '未归类（Other）',
};

/** Providers that satisfy the red line; `needs-decision` still owes a decision. */
export const RESOLVED_KEY_DATA_SOURCES: readonly KeyDataSourceKind[] = [
  'derived',
  'contract-term',
  'domain-source',
  'negotiation-source',
  'result-fact',
  'request-input',
];

export const isKeyDataSourceKind = (
  value: unknown,
): value is KeyDataSourceKind =>
  typeof value === 'string' &&
  (KEY_DATA_SOURCE_KINDS as readonly string[]).includes(value);

/** True when the business decision is still owed for this item. */
export const isKeyDataDecisionOwed = (kind: KeyDataSourceKind): boolean =>
  kind === 'needs-decision';

/** True when the item already names a provider the checker accepts. */
export const isKeyDataResolved = (kind: KeyDataSourceKind): boolean =>
  RESOLVED_KEY_DATA_SOURCES.includes(kind);

/**
 * Classifies one key data item from the modeled object alone.
 *
 * Pure by design: the same inputs always produce the same bucket, so the
 * inspector, the ledger and the sensors agree.
 */
export const classifyKeyDataSource = (
  entity: Pick<EntityAST, 'category' | 'kind'>,
  attribute: Pick<AttributeAST, 'name' | 'derivedByRuleRef'>,
): KeyDataSourceKind => {
  if (attribute.derivedByRuleRef !== undefined) {
    return 'derived';
  }

  if (entity.category === 'evidence' && entity.kind === 'contract') {
    return 'contract-term';
  }

  if (entity.category === 'participant' && entity.kind === 'thing') {
    return 'domain-source';
  }

  if (
    entity.category === 'evidence' &&
    (entity.kind === 'rfp' || entity.kind === 'proposal')
  ) {
    return 'negotiation-source';
  }

  if (
    entity.category === 'evidence' &&
    (entity.kind === 'fulfillment_confirmation' ||
      entity.kind === 'other_evidence')
  ) {
    return 'result-fact';
  }

  if (
    entity.category === 'evidence' &&
    entity.kind === 'fulfillment_request'
  ) {
    return REQUEST_FORMATION_FIELDS.includes(attribute.name)
      ? 'request-input'
      : 'needs-decision';
  }

  return 'other';
};

/** The four providers a human may pick in the inspector. */
export const KEY_DATA_PROVIDER_CHOICES = [
  'contract-term',
  'result-fact',
  'derived',
  'request-input',
] as const;

export type KeyDataProviderChoice = (typeof KEY_DATA_PROVIDER_CHOICES)[number];
