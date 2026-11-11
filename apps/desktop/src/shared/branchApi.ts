import type {
  BranchCompareInput,
  BranchCompareResult,
  BranchCreateInput,
  BranchListResult,
  BranchMergeInput,
  BranchMergeResult,
  BranchMutationResult,
  BranchRemoveInput,
  BranchRemoveResult,
  BranchSwitchInput,
  BranchSwitchResult,
} from './branches';

/** The branch surface the renderer may reach. */
export interface EvidenceBranchesApi {
  list: (rootPath: string) => Promise<BranchListResult>;
  create: (input: BranchCreateInput) => Promise<BranchMutationResult>;
  switchTo: (input: BranchSwitchInput) => Promise<BranchSwitchResult>;
  merge: (input: BranchMergeInput) => Promise<BranchMergeResult>;
  remove: (input: BranchRemoveInput) => Promise<BranchRemoveResult>;
  compare: (input: BranchCompareInput) => Promise<BranchCompareResult>;
  /** Subscribes to branch mutations; returns an unsubscribe. */
  onChanged: (
    listener: (event: { rootPath: string; activeBranchId: string }) => void,
  ) => () => void;
}
