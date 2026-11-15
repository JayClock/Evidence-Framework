import { z } from 'zod';
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
 * blueprint row that established it.
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

export const IngestionSourceKindSchema = z.enum(
  INGESTION_SOURCE_KINDS as unknown as [
    IngestionSourceKind,
    ...IngestionSourceKind[],
  ],
);

export function isIngestionSourceKind(
  value: unknown,
): value is IngestionSourceKind {
  return isVocabularyId(INGESTION_SOURCE_KIND_DEFINITIONS, value);
}

export const ProvenanceSnippetSchema = z
  .object({
    text: z.string().min(1),
    locator: z.string().min(1).optional(),
    source: IngestionSourceKindSchema.optional(),
  })
  .strict();

export type ProvenanceSnippet = z.infer<typeof ProvenanceSnippetSchema>;
