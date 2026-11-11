import { FM_SCHEMA_VERSION } from '@evidence-poc/evidence-schema';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

/**
 * The model as one sorted document.
 *
 * Downstream stages read a compiled representation rather than the authoring
 * tree: every collection is ordered by id, so two runs that read the same model
 * hand the next stage the same arrays and a diff only shows real changes.
 */
export interface CompiledModelDocument {
  schemaVersion: string;
  model: DomainModelDocument['manifest'];
  entities: DomainModelDocument['entities'];
  relationships: DomainModelDocument['relationships'];
  rules: DomainModelDocument['rules'];
}

const byId = <TItem extends { id: string }>(items: readonly TItem[]): TItem[] =>
  [...items].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );

/** Sorts every collection of a model document by id. */
export const compiledDocument = (
  model: DomainModelDocument,
): CompiledModelDocument => ({
  schemaVersion: FM_SCHEMA_VERSION,
  model: model.manifest,
  entities: byId(model.entities),
  relationships: byId(model.relationships),
  rules: byId(model.rules),
});
