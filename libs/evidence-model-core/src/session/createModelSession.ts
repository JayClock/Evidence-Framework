import { applyPatches, produceWithPatches, type Patch } from 'immer';
import {
  type DomainModelDocument,
  type JsonPatchOperation,
  type ValidationResult,
  strictValidateDomainModel,
} from '@evidence-poc/evidence-schema';
import { createDomainGraph, type DomainGraph } from '../model/graph.js';
import { applyJsonPatchMutator } from './jsonPatches.js';
import { snapshotRecipeResult } from './recipeResult.js';
import type {
  HistoryEntry,
  ModelRecipe,
  ModelSelection,
  ModelSessionEvent,
} from './types.js';

export interface ModelSessionOptions {
  document: DomainModelDocument;
  historyLimit?: number;
  /** Progressive editing may be incomplete; opt in to reject static FM violations. */
  validateOnDispatch?: boolean;
}

export class ModelSessionValidationError extends Error {
  readonly issues: readonly string[];
  constructor(result: ValidationResult) {
    super(
      `mutation rejected: ${result.issues.length} static FM issue(s); first: ${result.issues[0]?.message ?? 'unknown'}`,
    );
    this.name = 'ModelSessionValidationError';
    this.issues = result.issues.map(
      (issue) => `${issue.path}: ${issue.message}`,
    );
  }
}

export interface ModelSession {
  getDocument(): DomainModelDocument;
  getGraph(): DomainGraph;
  getSelection(): ModelSelection;
  validate(): ValidationResult;
  canUndo(): boolean;
  canRedo(): boolean;
  mutate<TResult>(recipe: ModelRecipe<TResult>, label?: string): TResult;
  applyPatchBatch(patches: readonly JsonPatchOperation[], label?: string): void;
  undo(): boolean;
  redo(): boolean;
  select(nodeId: string | null): void;
  selectAttribute(nodeId: string, attributeName: string | null): void;
  clearSelection(): void;
  replaceDocument(
    document: DomainModelDocument,
    options?: { resetHistory?: boolean },
  ): void;
  subscribe(listener: (event: ModelSessionEvent) => void): () => void;
}

/** Array shifts are not changes to the shifted objects. Include deleted/renamed
 * identities from before as well as additions from after, plus edge endpoints. */
export const extractAffectedIds = (
  before: DomainModelDocument,
  after: DomainModelDocument,
): readonly string[] => {
  const affected = new Set<string>();
  const previous = new Map(
    [...before.entities, ...before.relationships, ...before.rules].map(
      (item) => [item.id, item],
    ),
  );
  const next = new Map(
    [...after.entities, ...after.relationships, ...after.rules].map((item) => [
      item.id,
      item,
    ]),
  );
  for (const [id, item] of [...previous, ...next]) {
    if (previous.get(id) === next.get(id)) continue;
    affected.add(id);
    if (item.type === 'relationship') {
      affected.add(item.sourceRef);
      affected.add(item.targetRef);
    }
  }
  return [...affected];
};

export function createModelSession(options: ModelSessionOptions): ModelSession {
  const historyLimit = Number.isFinite(options.historyLimit)
    ? Math.max(1, Math.floor(options.historyLimit!))
    : 100;
  const listeners = new Set<(event: ModelSessionEvent) => void>();
  let document = options.document;
  let graph: DomainGraph | undefined;
  let selection: ModelSelection = { nodeId: null, attributeName: null };
  let undoStack: HistoryEntry[] = [];
  let redoStack: HistoryEntry[] = [];
  const emit = (event: ModelSessionEvent): void => {
    for (const listener of listeners) listener(event);
  };
  const emitHistory = (): void =>
    emit({
      type: 'history-changed',
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
    });
  const updateDocument = (next: DomainModelDocument): void => {
    document = next;
    graph = undefined;
    const selected = document.entities.find(
      (entity) => entity.id === selection.nodeId,
    );
    if (selection.nodeId !== null && selected === undefined) {
      selection = { nodeId: null, attributeName: null };
      emit({ type: 'selection-changed', selection });
    } else if (
      selection.attributeName !== null &&
      !selected?.attributes?.some(
        (attribute) => attribute.name === selection.attributeName,
      )
    ) {
      selection = { nodeId: selection.nodeId, attributeName: null };
      emit({ type: 'selection-changed', selection });
    }
  };
  const guard = (next: DomainModelDocument): void => {
    if (options.validateOnDispatch) {
      const validation = strictValidateDomainModel(next);
      if (!validation.valid) throw new ModelSessionValidationError(validation);
    }
  };
  const record = (
    next: DomainModelDocument,
    patches: Patch[],
    inversePatches: Patch[],
    label: string,
  ): void => {
    if (patches.length === 0) return;
    guard(next);
    const affectedIds = extractAffectedIds(document, next);
    undoStack = [
      ...undoStack,
      { label, patches, inversePatches, affectedIds },
    ].slice(-historyLimit);
    redoStack = [];
    updateDocument(next);
    emit({ type: 'document-changed', commands: [label], affectedIds });
    emitHistory();
  };
  const mutate = <TResult>(
    recipe: ModelRecipe<TResult>,
    label = 'mutation',
  ): TResult => {
    let result!: TResult;
    const [next, patches, inverse] = produceWithPatches(document, (draft) => {
      result = snapshotRecipeResult(recipe(draft));
    });
    record(next, patches, inverse, label);
    return result;
  };
  const travel = (undo: boolean): boolean => {
    const entry = (undo ? undoStack : redoStack).at(-1);
    if (!entry) return false;
    const next = applyPatches(
      document,
      undo ? entry.inversePatches : entry.patches,
    );
    if (undo) {
      undoStack.pop();
      redoStack.push(entry);
    } else {
      redoStack.pop();
      undoStack.push(entry);
    }
    updateDocument(next);
    emit({
      type: 'document-changed',
      commands: [`${undo ? 'undo' : 'redo'}:${entry.label}`],
      affectedIds: entry.affectedIds,
    });
    emitHistory();
    return true;
  };
  return {
    getDocument: () => document,
    getGraph: () => (graph ??= createDomainGraph(document)),
    getSelection: () => selection,
    validate: () => strictValidateDomainModel(document),
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    mutate,
    applyPatchBatch: (patches, label = 'batch-patches') => {
      mutate((draft) => applyJsonPatchMutator(draft, patches), label);
    },
    undo: () => travel(true),
    redo: () => travel(false),
    select: (nodeId) => {
      selection = { nodeId, attributeName: null };
      emit({ type: 'selection-changed', selection });
    },
    selectAttribute: (nodeId, attributeName) => {
      selection = { nodeId, attributeName };
      emit({ type: 'selection-changed', selection });
    },
    clearSelection: () => {
      selection = { nodeId: null, attributeName: null };
      emit({ type: 'selection-changed', selection });
    },
    replaceDocument: (next, opts) => {
      if (opts?.resetHistory) {
        undoStack = [];
        redoStack = [];
        const affectedIds = extractAffectedIds(document, next);
        updateDocument(next);
        emit({
          type: 'document-changed',
          commands: ['replace-document'],
          affectedIds,
        });
        emitHistory();
      } else {
        const [replacement, patches, inverse] = produceWithPatches(
          document,
          () => next,
        );
        record(replacement, patches, inverse, 'replace-document');
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
