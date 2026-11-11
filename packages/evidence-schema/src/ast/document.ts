import { isDomainId, isModelVersion } from './id.js';
import type { EntityAST } from './entity.js';
import type { RelationshipAST } from './relationship.js';
import type { RuleAST } from './rule.js';

/** FM schema version emitted by this package. */
export const FM_SCHEMA_VERSION = '5.0' as const;

export const FM_RULE_LANGUAGE = 'CEL' as const;

export interface DomainModelManifest {
  type: 'fm_model';
  schemaVersion: typeof FM_SCHEMA_VERSION;
  id: string;
  name: string;
  version: string;
  ruleLanguage: typeof FM_RULE_LANGUAGE;
  entryContextRefs: string[];
  description?: string;
}

/**
 * In-memory form of a `.evidence/fm/` source tree: the manifest plus the three
 * flat collections. Ordering is preserved from the source files so the disk
 * adapter can report stable, git-friendly output.
 */
export interface DomainModelDocument {
  manifest: DomainModelManifest;
  entities: EntityAST[];
  relationships: RelationshipAST[];
  rules: RuleAST[];
}

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
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    candidate.type === 'fm_model' &&
    candidate.schemaVersion === FM_SCHEMA_VERSION &&
    isDomainId(candidate.id) &&
    typeof candidate.name === 'string' &&
    isModelVersion(candidate.version) &&
    candidate.ruleLanguage === FM_RULE_LANGUAGE &&
    Array.isArray(candidate.entryContextRefs)
  );
}
