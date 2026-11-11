import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EVIDENCE_BRANCH_IPC_CHANNELS,
  type BranchChangedEvent,
  type EvidenceBranchSummary,
} from '../shared/branches';

import type { BranchStore } from './branchStore';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    },
    removeHandler: (channel: string) => {
      handlers.delete(channel);
    },
  },
}));

const { registerBranchIpc } = await import('./branchIpcHandlers');

const branch = (
  overrides: Partial<EvidenceBranchSummary> = {},
): EvidenceBranchSummary => ({
  id: 'main',
  name: '主干（main）',
  parentBranchId: null,
  sourceEntryId: null,
  createdAt: '2026-11-11T08:00:00.000Z',
  updatedAt: '2026-11-11T08:00:00.000Z',
  modelId: 'procurement',
  entityCount: 2,
  relationshipCount: 0,
  ruleCount: 0,
  isActive: true,
  sessionFile: null,
  sessionEntryCount: 0,
  status: 'open',
  ...overrides,
});

const storeOf = (overrides: Partial<BranchStore> = {}): BranchStore => ({
  list: async () => ({
    success: true,
    branches: [branch()],
    activeBranchId: 'main',
  }),
  create: async (input) => ({
    success: true,
    branch: branch({ id: input.name, name: input.name, isActive: false }),
  }),
  switchTo: async (input) => ({
    success: true,
    branch: branch({ id: input.branchId, isActive: true }),
    document: { manifest: {} } as never,
    savedPrevious: true,
  }),
  merge: async (input) => ({
    success: true,
    branch: branch({ id: input.sourceBranchId, status: 'merged' }),
    written: [],
    unchanged: [],
    removed: [],
    mergedAt: '2026-11-11T09:00:00.000Z',
  }),
  remove: async (input) => ({
    success: true,
    removedBranchId: input.branchId,
  }),
  compare: async () => ({ success: false, error: '未实现。' }),
  recordVerdict: async () => undefined,
  checkoutModelRoot: () => '/models/procurement/.evidence/fm',
  activeSessionFile: async () => null,
  ...overrides,
});

const invoke = (channel: string, ...args: unknown[]): unknown => {
  const handler = handlers.get(channel);

  if (handler === undefined) {
    throw new Error(`${channel} was not registered`);
  }

  return handler({}, ...args);
};

describe('registerBranchIpc', () => {
  beforeEach(() => {
    handlers.clear();
  });

  it('registers every branch channel and removes them on dispose', () => {
    const ipc = registerBranchIpc({ store: storeOf() });

    expect([...handlers.keys()].sort()).toEqual(
      [
        EVIDENCE_BRANCH_IPC_CHANNELS.list,
        EVIDENCE_BRANCH_IPC_CHANNELS.create,
        EVIDENCE_BRANCH_IPC_CHANNELS.switchTo,
        EVIDENCE_BRANCH_IPC_CHANNELS.merge,
        EVIDENCE_BRANCH_IPC_CHANNELS.remove,
        EVIDENCE_BRANCH_IPC_CHANNELS.compare,
      ].sort(),
    );

    ipc.dispose();

    expect(handlers.size).toBe(0);
  });

  it('drops the agent runtime and broadcasts after a checkout', async () => {
    const onCheckout = vi.fn<(rootPath: string, branchId: string) => void>();
    const publish = vi.fn<(event: BranchChangedEvent) => void>();

    registerBranchIpc({ store: storeOf(), onCheckout, publish });

    const result = await invoke(EVIDENCE_BRANCH_IPC_CHANNELS.switchTo, {
      rootPath: '/models/procurement',
      branchId: 'monthly',
    });

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(onCheckout).toHaveBeenCalledWith('/models/procurement', 'monthly');
    expect(publish).toHaveBeenCalledWith({
      rootPath: '/models/procurement',
      activeBranchId: 'monthly',
      reason: 'switch',
    });
  });

  it('stays silent when a checkout is rejected', async () => {
    const onCheckout = vi.fn();
    const publish = vi.fn();

    registerBranchIpc({
      store: storeOf({
        switchTo: async () => ({ success: false, error: '分支不存在。' }),
      }),
      onCheckout,
      publish,
    });

    const result = await invoke(EVIDENCE_BRANCH_IPC_CHANNELS.switchTo, {
      rootPath: '/models/procurement',
      branchId: 'nope',
    });

    expect(result).toEqual({ success: false, error: '分支不存在。' });
    expect(onCheckout).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('reports a merge back to main and clears the runtime', async () => {
    const onCheckout = vi.fn();
    const publish = vi.fn();

    registerBranchIpc({ store: storeOf(), onCheckout, publish });

    await invoke(EVIDENCE_BRANCH_IPC_CHANNELS.merge, {
      rootPath: '/models/procurement',
      sourceBranchId: 'monthly',
    });

    expect(onCheckout).toHaveBeenCalledWith('/models/procurement', 'main');
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ activeBranchId: 'main', reason: 'merge' }),
    );
  });
});

describe('registerBranchIpc with a bundle project', () => {
  beforeEach(() => {
    handlers.clear();
  });

  const bundlePath = '/models/procurement.evidence.json';

  it('lists one read-only branch instead of snapshotting a file', async () => {
    registerBranchIpc({ store: storeOf() });

    const result = (await invoke(
      EVIDENCE_BRANCH_IPC_CHANNELS.list,
      bundlePath,
    )) as { success: boolean; activeBranchId: string; branches: unknown[] };

    expect(result.success).toBe(true);
    expect(result.activeBranchId).toBe('main');
    expect(result.branches).toHaveLength(1);
  });

  it('refuses forks, merges and comparisons with an explanation', async () => {
    const onCheckout = vi.fn();
    const publish = vi.fn();

    registerBranchIpc({ store: storeOf(), onCheckout, publish });

    const fork = (await invoke(EVIDENCE_BRANCH_IPC_CHANNELS.create, {
      rootPath: bundlePath,
      name: 'monthly',
    })) as { success: boolean; error: string };
    const merge = (await invoke(EVIDENCE_BRANCH_IPC_CHANNELS.merge, {
      rootPath: bundlePath,
      sourceBranchId: 'monthly',
    })) as { success: boolean; error: string };
    const remove = (await invoke(EVIDENCE_BRANCH_IPC_CHANNELS.remove, {
      rootPath: bundlePath,
      branchId: 'monthly',
    })) as { success: boolean; error: string };

    expect(fork.success).toBe(false);
    expect(fork.error).toContain('单文件模型');
    expect(merge.success).toBe(false);
    expect(remove.success).toBe(false);
    expect(onCheckout).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
