import type {
  ContextKind,
  DomainComponentRole,
  EvidenceKind,
  RoleKind,
} from '../ast/entity.js';
import type { ValueType } from '../ast/values.js';
import type {
  IngestionSourceKind,
  ProvenanceSnippet,
} from '../ast/provenance.js';

/**
 * The half-way document between business prose and an FM model.
 *
 * Every reader — a large model reading a contract clause, a deterministic
 * parser reading a blueprint table, or a person editing a review panel — writes
 * this shape. Nothing downstream cares which one produced it, so the compiler
 * and the review UI have exactly one input to handle.
 *
 * Ids are provisional: the compiler re-keys them into schema ids, and every
 * element may carry the `ProvenanceSnippet` that produced it.
 */
export interface IngestionDraft {
  /** Manifest name the compiled model gets. */
  modelName: string;
  description?: string;
  /** Which input form produced this draft. */
  source: IngestionSourceKind;
  contexts: DraftContext[];
  participants: DraftParticipant[];
  roles: DraftRole[];
  things: DraftThing[];
  evidences: DraftEvidence[];
  fulfillmentPairs: DraftFulfillmentPair[];
  breachCompensations: DraftBreachCompensation[];
  relationships: DraftRelationship[];
}

export interface DraftContext {
  id: string;
  label: string;
  kind: ContextKind;
  /** Set on a pre-contract context: the contract it sources. */
  parentContextRef?: string;
  /** Evidence a contract or domain context is rooted in. */
  rootRefs?: string[];
  provenance?: ProvenanceSnippet;
}

export interface DraftParticipant {
  id: string;
  label: string;
  /** `thing` carries a `contextRef`; `party` does not. */
  kind: 'party' | 'thing';
  contextRef?: string;
  provenance?: ProvenanceSnippet;
}

export interface DraftRole {
  id: string;
  label: string;
  kind: RoleKind;
  contextRef: string;
  /** Participant that plays the role; optional while it is still unknown. */
  playedByParticipantRef?: string;
  provenance?: ProvenanceSnippet;
}

export interface DraftThing {
  id: string;
  label: string;
  meaning?: string;
  /** Domain context the thing belongs to; defaults to a generated one. */
  contextRef?: string;
  /** Set when the thing stands for domain computation rather than trade. */
  domainRole?: DomainComponentRole;
  provenance?: ProvenanceSnippet;
}

export interface DraftAttribute {
  name: string;
  label: string;
  meaning: string;
  valueType?: ValueType;
  required?: boolean;
  keyData?: boolean;
}

export interface DraftEvidence {
  id: string;
  label: string;
  kind: EvidenceKind;
  contextRef: string;
  /** Signing or delivering role; required for every non-contract evidence. */
  responsibleRoleRef?: string;
  /** Exactly two for a contract. */
  roleRefs?: string[];
  attributes?: DraftAttribute[];
  provenance?: ProvenanceSnippet;
}

export interface DraftFulfillmentPair {
  id: string;
  label: string;
  /** Draft evidence id of the fulfillment request (a time span). */
  requestRef: string;
  /** Draft evidence id of the fulfillment confirmation (an instant). */
  confirmationRef: string;
  /** Draft evidence id of the document that proves the confirmation. */
  proofRef?: string;
  description?: string;
  provenance?: ProvenanceSnippet;
}

export interface DraftBreachCompensation {
  id: string;
  label: string;
  /** Pair whose failure triggers this compensation. */
  triggeredByPairRef: string;
  /** Pair that repairs the failure, e.g. the refund fulfillment. */
  compensationPairRef: string;
  conditionDescription: string;
  provenance?: ProvenanceSnippet;
}

export interface DraftRelationship {
  id: string;
  kind: 'references' | 'plays_role';
  sourceRef: string;
  targetRef: string;
  label: string;
}

/** Short names a reader may use for an evidence kind, mapped onto the schema. */
export const EVIDENCE_KIND_ALIASES: Readonly<Record<string, EvidenceKind>> = {
  rfp: 'rfp',
  request_for_proposal: 'rfp',
  inquiry: 'rfp',
  proposal: 'proposal',
  quotation: 'proposal',
  quote: 'proposal',
  contract: 'contract',
  agreement: 'contract',
  request: 'fulfillment_request',
  fulfillment_request: 'fulfillment_request',
  confirmation: 'fulfillment_confirmation',
  fulfillment_confirmation: 'fulfillment_confirmation',
  evidence: 'other_evidence',
  other_evidence: 'other_evidence',
  proof: 'other_evidence',
  document: 'other_evidence',
};

/**
 * Normalises the short names readers use (`request`, `confirmation`,
 * `evidence`) plus the schema names themselves. Returns `undefined` rather than
 * guessing, so a caller can report an unknown kind instead of silently
 * promoting it to `other_evidence`.
 */
export function normalizeDraftEvidenceKind(
  value: unknown,
): EvidenceKind | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const key = value.trim().toLowerCase().replaceAll(/[\s-]+/g, '_');

  return EVIDENCE_KIND_ALIASES[key];
}

/**
 * Evidence kinds the lecture treats as an instant.
 *
 * A time span (`rfp`, `proposal`, fulfillment request) only says an attempt was
 * started; a contract, a confirmation and a proving document say a business
 * result exists. Only instants can play a role, which is why the distinction
 * travels with the draft instead of staying in a prose comment.
 */
export function draftEvidenceIsMoment(kind: EvidenceKind): boolean {
  return (
    kind === 'contract' ||
    kind === 'fulfillment_confirmation' ||
    kind === 'other_evidence'
  );
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isArrayOf = <T>(
  value: unknown,
  guard: (item: unknown) => item is T,
): value is T[] => Array.isArray(value) && value.every(guard);

const hasId = (value: unknown): value is { id: string } =>
  isObject(value) && isNonEmptyString(value['id']);

/**
 * Cheap shape guard for a draft a large model produced as JSON.
 *
 * It checks the containers and the ids the compiler dereferences, not every
 * optional field: a reader that got the shape right but an attribute wrong
 * should still reach the review panel, where a person can fix it.
 */
export function isIngestionDraftShape(value: unknown): value is IngestionDraft {
  if (!isObject(value)) {
    return false;
  }

  return (
    isNonEmptyString(value['modelName']) &&
    isArrayOf(value['contexts'], hasId) &&
    isArrayOf(value['participants'], hasId) &&
    isArrayOf(value['roles'], hasId) &&
    isArrayOf(value['things'], hasId) &&
    isArrayOf(value['evidences'], hasId) &&
    isArrayOf(value['fulfillmentPairs'], hasId) &&
    isArrayOf(value['breachCompensations'], hasId) &&
    isArrayOf(value['relationships'], hasId)
  );
}

/** An empty draft, so a caller never has to spell out seven arrays. */
export function createEmptyIngestionDraft(
  options: { modelName?: string; source?: IngestionSourceKind } = {},
): IngestionDraft {
  return {
    modelName: options.modelName ?? '未命名履约模型',
    source: options.source ?? 'unknown',
    contexts: [],
    participants: [],
    roles: [],
    things: [],
    evidences: [],
    fulfillmentPairs: [],
    breachCompensations: [],
    relationships: [],
  };
}
