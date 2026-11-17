import { z } from 'zod';
import { DomainIdSchema } from './id.js';
import {
  isVocabularyId,
  vocabularyIds,
  vocabularyLabels,
} from '../vocabulary.js';

/** Relationship kinds of the pure graph fulfillment model. */
export const RELATIONSHIP_KIND_DEFINITIONS = {
  plays_role: { label: '扮演角色（Plays Role）' },
  references: { label: '引用（References）' },
} as const satisfies Record<string, { readonly label: string }>;

export type RelationshipKind = keyof typeof RELATIONSHIP_KIND_DEFINITIONS;
export const RELATIONSHIP_KINDS = vocabularyIds(RELATIONSHIP_KIND_DEFINITIONS);
export const RELATIONSHIP_KIND_LABELS = vocabularyLabels(
  RELATIONSHIP_KIND_DEFINITIONS,
);
export const RelationshipKindSchema = z.enum(
  RELATIONSHIP_KINDS as unknown as [RelationshipKind, ...RelationshipKind[]],
);

export const RELATIONSHIP_FLOW_DEFINITIONS = {
  primary: { label: '正常履约' },
  breach_compensation: { label: '违约补偿' },
  escalation: { label: '争议升级' },
} as const;
export type RelationshipFlowKind = keyof typeof RELATIONSHIP_FLOW_DEFINITIONS;
export const RELATIONSHIP_FLOW_KINDS = vocabularyIds(
  RELATIONSHIP_FLOW_DEFINITIONS,
);
export const RELATIONSHIP_FLOW_LABELS = vocabularyLabels(
  RELATIONSHIP_FLOW_DEFINITIONS,
);
export const RelationshipFlowKindSchema = z.enum(
  RELATIONSHIP_FLOW_KINDS as unknown as [
    RelationshipFlowKind,
    ...RelationshipFlowKind[],
  ],
);

export const CardinalityASTSchema = z
  .object({
    min: z.number().int().nonnegative(),
    max: z.union([z.number().int().min(1), z.literal('many')]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.max !== 'many' && value.min > value.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cardinality min must not exceed max',
        params: { validationCode: 'relationship.cardinality' },
      });
    }
  });
export type CardinalityAST = z.infer<typeof CardinalityASTSchema>;

export const RelationshipASTSchema = z
  .object({
    type: z.literal('relationship'),
    id: DomainIdSchema,
    kind: RelationshipKindSchema,
    // Absence means primary at read time, never materialize a default on disk.
    flowKind: RelationshipFlowKindSchema.optional(),
    sourceRef: DomainIdSchema,
    targetRef: DomainIdSchema,
    label: z.string().min(1),
    sourceCardinality: CardinalityASTSchema.optional(),
    targetCardinality: CardinalityASTSchema.optional(),
    notes: z.string().min(1).optional(),
  })
  .strict();
export type RelationshipAST = z.infer<typeof RelationshipASTSchema>;

export function isRelationshipKind(value: unknown): value is RelationshipKind {
  return isVocabularyId(RELATIONSHIP_KIND_DEFINITIONS, value);
}

/** Value semantics are intentionally left to the owning rule language. */
export function isCardinality(value: unknown): value is CardinalityAST {
  return CardinalityASTSchema.safeParse(value).success;
}
