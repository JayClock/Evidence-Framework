import {
  type DomainModelDocument,
  type ValidationResult,
  strictValidateDomainModel,
} from '@evidence-poc/evidence-schema';

import type { ModelCommand } from '../commands/types.js';
import {
  CommandSequence,
  ReplaceDocumentCommand,
} from '../commands/sequence.js';
import { createDomainGraph, type DomainGraph } from '../model/graph.js';

export interface ModelSelection {
  nodeId: string | null;
  attributeName: string | null;
}

export type ModelSessionEvent =
  | {
      type: 'document-changed';
      commands: readonly string[];
      affectedIds: readonly string[];
    }
  | { type: 'selection-changed'; selection: ModelSelection }
  | { type: 'history-changed'; canUndo: boolean; canRedo: boolean };

export interface ModelSessionOptions {
  document: DomainModelDocument;
  /** Maximum undo steps kept in memory; older steps are dropped. */
  historyLimit?: number;
  /**
   * Reject a transition that breaks static FM checks.
   *
   * Off by default because progressive modeling saves one object at a time;
   * agent commits and import flows turn it on to protect the saved tree.
   */
  validateOnDispatch?: boolean;
}

export class ModelSessionValidationError extends Error {
  readonly issues: readonly string[];

  constructor(result: ValidationResult) {
    super(
      `dispatch rejected: ${result.issues.length} static FM issue(s); first: ${
        result.issues[0]?.message ?? 'unknown'
      }`,
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
  /** Applies one command and records it as a single undo step. */
  dispatch<TResult>(command: ModelCommand<TResult>): TResult;
  /** Applies commands as one transaction and one undo step. */
  dispatchAll<TResult>(
    commands: readonly ModelCommand<TResult>[],
    label?: string,
  ): readonly TResult[];
  undo(): boolean;
  redo(): boolean;
  select(nodeId: string | null): void;
  selectAttribute(nodeId: string, attributeName: string | null): void;
  clearSelection(): void;
  /** Replaces the document, e.g. after reloading the source tree from disk. */
  replaceDocument(
    document: DomainModelDocument,
    options?: { resetHistory?: boolean },
  ): void;
  subscribe(listener: (event: ModelSessionEvent) => void): () => void;
}

interface HistoryEntry {
  label: string;
  forward: ModelCommand<unknown>;
  inverse: ModelCommand<unknown>;
}

const DEFAULT_HISTORY_LIMIT = 100;

const emptySelection: ModelSelection = { nodeId: null, attributeName: null };

export function createModelSession(options: ModelSessionOptions): ModelSession {
  const historyLimit = Math.max(
    1,
    options.historyLimit ?? DEFAULT_HISTORY_LIMIT,
  );
  const listeners = new Set<(event: ModelSessionEvent) => void>();
  let document = options.document;
  let graph: DomainGraph | undefined;
  let selection: ModelSelection = emptySelection;
  let undoStack: HistoryEntry[] = [];
  let redoStack: HistoryEntry[] = [];

  const emit = (event: ModelSessionEvent): void => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  const emitHistory = (): void => {
    emit({
      type: 'history-changed',
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
    });
  };

  const applyDocument = (next: DomainModelDocument): void => {
    document = next;
    graph = undefined;

    if (
      selection.nodeId !== null &&
      !document.entities.some((entity) => entity.id === selection.nodeId)
    ) {
      selection = emptySelection;
      emit({ type: 'selection-changed', selection });
    }
  };

  const guard = (next: DomainModelDocument): void => {
    if (options.validateOnDispatch === true) {
      const result = strictValidateDomainModel(next);

      if (!result.valid) {
        throw new ModelSessionValidationError(result);
      }
    }
  };

  const record = (entry: HistoryEntry): void => {
    undoStack = [...undoStack, entry].slice(-historyLimit);
    redoStack = [];
  };

  return {
    getDocument: () => document,
    getGraph: () => {
      graph ??= createDomainGraph(document);

      return graph;
    },
    getSelection: () => selection,
    validate: () => strictValidateDomainModel(document),
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    dispatch: <TResult>(command: ModelCommand<TResult>): TResult => {
      const outcome = command.apply(document);
      guard(outcome.document);
      applyDocument(outcome.document);
      record({
        label: command.type,
        forward: command as ModelCommand<unknown>,
        inverse: outcome.inverse,
      });
      emit({
        type: 'document-changed',
        commands: [command.type],
        affectedIds: outcome.affectedIds,
      });
      emitHistory();

      return outcome.result;
    },
    dispatchAll: <TResult>(
      commands: readonly ModelCommand<TResult>[],
      label = 'sequence',
    ): readonly TResult[] => {
      const sequence = new CommandSequence(
        commands as readonly ModelCommand<unknown>[],
        label,
      );
      const outcome = sequence.apply(document);
      guard(outcome.document);
      applyDocument(outcome.document);
      record({
        label,
        forward: sequence,
        inverse: outcome.inverse,
      });
      emit({
        type: 'document-changed',
        commands: commands.map((command) => command.type),
        affectedIds: outcome.affectedIds,
      });
      emitHistory();

      return outcome.result as TResult[];
    },
    undo: () => {
      const entry = undoStack[undoStack.length - 1];

      if (entry === undefined) {
        return false;
      }

      const outcome = entry.inverse.apply(document);
      undoStack = undoStack.slice(0, -1);
      redoStack = [...redoStack, entry];
      applyDocument(outcome.document);
      emit({
        type: 'document-changed',
        commands: [`undo:${entry.label}`],
        affectedIds: outcome.affectedIds,
      });
      emitHistory();

      return true;
    },
    redo: () => {
      const entry = redoStack[redoStack.length - 1];

      if (entry === undefined) {
        return false;
      }

      const outcome = entry.forward.apply(document);
      redoStack = redoStack.slice(0, -1);
      undoStack = [...undoStack, entry].slice(-historyLimit);
      applyDocument(outcome.document);
      emit({
        type: 'document-changed',
        commands: [`redo:${entry.label}`],
        affectedIds: outcome.affectedIds,
      });
      emitHistory();

      return true;
    },
    select: (nodeId) => {
      selection = { nodeId, attributeName: null };
      emit({ type: 'selection-changed', selection });
    },
    selectAttribute: (nodeId, attributeName) => {
      selection = { nodeId, attributeName };
      emit({ type: 'selection-changed', selection });
    },
    clearSelection: () => {
      selection = emptySelection;
      emit({ type: 'selection-changed', selection });
    },
    replaceDocument: (next, replaceOptions = {}) => {
      const previous = document;

      applyDocument(next);

      if (replaceOptions.resetHistory === true) {
        undoStack = [];
        redoStack = [];
      } else {
        record({
          label: 'replace-document',
          forward: new ReplaceDocumentCommand(next),
          inverse: new ReplaceDocumentCommand(previous),
        });
      }

      emit({
        type: 'document-changed',
        commands: ['replace-document'],
        affectedIds: next.entities.map((entity) => entity.id),
      });
      emitHistory();
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
