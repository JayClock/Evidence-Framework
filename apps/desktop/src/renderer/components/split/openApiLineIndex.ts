import type { LiveRouteBinding } from '../../../shared/delivery';

/**
 * Where one entity lives in the serialized contract.
 *
 * Two indexes, not one: the graph asks "which line shows this object" when it
 * selects something, and the contract asks "which object is on this line" when
 * a reader presses it. Keeping both means neither direction has to scan the
 * document again.
 */
export interface OpenApiLineIndex {
  /** entityId → 1-based line of its schema (or its first route). */
  readonly entityLine: ReadonlyMap<string, number>;
  /** 1-based line → entityId whose declaration starts there. */
  readonly lineEntity: ReadonlyMap<number, string>;
}

const EMPTY_INDEX: OpenApiLineIndex = {
  entityLine: new Map(),
  lineEntity: new Map(),
};

/** A schema key, written the way YAML and JSON each spell it. */
const declaresKey = (line: string, key: string): boolean => {
  const trimmed = line.trim();

  return (
    trimmed.startsWith(`"${key}":`) ||
    trimmed.startsWith(`${key}:`) ||
    // A path key is quoted in YAML too when it contains `/`.
    trimmed.startsWith(`'${key}':`)
  );
};

/**
 * Maps the contract's text back to the entities that produced it.
 *
 * The projection has no source map, and inventing one would mean teaching the
 * API builder about editor line numbers. Reading the serialized document is the
 * cheaper contract: the schema component name is derived from the entity id, and
 * a route path comes from the same preview the canvas already listens to.
 */
export const buildOpenApiLineIndex = (
  text: string,
  bindings: readonly Pick<LiveRouteBinding, 'entityRef' | 'path'>[],
): OpenApiLineIndex => {
  const lines = text.split('\n');

  if (lines.length === 0) return EMPTY_INDEX;

  const firstPathLine = new Map<string, number>();
  const firstSchemaLine = new Map<string, number>();

  lines.forEach((line, index) => {
    const candidate = index + 1;

    for (const binding of bindings) {
      if (firstPathLine.has(binding.entityRef)) continue;
      if (!declaresKey(line, binding.path)) continue;
      firstPathLine.set(binding.entityRef, candidate);
    }
  });

  const entityIds = new Set(bindings.map((binding) => binding.entityRef));

  lines.forEach((line, index) => {
    const candidate = index + 1;

    for (const entityId of entityIds) {
      if (firstSchemaLine.has(entityId)) continue;
      if (!declaresKey(line, componentKeyOf(entityId))) continue;
      firstSchemaLine.set(entityId, candidate);
    }
  });

  const entityLine = new Map<string, number>();
  const lineEntity = new Map<number, string>();

  for (const entityId of entityIds) {
    const line = firstSchemaLine.get(entityId) ?? firstPathLine.get(entityId);

    if (line === undefined) continue;
    entityLine.set(entityId, line);
    if (!lineEntity.has(line)) lineEntity.set(line, entityId);
  }

  return { entityLine, lineEntity };
};

/**
 * The component name `evidence-api` derives for an entity id.
 *
 * Duplicated rather than imported: the renderer only receives the serialized
 * contract, and reaching into the projection library for a two-line string fold
 * would drag the whole API builder into the desktop bundle.
 */
export const componentKeyOf = (entityId: string): string =>
  entityId.replaceAll('.', '_').replace(/[^A-Za-z0-9._-]/g, '_');
