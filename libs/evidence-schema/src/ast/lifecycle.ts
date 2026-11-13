import type { ContextEntityAST, EntityAST, EvidenceKind } from './entity.js';
import {
  isVocabularyId,
  vocabularyField,
  vocabularyIds,
  vocabularyLabels,
} from '../vocabulary.js';

/**
 * The four business moments an 8X Flow workshop reads a model through.
 *
 * The lecture's lifecycle is a reading order, not a fifth entity category: an
 * RFP is opened, a proposal answers it, a contract is signed, and the contract is
 * then discharged by fulfillment requests and confirmations. Modeling it as
 * vocabulary keeps the canvas, the sidebar and the sensors agreeing on one
 * ordering instead of each inventing its own.
 *
 * "Contract signed" is the hinge. Everything to its left is pre-contract and has
 * no legal force; everything to its right is obligated delivery. That is why the
 * stage of a Context is derived from the evidence it holds rather than declared.
 *
 * Each stage carries the label, caption and English name the workshop board and
 * the review page print, so text cannot drift away from the lane it names.
 */
export interface LifecycleStageDefinition {
  readonly label: string;
  /** One line describing what a stage holds, printed under its label. */
  readonly caption: string;
  /** English name, kept beside the Chinese so a reader can map to the lecture. */
  readonly englishLabel: string;
}

export const LIFECYCLE_STAGE_DEFINITIONS = {
  rfp: {
    label: '邀请投标',
    caption: '时段：询价、比价、方案征询',
    englishLabel: 'Request for Proposal',
  },
  proposal: {
    label: '投标',
    caption: '时段：报价、方案、套餐',
    englishLabel: 'Proposal',
  },
  contract: {
    label: '合同签约',
    caption: '时刻：签署生效，权责成立',
    englishLabel: 'Contract',
  },
  fulfillment: {
    label: '履约履行',
    caption: '请求是时段，确认是时刻',
    englishLabel: 'Fulfillment',
  },
} as const satisfies Record<string, LifecycleStageDefinition>;

export type LifecycleStage = keyof typeof LIFECYCLE_STAGE_DEFINITIONS;

export const LIFECYCLE_STAGES = vocabularyIds(LIFECYCLE_STAGE_DEFINITIONS);

/** Reading order, left to right. Also the tie-break for "furthest stage". */
export const LIFECYCLE_STAGE_ORDER: readonly LifecycleStage[] =
  LIFECYCLE_STAGES;

/** Human labels the workshop board and the review page both show. */
export const LIFECYCLE_STAGE_LABELS = vocabularyLabels(
  LIFECYCLE_STAGE_DEFINITIONS,
);

/** One line describing what a stage holds, printed under its label. */
export const LIFECYCLE_STAGE_CAPTIONS = vocabularyField(
  LIFECYCLE_STAGE_DEFINITIONS,
  'caption',
);

/** English names, kept beside the Chinese so a reader can map to the lecture. */
export const LIFECYCLE_STAGE_ENGLISH_LABELS = vocabularyField(
  LIFECYCLE_STAGE_DEFINITIONS,
  'englishLabel',
);

/**
 * Evidence kinds that pin a Context to one moment.
 *
 * `other_evidence` is deliberately absent: a receipt, a delivery note or an
 * invoice may accompany any stage, so it inherits its Context's lane instead of
 * claiming one of its own.
 */
const EVIDENCE_STAGE: Partial<Record<EvidenceKind, LifecycleStage>> = {
  rfp: 'rfp',
  proposal: 'proposal',
  contract: 'contract',
  fulfillment_request: 'fulfillment',
  fulfillment_confirmation: 'fulfillment',
};

export const isLifecycleStage = (value: unknown): value is LifecycleStage =>
  isVocabularyId(LIFECYCLE_STAGE_DEFINITIONS, value);

/** Position of a stage in the reading order; used to compare two stages. */
export const lifecycleStageRank = (stage: LifecycleStage): number =>
  LIFECYCLE_STAGE_ORDER.indexOf(stage);

/** The later of two stages, so a Context reports the furthest moment it holds. */
export const furthestLifecycleStage = (
  a: LifecycleStage | null,
  b: LifecycleStage | null,
): LifecycleStage | null => {
  if (a === null) {
    return b;
  }

  if (b === null) {
    return a;
  }

  return lifecycleStageRank(a) >= lifecycleStageRank(b) ? a : b;
};

/**
 * Stage of one modeled object, or `null` when the object does not sit on the
 * business clock.
 *
 * Roles, Participants and Things are anchored to the Context that owns them and
 * may be referred to from any stage, so giving them a stage would move them off
 * the Contract they belong to. They inherit their Context's lane instead, and so
 * does `other_evidence`.
 */
export const lifecycleStageOf = (entity: EntityAST): LifecycleStage | null =>
  entity.category === 'evidence' ? (EVIDENCE_STAGE[entity.kind] ?? null) : null;

/**
 * Stage a Context is drawn in.
 *
 * A contract Context is always the hinge. A domain Context is where the work of
 * delivery is computed, so it reads as fulfillment. A pre-contract Context takes
 * the furthest stage among its own evidence, which is what separates a pure
 * enquiry Context (`rfp`) from one that already holds a quote (`proposal`).
 */
export const lifecycleStageOfContext = (
  context: ContextEntityAST,
  members: readonly EntityAST[] = [],
): LifecycleStage => {
  if (context.kind === 'contract') {
    return 'contract';
  }

  if (context.kind === 'domain') {
    return 'fulfillment';
  }

  let stage: LifecycleStage | null = null;

  for (const member of members) {
    if (member.category !== 'evidence') {
      continue;
    }

    // A nested contract Context belongs to its own lane, not to the parent's.
    stage = furthestLifecycleStage(stage, EVIDENCE_STAGE[member.kind] ?? null);
  }

  return stage ?? 'rfp';
};
