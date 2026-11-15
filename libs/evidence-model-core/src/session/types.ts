import type { Draft, Patch } from 'immer';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

export interface HistoryEntry {
  readonly label: string;
  readonly patches: readonly Patch[];
  readonly inversePatches: readonly Patch[];
  readonly affectedIds: readonly string[];
}

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
