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

/** Validate against own JSON members before the library can coerce an array
 * index to int32 (e.g. 4294967296 -> 0), or resolve an inherited property. */
const assertLocation = (
  root: unknown,
  pointer: string,
  adding = false,
): void => {
  if (pointer === '') return;
  const parts = pointer
    .slice(1)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
  let node = root;
  for (const [index, part] of parts.entries()) {
    const last = index === parts.length - 1;
    if (node === null || typeof node !== 'object')
      throw new Error(`Patch path '${pointer}' does not exist.`);
    if (Array.isArray(node)) {
      if (last && adding && part === '-') return;
      const offset = Number(part);
      if (
        !/^(0|[1-9][0-9]*)$/.test(part) ||
        !Number.isSafeInteger(offset) ||
        offset >= node.length + Number(last && adding)
      ) {
        throw new Error(
          `Patch path '${pointer}' has an invalid or out-of-bounds array index.`,
        );
      }
    }
    if (last && adding) return;
    if (!Object.hasOwn(node, part))
      throw new Error(`Patch path '${pointer}' does not exist.`);
    node = (node as Record<string, unknown>)[part];
  }
};

export const applyJsonPatchMutator = (
  draft: Draft<DomainModelDocument>,
  patches: readonly JsonPatchOperation[],
): void => {
  // Never freeze caller-owned values or alias them into the document.
  const operations = structuredClone(JsonPatchSchema.parse(patches));
  if (operations.length === 0) return;
  let next: DomainModelDocument = draft;
  for (const operation of operations) {
    if (operation.op === 'move' || operation.op === 'copy')
      assertLocation(next, operation.from);
    if (operation.op === 'move') {
      if (operation.path.startsWith(`${operation.from}/`))
        throw new Error('Cannot move a value into its own descendant.');
      if (operation.path === operation.from) continue;
      const removed = jsonPatch.applyOperation(
        next,
        { op: 'remove', path: operation.from },
        true,
      );
      next = removed.newDocument;
      // RFC 6902 evaluates the destination after removing the source.
      assertLocation(next, operation.path, true);
      next = jsonPatch.applyOperation(
        next,
        { op: 'add', path: operation.path, value: removed.removed },
        true,
      ).newDocument;
    } else {
      assertLocation(
        next,
        operation.path,
        operation.op === 'add' || operation.op === 'copy',
      );
      next = jsonPatch.applyOperation(next, operation, true).newDocument;
    }
  }
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

/** Materialize one atomic transaction against the current document. */
export const prepareModelPatchBatch = (
  document: DomainModelDocument,
  operations: readonly JsonPatchOperation[],
) => {
  const [next, patches, inversePatches] = produceWithPatches(
    document,
    (draft) => {
      applyJsonPatchMutator(draft, operations);
    },
  );
  return {
    document: next,
    patches: toJsonPatches(patches),
    inversePatches: toJsonPatches(inversePatches),
  };
};

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
