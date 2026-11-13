import type { ValueType } from './values.js';
import type { ProvenanceSnippet } from './provenance.js';
import {
  isVocabularyId,
  vocabularyField,
  vocabularyIds,
  vocabularyLabels,
} from '../vocabulary.js';

/** Business object categories of the pure graph fulfillment model. */
export const ENTITY_CATEGORY_DEFINITIONS = {
  evidence: { label: '凭证' },
  participant: { label: '参与方' },
  role: { label: '角色' },
  context: { label: '上下文' },
} as const satisfies Record<string, { readonly label: string }>;

export type EntityCategory = keyof typeof ENTITY_CATEGORY_DEFINITIONS;

export const ENTITY_CATEGORIES = vocabularyIds(ENTITY_CATEGORY_DEFINITIONS);

export const ENTITY_CATEGORY_LABELS = vocabularyLabels(
  ENTITY_CATEGORY_DEFINITIONS,
);

/**
 * What one evidence moment claims, and the time it must carry to claim it.
 *
 * The label is what the canvas, the inspector and the review panel print; the
 * time attributes are the business clock the kind cannot be modeled without.
 */
export interface EvidenceKindDefinition {
  readonly label: string;
  /** Name in the tuple must be modeled as a required `keyData` timestamp. */
  readonly requiredTimeAttributes: readonly string[];
}

export const EVIDENCE_KIND_DEFINITIONS = {
  rfp: {
    label: '询价',
    requiredTimeAttributes: ['started_at', 'expired_at'],
  },
  proposal: {
    label: '方案',
    requiredTimeAttributes: ['started_at', 'expired_at'],
  },
  contract: {
    label: '合同',
    requiredTimeAttributes: ['signed_at'],
  },
  fulfillment_request: {
    label: '履约请求',
    requiredTimeAttributes: ['started_at', 'expired_at'],
  },
  fulfillment_confirmation: {
    label: '履约确认',
    requiredTimeAttributes: ['confirmed_at'],
  },
  other_evidence: {
    label: '其他凭证',
    requiredTimeAttributes: ['created_at'],
  },
} as const satisfies Record<string, EvidenceKindDefinition>;

export type EvidenceKind = keyof typeof EVIDENCE_KIND_DEFINITIONS;

export const EVIDENCE_KINDS = vocabularyIds(EVIDENCE_KIND_DEFINITIONS);

export const EVIDENCE_KIND_LABELS = vocabularyLabels(EVIDENCE_KIND_DEFINITIONS);

/**
 * Evidence kinds whose business time attribute is mandatory.
 *
 * The name in the tuple must be modeled as a required `keyData` timestamp
 * attribute.
 */
export const REQUIRED_EVIDENCE_TIME_ATTRIBUTES: Record<
  EvidenceKind,
  readonly string[]
> = vocabularyField(EVIDENCE_KIND_DEFINITIONS, 'requiredTimeAttributes');

export const PARTICIPANT_KIND_DEFINITIONS = {
  party: { label: '参与方' },
  thing: { label: '业务对象' },
} as const satisfies Record<string, { readonly label: string }>;

export type ParticipantKind = keyof typeof PARTICIPANT_KIND_DEFINITIONS;

export const PARTICIPANT_KINDS = vocabularyIds(PARTICIPANT_KIND_DEFINITIONS);

export const PARTICIPANT_KIND_LABELS = vocabularyLabels(
  PARTICIPANT_KIND_DEFINITIONS,
);

/**
 * What a `thing` stands for when the domain is the hard part.
 *
 * Most things are what the business trades in (a course, a device, a carton).
 * Some are not objects at all but the work the domain exists to do: a pricing
 * band, a ratio, a tier ladder, an eligibility test. Naming that difference keeps
 * a calculated value out of the contract, where it would become a hard-coded
 * number, and puts it in the Domain Context where a rule can own it.
 */
export const DOMAIN_COMPONENT_ROLE_DEFINITIONS = {
  calculator: { label: '计算器' },
  checker: { label: '检查器' },
} as const satisfies Record<string, { readonly label: string }>;

export type DomainComponentRole =
  keyof typeof DOMAIN_COMPONENT_ROLE_DEFINITIONS;

export const DOMAIN_COMPONENT_ROLES = vocabularyIds(
  DOMAIN_COMPONENT_ROLE_DEFINITIONS,
);

export const DOMAIN_COMPONENT_ROLE_LABELS = vocabularyLabels(
  DOMAIN_COMPONENT_ROLE_DEFINITIONS,
);

export const ROLE_KIND_DEFINITIONS = {
  party: { label: '合同角色' },
  domain: { label: '领域角色' },
  third_party: { label: '第三方角色' },
  context: { label: '上下文角色' },
  evidence: { label: '凭证角色' },
} as const satisfies Record<string, { readonly label: string }>;

export type RoleKind = keyof typeof ROLE_KIND_DEFINITIONS;

export const ROLE_KINDS = vocabularyIds(ROLE_KIND_DEFINITIONS);

export const ROLE_KIND_LABELS = vocabularyLabels(ROLE_KIND_DEFINITIONS);

export const CONTEXT_KIND_DEFINITIONS = {
  contract: { label: '合同上下文' },
  pre_contract: { label: '前期上下文' },
  domain: { label: '领域上下文' },
} as const satisfies Record<string, { readonly label: string }>;

export type ContextKind = keyof typeof CONTEXT_KIND_DEFINITIONS;

export const CONTEXT_KINDS = vocabularyIds(CONTEXT_KIND_DEFINITIONS);

export const CONTEXT_KIND_LABELS = vocabularyLabels(CONTEXT_KIND_DEFINITIONS);

/**
 * Attribute names recognised as business time of a modeled evidence moment.
 *
 * The label is the short form a card prints when a project modeled the attribute
 * without a label of its own; the model's own label always wins.
 */
export const EVIDENCE_TIME_ATTRIBUTE_DEFINITIONS = {
  started_at: { label: '开始' },
  expired_at: { label: '截止' },
  signed_at: { label: '签署' },
  confirmed_at: { label: '确认' },
  created_at: { label: '创建' },
} as const satisfies Record<string, { readonly label: string }>;

export const EVIDENCE_TIME_ATTRIBUTE_NAMES = vocabularyIds(
  EVIDENCE_TIME_ATTRIBUTE_DEFINITIONS,
);

export const EVIDENCE_TIME_ATTRIBUTE_LABELS = vocabularyLabels(
  EVIDENCE_TIME_ATTRIBUTE_DEFINITIONS,
);

export interface AttributeAST {
  /** Lower snake_case attribute name, unique inside its entity. */
  name: string;
  /** Canonical Chinese（English） business label. */
  label: string;
  /** Business meaning, including who provides the value when it is key data. */
  meaning: string;
  valueType?: ValueType;
  required?: boolean;
  /** Amounts, deadlines, quantities and time differences are key data. */
  keyData?: boolean;
  /** Derivation rule that produces this attribute value. */
  derivedByRuleRef?: string;
  notes?: string;
}

interface EntityBase {
  type: 'entity';
  id: string;
  label: string;
  aliases?: string[];
  attributes?: AttributeAST[];
  notes?: string;
  /**
   * Sentence this element was read from.
   *
   * An ingested element keeps the clause that established it, so a reviewer can
   * re-read the business text instead of trusting the extraction. Hand-written
   * entities may omit it; nothing in the model depends on it.
   */
  sourceSnippet?: ProvenanceSnippet;
}

export interface EvidenceEntityAST extends EntityBase {
  category: 'evidence';
  kind: EvidenceKind;
  contextRef: string;
  /** Required for every non-contract evidence moment. */
  responsibleRoleRef?: string;
  /** Contracts are saved with exactly two contextual Party Roles. */
  roleRefs?: string[];
}

export interface ParticipantEntityAST extends EntityBase {
  category: 'participant';
  kind: ParticipantKind;
  /** Required for `thing`, forbidden for `party`. */
  contextRef?: string;
  /** Set on a `thing` that stands for domain computation, never on a `party`. */
  domainRole?: DomainComponentRole;
}

export interface RoleEntityAST extends EntityBase {
  category: 'role';
  kind: RoleKind;
  contextRef: string;
}

export interface ContextEntityAST extends EntityBase {
  category: 'context';
  kind: ContextKind;
  parentContextRef?: string;
  /** Contract and Domain contexts must declare their roots. */
  rootRefs?: string[];
}

export type EntityAST =
  | EvidenceEntityAST
  | ParticipantEntityAST
  | RoleEntityAST
  | ContextEntityAST;

/** Composite `category.kind` signature used by graph and validation checks. */
export type EntitySignature = `${EntityCategory}.${string}`;

export function entitySignature(entity: {
  category: EntityCategory;
  kind: string;
}): EntitySignature {
  return `${entity.category}.${entity.kind}`;
}

export function isEvidenceEntity(
  entity: EntityAST | undefined,
): entity is EvidenceEntityAST {
  return entity?.category === 'evidence';
}

export function isContractEntity(
  entity: EntityAST | undefined,
): entity is EvidenceEntityAST {
  return entity?.category === 'evidence' && entity.kind === 'contract';
}

export function isFulfillmentRequest(
  entity: EntityAST | undefined,
): entity is EvidenceEntityAST {
  return (
    entity?.category === 'evidence' && entity.kind === 'fulfillment_request'
  );
}

export function isFulfillmentConfirmation(
  entity: EntityAST | undefined,
): entity is EvidenceEntityAST {
  return (
    entity?.category === 'evidence' &&
    entity.kind === 'fulfillment_confirmation'
  );
}

export function isEvidenceMoment(
  entity: EntityAST | undefined,
): entity is EvidenceEntityAST {
  return (
    entity?.category === 'evidence' &&
    (entity.kind === 'fulfillment_confirmation' ||
      entity.kind === 'other_evidence')
  );
}

export function isRoleEntity(
  entity: EntityAST | undefined,
): entity is RoleEntityAST {
  return entity?.category === 'role';
}

export function isPartyRole(
  entity: EntityAST | undefined,
): entity is RoleEntityAST {
  return entity?.category === 'role' && entity.kind === 'party';
}

export function isParticipantEntity(
  entity: EntityAST | undefined,
): entity is ParticipantEntityAST {
  return entity?.category === 'participant';
}

export const isDomainComponentRole = (
  value: unknown,
): value is DomainComponentRole =>
  isVocabularyId(DOMAIN_COMPONENT_ROLE_DEFINITIONS, value);

/**
 * True for the thing a derivation reads instead of a contract parameter.
 *
 * A calculator or checker is where a "how much" or "may they" question lives
 * once it has been taken out of the agreement, so the model can answer it with a
 * rule instead of a value somebody typed in.
 */
export function isDomainComponent(
  entity: EntityAST | undefined,
): entity is ParticipantEntityAST & { domainRole: DomainComponentRole } {
  return (
    entity?.category === 'participant' &&
    entity.kind === 'thing' &&
    entity.domainRole !== undefined
  );
}

export function isContextEntity(
  entity: EntityAST | undefined,
): entity is ContextEntityAST {
  return entity?.category === 'context';
}

export function isContractContext(
  entity: EntityAST | undefined,
): entity is ContextEntityAST {
  return entity?.category === 'context' && entity.kind === 'contract';
}

/** Locates one attribute by name without normalising the source value. */
export function findAttribute(
  entity: EntityAST | undefined,
  attributeName: string,
): AttributeAST | undefined {
  return entity?.attributes?.find(
    (attribute) => attribute.name === attributeName,
  );
}
