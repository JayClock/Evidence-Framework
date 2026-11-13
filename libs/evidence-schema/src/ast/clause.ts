import {
  isVocabularyId,
  vocabularyField,
  vocabularyIds,
  vocabularyLabels,
} from '../vocabulary.js';

/**
 * The three readings a real agreement has to be split into before it is modelled.
 *
 * A signed contract is not a model. It mixes what the business does to earn and
 * spend (who delivers what, to whom, by when), what the business *computes*
 * (pricing bands, ratios, rounding, eligibility), and what only a lawyer cares
 * about (jurisdiction, force majeure, notices). Reading a contract straight into
 * evidence produces a document list with no responsibilities in it, and reading
 * boilerplate into the model produces obligations no system can discharge.
 *
 * The vocabulary lives here rather than in a reader so the extraction prompt,
 * the review panel and the ingestion compiler all name the same three buckets.
 * Each bucket carries its own names, the line printed beside it and where its
 * outcome goes, so those four facts are read in one place instead of four.
 */
export interface ClauseCategoryDefinition {
  /** Canonical Chinese name, used by the review panel and prompts. */
  readonly label: string;
  readonly englishLabel: string;
  /** One line saying what belongs in the bucket, printed beside the label. */
  readonly hint: string;
  /** Where a clause's own outcome goes once the reading is accepted. */
  readonly destination: ClauseDestination;
}

/**
 * Where a clause's own outcome goes once the reading is accepted.
 *
 * A business clause becomes evidence, a domain clause becomes a Thing the model
 * computes with, and a boilerplate clause becomes nothing at all. Keeping the
 * destination in the vocabulary stops the review panel from inventing a fourth
 * place to put a sentence it does not understand.
 */
export const CLAUSE_DESTINATION_DEFINITIONS = {
  evidence: { label: '业务凭证' },
  'domain-thing': { label: '领域对象' },
  none: { label: '不进模型' },
} as const satisfies Record<string, { readonly label: string }>;

export type ClauseDestination = keyof typeof CLAUSE_DESTINATION_DEFINITIONS;

export const CLAUSE_DESTINATIONS = vocabularyIds(
  CLAUSE_DESTINATION_DEFINITIONS,
);

export const CLAUSE_DESTINATION_LABELS = vocabularyLabels(
  CLAUSE_DESTINATION_DEFINITIONS,
);

export const CLAUSE_CATEGORY_DEFINITIONS = {
  business: {
    label: '业务逻辑',
    englishLabel: 'Business',
    hint: '谁在什么时刻向谁交付什么，决定盈利与成本',
    destination: 'evidence',
  },
  domain: {
    label: '领域逻辑',
    englishLabel: 'Domain',
    hint: '计价、折算、校验等能写成规则的算法',
    destination: 'domain-thing',
  },
  boilerplate: {
    label: '纯法务条款',
    englishLabel: 'Boilerplate',
    hint: '管辖、免责、送达等不由系统承载的条款',
    destination: 'none',
  },
} as const satisfies Record<string, ClauseCategoryDefinition>;

export type ClauseCategory = keyof typeof CLAUSE_CATEGORY_DEFINITIONS;

export const CLAUSE_CATEGORIES = vocabularyIds(CLAUSE_CATEGORY_DEFINITIONS);

export const CLAUSE_CATEGORY_LABELS = vocabularyLabels(
  CLAUSE_CATEGORY_DEFINITIONS,
);

export const CLAUSE_CATEGORY_ENGLISH_LABELS = vocabularyField(
  CLAUSE_CATEGORY_DEFINITIONS,
  'englishLabel',
);

export const CLAUSE_CATEGORY_HINTS = vocabularyField(
  CLAUSE_CATEGORY_DEFINITIONS,
  'hint',
);

export const CLAUSE_DESTINATION_OF = vocabularyField(
  CLAUSE_CATEGORY_DEFINITIONS,
  'destination',
);

export const isClauseCategory = (value: unknown): value is ClauseCategory =>
  isVocabularyId(CLAUSE_CATEGORY_DEFINITIONS, value);

export const isClauseDestination = (
  value: unknown,
): value is ClauseDestination =>
  isVocabularyId(CLAUSE_DESTINATION_DEFINITIONS, value);

/** One sentence of the agreement, with the reading that was given to it. */
export interface ClauseAnnotation {
  /** 1-based position in the clause order the reader produced. */
  index: number;
  /** The clause verbatim, so a reviewer re-reads the contract, not the reading. */
  text: string;
  category: ClauseCategory;
  /** Why this bucket, in business language. */
  reason: string;
}

/** Clause counts per bucket, for a caller that only shows a summary. */
export const countClausesByCategory = (
  clauses: readonly ClauseAnnotation[],
): Record<ClauseCategory, number> => {
  const counts: Record<ClauseCategory, number> = {
    business: 0,
    domain: 0,
    boilerplate: 0,
  };

  for (const clause of clauses) {
    counts[clause.category] += 1;
  }

  return counts;
};
