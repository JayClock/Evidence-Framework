import type { Draft, Patch } from 'immer';
import type {
  DomainModelDocument,
  JsonPatchOperation,
} from '@evidence-poc/evidence-schema';

export type HistoryPatches =
  | {
      format: 'immer';
      patches: readonly Patch[];
      inversePatches: readonly Patch[];
    }
  | {
      format: 'json';
      patches: readonly JsonPatchOperation[];
      inversePatches: readonly JsonPatchOperation[];
    };

export type HistoryEntry = HistoryPatches & {
  readonly label: string;
  readonly affectedIds: readonly string[];
};

/** Return values are detached from Immer drafts before the recipe scope closes. */
export type ModelRecipe<TResult = void> = (
  draft: Draft<DomainModelDocument>,
) => TResult;

export interface ModelSelection {
  readonly nodeId: string | null;
  readonly attributeName: string | null;
}

export type ModelSessionEvent =
  | {
      type: 'document-changed';
      commands: readonly string[];
      affectedIds: readonly string[];
    }
  | { type: 'selection-changed'; selection: ModelSelection }
  | { type: 'history-changed'; canUndo: boolean; canRedo: boolean };
