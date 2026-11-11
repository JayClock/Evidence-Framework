import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type {
  ContextEntityAST,
  DomainModelDocument,
  DomainModelManifest,
  EntityAST,
  EvidenceEntityAST,
  ParticipantEntityAST,
  RelationshipAST,
  RoleEntityAST,
  RuleAST,
} from '../../src/index.js';

const FIXTURE_ROOT = join(import.meta.dirname, '..', 'fixtures');

const listJsonFiles = (directory: string): string[] => {
  const entries = readdirSync(directory).sort();
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      files.push(...listJsonFiles(path));
      continue;
    }

    if (entry.endsWith('.json')) {
      files.push(path);
    }
  }

  return files;
};

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

const readCollectionItem = (
  document: DomainModelDocument,
  path: string,
): void => {
  const item = readJson(path);

  switch (item['type']) {
    case 'entity':
      document.entities.push(item as unknown as EntityAST);
      break;
    case 'relationship':
      document.relationships.push(item as unknown as RelationshipAST);
      break;
    case 'rule':
      document.rules.push(item as unknown as RuleAST);
      break;
    default:
      throw new Error(
        `unexpected fixture document type: ${String(item['type'])}`,
      );
  }
};

/** Loads a fixture tree into the in-memory document shape. */
export function loadFixtureModel(
  name = 'product-procurement',
): DomainModelDocument {
  const root = join(FIXTURE_ROOT, name);
  const manifest = readJson(
    join(root, 'model.json'),
  ) as unknown as DomainModelManifest;
  const document: DomainModelDocument = {
    manifest,
    entities: [],
    relationships: [],
    rules: [],
  };

  for (const collection of ['entities', 'relationships', 'rules'] as const) {
    for (const path of listJsonFiles(join(root, collection))) {
      readCollectionItem(document, path);
    }
  }

  return document;
}

export function cloneDocument(
  document: DomainModelDocument,
): DomainModelDocument {
  return structuredClone(document);
}

const requireCategory = <TCategory extends EntityAST['category']>(
  document: DomainModelDocument,
  entityId: string,
  category: TCategory,
): Extract<EntityAST, { category: TCategory }> => {
  const entity = requireEntity(document, entityId);

  if (entity.category !== category) {
    throw new Error(
      `fixture entity '${entityId}' is ${entity.category}, expected ${category}`,
    );
  }

  return entity as Extract<EntityAST, { category: TCategory }>;
};

export function requireEvidence(
  document: DomainModelDocument,
  entityId: string,
): EvidenceEntityAST {
  return requireCategory(document, entityId, 'evidence');
}

export function requireContext(
  document: DomainModelDocument,
  entityId: string,
): ContextEntityAST {
  return requireCategory(document, entityId, 'context');
}

export function requireRole(
  document: DomainModelDocument,
  entityId: string,
): RoleEntityAST {
  return requireCategory(document, entityId, 'role');
}

export function requireParticipant(
  document: DomainModelDocument,
  entityId: string,
): ParticipantEntityAST {
  return requireCategory(document, entityId, 'participant');
}

export function requireEntity(
  document: DomainModelDocument,
  entityId: string,
): EntityAST {
  const entity = document.entities.find((item) => item.id === entityId);

  if (entity === undefined) {
    throw new Error(`fixture entity '${entityId}' is missing`);
  }

  return entity;
}
