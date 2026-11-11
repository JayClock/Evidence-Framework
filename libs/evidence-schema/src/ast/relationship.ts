/** Relationship kinds of the pure graph fulfillment model. */
export const RELATIONSHIP_KINDS = ['plays_role', 'references'] as const;

export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

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

export function isRelationshipKind(
  value: unknown,
): value is RelationshipKind {
  return (
    typeof value === 'string' &&
    (RELATIONSHIP_KINDS as readonly string[]).includes(value)
  );
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
