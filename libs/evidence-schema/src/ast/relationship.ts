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

export interface CardinalityAST {
  min: number;
  max: number | 'many';
}

export interface RelationshipAST {
  type: 'relationship';
  id: string;
  kind: RelationshipKind;
  sourceRef: string;
  targetRef: string;
  label: string;
  sourceCardinality?: CardinalityAST;
  targetCardinality?: CardinalityAST;
  notes?: string;
}

export function isRelationshipKind(value: unknown): value is RelationshipKind {
  return isVocabularyId(RELATIONSHIP_KIND_DEFINITIONS, value);
}

/** Value semantics are intentionally left to the owning rule language. */
export function isCardinality(value: unknown): value is CardinalityAST {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const { min, max } = candidate;

  return (
    typeof min === 'number' &&
    Number.isInteger(min) &&
    min >= 0 &&
    (max === 'many' ||
      (typeof max === 'number' && Number.isInteger(max) && max >= 1)) &&
    (max === 'many' || min <= max)
  );
}
