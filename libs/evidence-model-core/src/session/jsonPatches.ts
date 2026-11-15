import {
  enablePatches,
  produceWithPatches,
  type Draft,
  type Patch,
} from 'immer';
import jsonPatch from 'fast-json-patch';
import {
  DomainModelDocumentSyntaxSchema,
  JsonPatchSchema,
  type DomainModelDocument,
  type JsonPatchOperation,
} from '@evidence-poc/evidence-schema';
import type { ModelRecipe } from './types.js';
import { snapshotRecipeResult } from './recipeResult.js';

enablePatches();

/** Keep Immer paths private. Only RFC 6901 pointers cross process/tool boundaries. */
export const toJsonPatches = (
  patches: readonly Patch[],
): JsonPatchOperation[] =>
  JsonPatchSchema.parse(
    patches.map((patch) => ({
      ...patch,
      path:
        patch.path.length === 0
          ? ''
          : `/${patch.path.map((part) => String(part).replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`,
    })),
  );

export const applyJsonPatchMutator = (
  draft: Draft<DomainModelDocument>,
  patches: readonly JsonPatchOperation[],
): void => {
  // Parsing and cloning also prevent caller-owned values from becoming frozen or
  // aliased into the session. The RFC implementation validates each operation
  // against the evolving draft, including test/from and array bounds.
  const operations = structuredClone(JsonPatchSchema.parse(patches));
  for (const operation of operations) {
    if (
      operation.op === 'move' &&
      operation.path.startsWith(`${operation.from}/`)
    ) {
      throw new Error('Cannot move a value into its own descendant.');
    }
  }
  const next = jsonPatch.applyPatch(
    draft,
    operations,
    true,
    true,
    true,
  ).newDocument;
  DomainModelDocumentSyntaxSchema.parse(next);
  // Root add/replace/copy/move may replace the RFC document, even after earlier
  // writes. Reconcile it into the draft instead of returning a replacement from
  // an already-mutated Immer recipe.
  if (next !== draft) {
    for (const key of Object.keys(draft) as (keyof DomainModelDocument)[]) {
      if (!(key in next)) delete draft[key];
    }
    Object.assign(draft, next);
  }
};

/** Read-only preview used by API checks; the source document is never modified. */
export const applyModelPatches = (
  document: DomainModelDocument,
  patches: readonly JsonPatchOperation[],
): DomainModelDocument =>
  produceWithPatches(document, (draft) => {
    applyJsonPatchMutator(draft, patches);
  })[0];

/** Run a domain operator locally and send only its standard patches over IPC. */
export const createModelPatch = <TResult>(
  document: DomainModelDocument,
  recipe: ModelRecipe<TResult>,
): { result: TResult; patches: JsonPatchOperation[] } => {
  let result!: TResult;
  const [, patches] = produceWithPatches(document, (draft) => {
    result = snapshotRecipeResult(recipe(draft));
  });
  return { result, patches: toJsonPatches(patches) };
};
