import { ipcMain, type IpcMainInvokeEvent } from 'electron';

import {
  EVIDENCE_BRANCH_IPC_CHANNELS,
  type BranchChangedEvent,
  type BranchCompareInput,
  type BranchCreateInput,
  type BranchMergeInput,
  type BranchRemoveInput,
  type BranchSwitchInput,
} from '../shared/branches';

import type { BranchStore } from './branchStore';

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
    async (_event: IpcMainInvokeEvent, rootPath: string) => store.list(rootPath),
  );

  ipcMain.handle(
    EVIDENCE_BRANCH_IPC_CHANNELS.create,
    async (_event: IpcMainInvokeEvent, input: BranchCreateInput) =>
      store.create(input),
  );

  ipcMain.handle(
    EVIDENCE_BRANCH_IPC_CHANNELS.switchTo,
    async (_event: IpcMainInvokeEvent, input: BranchSwitchInput) => {
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
      store.compare(input),
  );

  return {
    dispose: () => {
      for (const channel of channels) {
        ipcMain.removeHandler(channel);
      }
    },
  };
};
