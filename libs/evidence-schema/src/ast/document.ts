import { z } from 'zod';
import {
  DomainIdSchema,
  ModelVersionSchema,
  isDomainId,
  isModelVersion,
} from './id.js';
import { EntityASTSchema, type EntityAST } from './entity.js';
import { RelationshipASTSchema, type RelationshipAST } from './relationship.js';
import { RuleASTSchema, type RuleAST } from './rule.js';

/** FM schema version emitted by this package. */
export const FM_SCHEMA_VERSION = '5.0' as const;
export const FM_RULE_LANGUAGE = 'CEL' as const;

export const DomainModelManifestSchema = z
  .object({
    type: z.literal('fm_model'),
    schemaVersion: z.literal(FM_SCHEMA_VERSION),
    id: DomainIdSchema,
    name: z.string().min(1),
    version: ModelVersionSchema,
    ruleLanguage: z.literal(FM_RULE_LANGUAGE),
    entryContextRefs: z.array(DomainIdSchema).min(1),
    description: z.string().min(1).optional(),
  })
  .strict();

export const DomainModelDocumentSchema = z
  .object({
    manifest: DomainModelManifestSchema,
    entities: z.array(EntityASTSchema),
    relationships: z.array(RelationshipASTSchema),
    rules: z.array(RuleASTSchema),
  })
  .strict();

export type DomainModelManifest = z.infer<typeof DomainModelManifestSchema>;
export type DomainModelDocument = z.infer<typeof DomainModelDocumentSchema>;

export const EMPTY_MODEL_MANIFEST: DomainModelManifest = {
  type: 'fm_model',
  schemaVersion: FM_SCHEMA_VERSION,
  id: 'untitled',
  name: 'Untitled model',
  version: '0.1.0',
  ruleLanguage: FM_RULE_LANGUAGE,
  entryContextRefs: [],
};

export function createEmptyDomainModel(
  manifest: Partial<DomainModelManifest> = {},
): DomainModelDocument {
  return {
    manifest: { ...EMPTY_MODEL_MANIFEST, ...manifest },
    entities: [],
    relationships: [],
    rules: [],
  };
}

/** Cheap shape guard used before strict validation runs. */
export function isDomainModelDocumentShape(
  value: unknown,
): value is DomainModelDocument {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.manifest === 'object' &&
    candidate.manifest !== null &&
    Array.isArray(candidate.entities) &&
    Array.isArray(candidate.relationships) &&
    Array.isArray(candidate.rules)
  );
}

export function isDomainModelManifest(
  value: unknown,
): value is DomainModelManifest {
  return DomainModelManifestSchema.safeParse(value).success;
}

export type { EntityAST, RelationshipAST, RuleAST };
export { DomainIdSchema, ModelVersionSchema, isDomainId, isModelVersion };
