import type { ValueType } from './values.js';
import type { ProvenanceSnippet } from './provenance.js';

/** Business object categories of the pure graph fulfillment model. */
export const ENTITY_CATEGORIES = [
  'evidence',
  'participant',
  'role',
  'context',
] as const;

export type EntityCategory = (typeof ENTITY_CATEGORIES)[number];

export const EVIDENCE_KINDS = [
  'rfp',
  'proposal',
  'contract',
  'fulfillment_request',
  'fulfillment_confirmation',
  'other_evidence',
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const PARTICIPANT_KINDS = ['party', 'thing'] as const;

export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];

/**
 * What a `thing` stands for when the domain is the hard part.
 *
 * Most things are what the business trades in (a course, a device, a carton).
 * Some are not objects at all but the work the domain exists to do: a pricing
 * band, a ratio, a tier ladder, an eligibility test. Naming that difference keeps
 * a calculated value out of the contract, where it would become a hard-coded
 * number, and puts it in the Domain Context where a rule can own it.
 */
export const DOMAIN_COMPONENT_ROLES = ['calculator', 'checker'] as const;

export type DomainComponentRole = (typeof DOMAIN_COMPONENT_ROLES)[number];

export const DOMAIN_COMPONENT_ROLE_LABELS: Record<DomainComponentRole, string> =
  {
    calculator: '计算器',
    checker: '检查器',
  };

export const ROLE_KINDS = [
  'party',
  'domain',
  'third_party',
  'context',
  'evidence',
] as const;

export type RoleKind = (typeof ROLE_KINDS)[number];

export const CONTEXT_KINDS = ['contract', 'pre_contract', 'domain'] as const;

export type ContextKind = (typeof CONTEXT_KINDS)[number];

/**
 * Evidence kinds whose business time attribute is mandatory. The name in the
 * tuple must be modeled as a required `keyData` timestamp attribute.
 */
export const REQUIRED_EVIDENCE_TIME_ATTRIBUTES: Record<
  EvidenceKind,
  readonly string[]
> = {
  rfp: ['started_at', 'expired_at'],
  proposal: ['started_at', 'expired_at'],
  contract: ['signed_at'],
  fulfillment_request: ['started_at', 'expired_at'],
  fulfillment_confirmation: ['confirmed_at'],
  other_evidence: ['created_at'],
};

/** Attribute names recognised as business time of a modeled evidence moment. */
export const EVIDENCE_TIME_ATTRIBUTE_NAMES = [
  'started_at',
  'expired_at',
  'signed_at',
  'confirmed_at',
  'created_at',
] as const;

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
  typeof value === 'string' &&
  (DOMAIN_COMPONENT_ROLES as readonly string[]).includes(value);

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
  return entity?.attributes?.find((attribute) => attribute.name === attributeName);
}
