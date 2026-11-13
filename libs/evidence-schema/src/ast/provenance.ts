import {
  isVocabularyId,
  vocabularyIds,
  vocabularyLabels,
} from '../vocabulary.js';

/**
 * Where a draft element came from.
 *
 * The lecture gave the model one rule about its own origin: a business fact is
 * only worth keeping if it can be traced back to the clause, document or
 * blueprint row that established it. `ProvenanceSnippet` is that link: the
 * ingestion pipeline copies the verbatim sentence next to every element it
 * produces, so a reviewer can check the reading instead of trusting it.
 *
 * The kinds name the input forms; the label is what a draft review panel prints
 * beside a snippet.
 */
export const INGESTION_SOURCE_KIND_DEFINITIONS = {
  contract: { label: '合同（Contract）' },
  prd: { label: '需求文档（PRD）' },
  interview: { label: '访谈（Interview）' },
  blueprint: { label: '蓝图（Blueprint）' },
  unknown: { label: '未知来源（Unknown）' },
} as const satisfies Record<string, { readonly label: string }>;

export type IngestionSourceKind =
  keyof typeof INGESTION_SOURCE_KIND_DEFINITIONS;

export const INGESTION_SOURCE_KINDS = vocabularyIds(
  INGESTION_SOURCE_KIND_DEFINITIONS,
);

export const INGESTION_SOURCE_KIND_LABELS = vocabularyLabels(
  INGESTION_SOURCE_KIND_DEFINITIONS,
);

export function isIngestionSourceKind(
  value: unknown,
): value is IngestionSourceKind {
  return isVocabularyId(INGESTION_SOURCE_KIND_DEFINITIONS, value);
}

export interface ProvenanceSnippet {
  /** Verbatim source sentence the element was read from. */
  text: string;
  /**
   * Human-readable position inside the source: a sentence number, a table row
   * (`row 4`) or the stage an activity belonged to.
   */
  locator?: string;
  /** Which input form the snippet came from. */
  source?: IngestionSourceKind;
}
