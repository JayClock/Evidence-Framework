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
 */
export const CLAUSE_CATEGORIES = ['business', 'domain', 'boilerplate'] as const;

export type ClauseCategory = (typeof CLAUSE_CATEGORIES)[number];

/** Canonical Chinese（English） names, used by the review panel and prompts. */
export const CLAUSE_CATEGORY_LABELS: Record<ClauseCategory, string> = {
  business: '业务逻辑',
  domain: '领域逻辑',
  boilerplate: '纯法务条款',
};

export const CLAUSE_CATEGORY_ENGLISH_LABELS: Record<ClauseCategory, string> = {
  business: 'Business',
  domain: 'Domain',
  boilerplate: 'Boilerplate',
};

/** One line saying what belongs in the bucket, printed beside the label. */
export const CLAUSE_CATEGORY_HINTS: Record<ClauseCategory, string> = {
  business: '谁在什么时刻向谁交付什么，决定盈利与成本',
  domain: '计价、折算、校验等能写成规则的算法',
  boilerplate: '管辖、免责、送达等不由系统承载的条款',
};

/**
 * Where a clause's own outcome goes once the reading is accepted.
 *
 * A business clause becomes evidence, a domain clause becomes a Thing the model
 * computes with, and a boilerplate clause becomes nothing at all. Keeping the
 * destination in the vocabulary stops the review panel from inventing a fourth
 * place to put a sentence it does not understand.
 */
export const CLAUSE_DESTINATIONS = ['evidence', 'domain-thing', 'none'] as const;

export type ClauseDestination = (typeof CLAUSE_DESTINATIONS)[number];

export const CLAUSE_DESTINATION_OF: Record<
  ClauseCategory,
  ClauseDestination
> = {
  business: 'evidence',
  domain: 'domain-thing',
  boilerplate: 'none',
};

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

export const isClauseCategory = (value: unknown): value is ClauseCategory =>
  typeof value === 'string' &&
  (CLAUSE_CATEGORIES as readonly string[]).includes(value);

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
