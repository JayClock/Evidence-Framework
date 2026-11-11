import type { ModelDiff } from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

/** Branch id reserved for the tree that `.evidence/fm` checks out. */
export const MAIN_BRANCH_ID = 'main';

/** One interview lineage the desktop can check out. */
export interface EvidenceBranchSummary {
  id: string;
  name: string;
  description?: string;
  /** Branch this one was forked from; `null` for `main`. */
  parentBranchId: string | null;
  /** Transcript entry the fork continues from, when it was chosen. */
  sourceEntryId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Model the branch currently holds, when its tree could be read. */
  modelId: string | null;
  entityCount: number;
  relationshipCount: number;
  ruleCount: number;
  /** True when this branch is what `.evidence/fm` currently holds. */
  isActive: boolean;
  /** Project-relative transcript snapshot the branch owns. */
  sessionFile: string | null;
  sessionEntryCount: number;
  status: 'open' | 'merged';
  mergedAt?: string;
}

export interface BranchCreateInput {
  rootPath: string;
  name: string;
  description?: string;
  /** Branch to fork from; defaults to the active branch. */
  sourceBranchId?: string;
  /** Transcript entry to fork at; omitted keeps the whole transcript. */
  sourceEntryId?: string | null;
  /** Transcript to fork; defaults to the active branch's snapshot. */
  sessionFile?: string | null;
}

export interface BranchSwitchInput {
  rootPath: string;
  branchId: string;
}

export interface BranchMergeInput {
  rootPath: string;
  /** Branch that wins the decision. */
  sourceBranchId: string;
  /** Keep the source branch as an archived record; defaults to true. */
  keepSourceBranch?: boolean;
}

export interface BranchRemoveInput {
  rootPath: string;
  branchId: string;
}

export type BranchListResult =
  | {
      success: true;
      branches: readonly EvidenceBranchSummary[];
      activeBranchId: string;
    }
  | { success: false; error: string };

export type BranchMutationResult =
  | { success: true; branch: EvidenceBranchSummary }
  | { success: false; error: string };

export type BranchSwitchResult =
  | {
      success: true;
      branch: EvidenceBranchSummary;
      document: DomainModelDocument;
      savedPrevious: boolean;
    }
  | { success: false; error: string };

export type BranchMergeResult =
  | {
      success: true;
      branch: EvidenceBranchSummary;
      written: readonly string[];
      unchanged: readonly string[];
      removed: readonly string[];
      mergedAt: string;
    }
  | { success: false; error: string };

export type BranchRemoveResult =
  | { success: true; removedBranchId: string }
  | { success: false; error: string };

/** Everything the comparison panel needs for one base/target pair. */
export interface BranchComparison {
  baseBranchId: string;
  targetBranchId: string;
  /** Model diff of the two checked-out source trees. */
  diff: ModelDiff;
  baseDocument: DomainModelDocument;
  targetDocument: DomainModelDocument;
}

export type BranchCompareInput = {
  rootPath: string;
  baseBranchId: string;
  targetBranchId: string;
};

export type BranchCompareResult =
  | { success: true; comparison: BranchComparison }
  | { success: false; error: string };

/** Marker the branch store writes next to the model tree it snapshots. */
export interface BranchMetadata {
  id: string;
  name: string;
  description?: string;
  parentBranchId: string | null;
  sourceEntryId: string | null;
  createdAt: string;
  updatedAt: string;
  status: 'open' | 'merged';
  mergedAt?: string;
}
