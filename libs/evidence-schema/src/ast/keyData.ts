import type { AttributeAST, EntityAST } from './entity.js';
import {
  isVocabularyId,
  vocabularyIds,
  vocabularyLabels,
} from '../vocabulary.js';

/**
 * How the value of one key data item is established.
 *
 * This vocabulary is the authority behind the key data ledger: the inspector,
 * the ledger and the sensors classify an item with it, so a green inspector never
 * hides a decision owed downstream.
 *
 * Every entry carries the text a picker prints and whether the provider already
 * satisfies the red line, so the resolved set is a filter over this declaration
 * instead of a second list that can fall out of step with it.
 */
export interface KeyDataSourceDefinition {
  readonly label: string;
  /** True when the provider satisfies the red line instead of owing a decision. */
  readonly resolved: boolean;
}

export const KEY_DATA_SOURCE_DEFINITIONS = {
  derived: {
    label: '派生规则（Derived）',
    resolved: true,
  },
  'contract-term': {
    label: '合同参数（Contract Term）',
    resolved: true,
  },
  'domain-source': {
    label: '领域对象（Domain Source）',
    resolved: true,
  },
  'negotiation-source': {
    label: '协商来源（Negotiation Source）',
    resolved: true,
  },
  'preceding-evidence': {
    label: '前序凭证（Preceding Evidence）',
    resolved: true,
  },
  'result-fact': {
    label: '结果事实（Result Fact）',
    resolved: true,
  },
  'request-input': {
    label: '请求形成事实（Request Input）',
    resolved: true,
  },
  'needs-decision': {
    label: '待决（Decision Owed）',
    resolved: false,
  },
  other: {
    label: '未归类（Other）',
    resolved: false,
  },
} as const satisfies Record<string, KeyDataSourceDefinition>;

export type KeyDataSourceKind = keyof typeof KEY_DATA_SOURCE_DEFINITIONS;

export const KEY_DATA_SOURCE_KINDS = vocabularyIds(KEY_DATA_SOURCE_DEFINITIONS);

export const KEY_DATA_SOURCE_LABELS = vocabularyLabels(
  KEY_DATA_SOURCE_DEFINITIONS,
);

/** Providers that satisfy the red line; `needs-decision` still owes a decision. */
export const RESOLVED_KEY_DATA_SOURCES: readonly KeyDataSourceKind[] =
  KEY_DATA_SOURCE_KINDS.filter(
    (kind) => KEY_DATA_SOURCE_DEFINITIONS[kind].resolved,
  );

export const isKeyDataSourceKind = (
  value: unknown,
): value is KeyDataSourceKind =>
  isVocabularyId(KEY_DATA_SOURCE_DEFINITIONS, value);

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
  attribute: Pick<
    AttributeAST,
    'name' | 'derivedByRuleRef' | 'source' | 'timeRole'
  >,
): KeyDataSourceKind => {
  if (attribute.derivedByRuleRef !== undefined) {
    return 'derived';
  }
  const explicit = attribute.source?.kind;
  if (explicit !== undefined && isKeyDataSourceKind(explicit)) return explicit;

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
    return attribute.timeRole === 'occurrence'
      ? 'result-fact'
      : 'needs-decision';
  }

  if (entity.category === 'evidence' && entity.kind === 'fulfillment_request') {
    return attribute.timeRole === 'start' ? 'request-input' : 'needs-decision';
  }

  return 'other';
};
