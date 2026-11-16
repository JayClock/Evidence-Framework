import { CLAUSE_CATEGORIES } from './clause.js';
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
    clauseIndex: z.number().int().positive().optional(),
    charStart: z.number().int().nonnegative().optional(),
    charEnd: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((snippet, context) => {
    if (
      (snippet.charStart === undefined) !== (snippet.charEnd === undefined) ||
      (snippet.charStart !== undefined &&
        snippet.charEnd !== undefined &&
        (snippet.charEnd <= snippet.charStart ||
          snippet.charEnd - snippet.charStart !== snippet.text.length))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Source span must be a complete UTF-16 range matching the snippet length',
      });
    }
  });

export const ContractSourceDocumentSchema = z
  .object({
    text: z.string().min(1),
    clauses: z.array(
      z
        .object({
          index: z.number().int().positive(),
          text: z.string().min(1),
          category: z.enum(
            CLAUSE_CATEGORIES as unknown as [
              (typeof CLAUSE_CATEGORIES)[number],
              ...(typeof CLAUSE_CATEGORIES)[number][],
            ],
          ),
          reason: z.string(),
          charStart: z.number().int().nonnegative(),
          charEnd: z.number().int().positive(),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((document, context) => {
    let end = 0;
    document.clauses.forEach((clause, index) => {
      if (
        clause.index !== index + 1 ||
        clause.charStart < end ||
        clause.charEnd <= clause.charStart ||
        document.text.slice(clause.charStart, clause.charEnd) !== clause.text
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['clauses', index],
          message:
            'Clause span must exactly match the original source text in source order',
        });
      }
      end = clause.charEnd;
    });
  });
export type ContractSourceDocument = z.infer<
  typeof ContractSourceDocumentSchema
>;

export type ProvenanceSnippet = z.infer<typeof ProvenanceSnippetSchema>;
