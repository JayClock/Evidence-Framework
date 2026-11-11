import { ipcMain, type IpcMainInvokeEvent } from 'electron';

import { readModelBundle } from '@evidence-poc/evidence-model-core';

import {
  EVIDENCE_BRANCH_IPC_CHANNELS,
  MAIN_BRANCH_ID,
  type BranchChangedEvent,
  type BranchCompareInput,
  type BranchCreateInput,
  type BranchMergeInput,
  type BranchRemoveInput,
  type BranchSwitchInput,
} from '../shared/branches';

import type { BranchStore } from './branchStore';
import { isBundleProject } from './modelSource';

/**
 * A bundle is one file, so lineages have nothing to snapshot.
 *
 * The editor still lists a single active branch, and every mutation explains why
 * it is unavailable instead of failing somewhere inside the branch store.
 */
const BUNDLE_BRANCH_ERROR =
  '单文件模型（*.evidence.json）不支持分支；请改用包含 .evidence/fm 源树的项目。';

const bundleBranch = async (rootPath: string) => {
  const parsed = await readModelBundle(rootPath).catch(() => null);
  const document = parsed?.document;
  const timestamp = new Date().toISOString();

  return {
    id: MAIN_BRANCH_ID,
    name: '单文件模型',
    parentBranchId: null,
    sourceEntryId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    modelId: document?.manifest.id ?? null,
    entityCount: document?.entities.length ?? 0,
    relationshipCount: document?.relationships.length ?? 0,
    ruleCount: document?.rules.length ?? 0,
    isActive: true,
    sessionFile: null,
    sessionEntryCount: 0,
    status: 'open' as const,
  };
};

export interface BranchIpcOptions {
  store: BranchStore;
  /**
   * Called after a checkout succeeds.
   *
   * The agent runtime holds a session and a sensor engine for the previous
   * branch, so it is dropped instead of being reused across lineages.
   */
  onCheckout?: (rootPath: string, branchId: string) => void;
  /** Broadcasts the mutation so other windows refresh their branch list. */
  publish?: (event: BranchChangedEvent) => void;
}

/**
 * Registers the branch IPC surface.
 *
 * Every handler keys on the project root, so several windows can compare
 * different branches of the same repository without sharing state.
 */
export const registerBranchIpc = ({
  store,
  onCheckout,
  publish,
}: BranchIpcOptions): { dispose: () => void } => {
  const channels = Object.values(EVIDENCE_BRANCH_IPC_CHANNELS);

  ipcMain.handle(
    EVIDENCE_BRANCH_IPC_CHANNELS.list,
    async (_event: IpcMainInvokeEvent, rootPath: string) =>
      isBundleProject(rootPath)
        ? {
            success: true as const,
            branches: [await bundleBranch(rootPath)],
            activeBranchId: MAIN_BRANCH_ID,
          }
        : store.list(rootPath),
  );

  ipcMain.handle(
    EVIDENCE_BRANCH_IPC_CHANNELS.create,
    async (_event: IpcMainInvokeEvent, input: BranchCreateInput) =>
      isBundleProject(input.rootPath)
        ? { success: false as const, error: BUNDLE_BRANCH_ERROR }
        : store.create(input),
  );

  ipcMain.handle(
    EVIDENCE_BRANCH_IPC_CHANNELS.switchTo,
    async (_event: IpcMainInvokeEvent, input: BranchSwitchInput) => {
      if (isBundleProject(input.rootPath)) {
        return { success: false as const, error: BUNDLE_BRANCH_ERROR };
      }

      const result = await store.switchTo(input);

      if (result.success) {
        onCheckout?.(input.rootPath, result.branch.id);
        publish?.({
          rootPath: input.rootPath,
          activeBranchId: result.branch.id,
          reason: 'switch',
        });
      }

      return result;
    },
  );

  ipcMain.handle(
    EVIDENCE_BRANCH_IPC_CHANNELS.merge,
    async (_event: IpcMainInvokeEvent, input: BranchMergeInput) => {
      if (isBundleProject(input.rootPath)) {
        return { success: false as const, error: BUNDLE_BRANCH_ERROR };
      }

      const result = await store.merge(input);

      if (result.success) {
        onCheckout?.(input.rootPath, 'main');
        publish?.({
          rootPath: input.rootPath,
          activeBranchId: 'main',
          reason: 'merge',
        });
      }

      return result;
    },
  );

  ipcMain.handle(
    EVIDENCE_BRANCH_IPC_CHANNELS.remove,
    async (_event: IpcMainInvokeEvent, input: BranchRemoveInput) => {
      if (isBundleProject(input.rootPath)) {
        return { success: false as const, error: BUNDLE_BRANCH_ERROR };
      }

      const result = await store.remove(input);

      if (result.success) {
        publish?.({
          rootPath: input.rootPath,
          activeBranchId: 'main',
          reason: 'remove',
        });
      }

      return result;
    },
  );

  ipcMain.handle(
    EVIDENCE_BRANCH_IPC_CHANNELS.compare,
    async (_event: IpcMainInvokeEvent, input: BranchCompareInput) =>
      isBundleProject(input.rootPath)
        ? { success: false as const, error: BUNDLE_BRANCH_ERROR }
        : store.compare(input),
  );

  return {
    dispose: () => {
      for (const channel of channels) {
        ipcMain.removeHandler(channel);
      }
    },
  };
};
