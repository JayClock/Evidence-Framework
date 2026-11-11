import { useCallback, useEffect, useRef, useState } from 'react';

import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type { ModelDiff } from '@evidence-poc/evidence-model-core/browser';
import {
  compareVerdictSnapshots,
  type VerdictDiff,
} from '@evidence-poc/evidence-modeling-orchestrator/browser';

import type { EvidenceBranchSummary } from '../../shared/branches';

export interface BranchState {
  loading: boolean;
  error: string | null;
  branches: readonly EvidenceBranchSummary[];
  activeBranchId: string;
  /** Branch picked for comparison, or null when no comparison is open. */
  compareBranchId: string | null;
  comparison: {
    diff: ModelDiff;
    baseDocument: DomainModelDocument;
    targetDocument: DomainModelDocument;
    baseBranchId: string;
    targetBranchId: string;
  } | null;
  comparisonError: string | null;
  /** Last mutation failure, so the header can explain a rejected action. */
  actionError: string | null;
  busy: boolean;
}

export interface BranchController {
  state: BranchState;
  reload: () => Promise<void>;
  fork: (name: string, description?: string) => Promise<boolean>;
  /** Checks a branch out and hands back the document to adopt. */
  checkout: (branchId: string) => Promise<DomainModelDocument | null>;
  compareWith: (branchId: string | null) => Promise<void>;
  merge: (branchId: string) => Promise<boolean>;
  remove: (branchId: string) => Promise<boolean>;
  clearActionError: () => void;
}

const initialState: BranchState = {
  loading: true,
  error: null,
  branches: [],
  activeBranchId: 'main',
  compareBranchId: null,
  comparison: null,
  comparisonError: null,
  actionError: null,
  busy: false,
};

/**
 * Owns the branch list, the checkout and the comparison for one editor window.
 *
 * The renderer never writes `.evidence/`; it asks the main process and adopts the
 * document a checkout returns, so undo history, dirty state and the canvas all
 * follow the same path a disk reload already uses.
 */
export const useBranches = (rootPath: string): BranchController => {
  const [state, setState] = useState<BranchState>(initialState);
  const compareBranchIdRef = useRef<string | null>(null);

  const applyList = useCallback(
    (branches: readonly EvidenceBranchSummary[], activeBranchId: string) => {
      setState((current) => ({
        ...current,
        loading: false,
        error: null,
        branches,
        activeBranchId,
      }));
    },
    [],
  );

  const reload = useCallback(async () => {
    const result = await window.evidenceAPI.branches.list(rootPath);

    if (!result.success) {
      setState((current) => ({
        ...current,
        loading: false,
        error: result.error,
      }));
      return;
    }

    applyList(result.branches, result.activeBranchId);
  }, [applyList, rootPath]);

  const refreshComparison = useCallback(
    async (baseBranchId: string, targetBranchId: string) => {
      const result = await window.evidenceAPI.branches.compare({
        rootPath,
        baseBranchId,
        targetBranchId,
      });

      setState((current) =>
        result.success
          ? {
              ...current,
              compareBranchId: targetBranchId,
              comparison: result.comparison,
              comparisonError: null,
              busy: false,
            }
          : {
              ...current,
              compareBranchId: targetBranchId,
              comparison: null,
              comparisonError: result.error,
              busy: false,
            },
      );
    },
    [rootPath],
  );

  useEffect(() => {
    let active = true;

    void window.evidenceAPI.branches.list(rootPath).then((result) => {
      if (!active) {
        return;
      }

      if (result.success) {
        applyList(result.branches, result.activeBranchId);
      } else {
        setState((current) => ({
          ...current,
          loading: false,
          error: result.error,
        }));
      }
    });

    const unsubscribe = window.evidenceAPI.branches.onChanged((event) => {
      if (event.rootPath !== rootPath) {
        return;
      }

      void window.evidenceAPI.branches
        .list(rootPath)
        .then((result) => {
          if (result.success) {
            applyList(result.branches, result.activeBranchId);
          }
        })
        .catch(() => undefined);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [applyList, rootPath]);

  const fork = useCallback(
    async (name: string, description?: string) => {
      setState((current) => ({ ...current, busy: true, actionError: null }));

      const result = await window.evidenceAPI.branches.create({
        rootPath,
        name,
        ...(description === undefined ? {} : { description }),
        sourceBranchId: state.activeBranchId,
      });

      if (!result.success) {
        setState((current) => ({
          ...current,
          busy: false,
          actionError: result.error,
        }));
        return false;
      }

      setState((current) => ({
        ...current,
        busy: false,
        actionError: null,
        branches: [...current.branches, result.branch],
      }));
      await reload();

      return true;
    },
    [reload, rootPath, state.activeBranchId],
  );

  const checkout = useCallback(
    async (branchId: string) => {
      setState((current) => ({ ...current, busy: true, actionError: null }));

      const result = await window.evidenceAPI.branches.switchTo({
        rootPath,
        branchId,
      });

      if (!result.success) {
        setState((current) => ({
          ...current,
          busy: false,
          actionError: result.error,
        }));
        return null;
      }

      setState((current) => ({
        ...current,
        busy: false,
        activeBranchId: result.branch.id,
        // A comparison against the branch we just left is still meaningful, but
        // comparing a branch with itself is not.
        compareBranchId:
          current.compareBranchId === result.branch.id
            ? null
            : current.compareBranchId,
        comparison:
          current.compareBranchId === result.branch.id
            ? null
            : current.comparison,
      }));
      await reload();

      return result.document;
    },
    [reload, rootPath],
  );

  const compareWith = useCallback(
    async (branchId: string | null) => {
      if (branchId === null) {
        compareBranchIdRef.current = null;
        setState((current) => ({
          ...current,
          compareBranchId: null,
          comparison: null,
          comparisonError: null,
        }));
        return;
      }

      if (branchId === state.activeBranchId) {
        setState((current) => ({
          ...current,
          compareBranchId: null,
          comparison: null,
          comparisonError: '当前检出的分支不能与自身对比。',
        }));
        return;
      }

      compareBranchIdRef.current = branchId;
      setState((current) => ({ ...current, busy: true }));
      await refreshComparison(state.activeBranchId, branchId);
    },
    [refreshComparison, state.activeBranchId],
  );

  const merge = useCallback(
    async (branchId: string) => {
      setState((current) => ({ ...current, busy: true, actionError: null }));

      const result = await window.evidenceAPI.branches.merge({
        rootPath,
        sourceBranchId: branchId,
      });

      if (!result.success) {
        setState((current) => ({
          ...current,
          busy: false,
          actionError: result.error,
        }));
        return false;
      }

      setState((current) => ({
        ...current,
        busy: false,
        activeBranchId: 'main',
        compareBranchId: null,
        comparison: null,
      }));
      await reload();

      return true;
    },
    [reload, rootPath],
  );

  const remove = useCallback(
    async (branchId: string) => {
      setState((current) => ({ ...current, busy: true, actionError: null }));

      const result = await window.evidenceAPI.branches.remove({
        rootPath,
        branchId,
      });

      if (!result.success) {
        setState((current) => ({
          ...current,
          busy: false,
          actionError: result.error,
        }));
        return false;
      }

      setState((current) => ({
        ...current,
        busy: false,
        compareBranchId:
          current.compareBranchId === branchId ? null : current.compareBranchId,
        comparison:
          current.compareBranchId === branchId ? null : current.comparison,
      }));
      await reload();

      return true;
    },
    [reload, rootPath],
  );

  return {
    state,
    reload,
    fork,
    checkout,
    compareWith,
    merge,
    remove,
    clearActionError: () =>
      setState((current) => ({ ...current, actionError: null })),
  };
};

/**
 * Compares the verdict each branch last recorded.
 *
 * Snapshots come from the branch metadata, not from the active window's report:
 * a branch that never ran its sensors reports as not comparable instead of
 * borrowing a verdict it did not earn.
 */
export const compareBranchVerdicts = (
  branches: readonly EvidenceBranchSummary[],
  baseBranchId: string,
  targetBranchId: string,
): VerdictDiff =>
  compareVerdictSnapshots(
    branches.find((branch) => branch.id === baseBranchId)?.lastVerdict ?? null,
    branches.find((branch) => branch.id === targetBranchId)?.lastVerdict ??
      null,
  );
