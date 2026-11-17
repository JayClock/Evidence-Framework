import { describe, expect, it, vi } from 'vitest';
import { EVIDENCE_IPC_CHANNELS } from '@evidence-poc/desktop-contracts/ipc';
import { STORY_IPC_CHANNELS } from '@evidence-poc/desktop-contracts/story';
import { registerProjectIpc } from './projectIpc';
import type { ProjectStore } from './projectStore';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  changes: [] as ((paths: string[]) => void)[],
  close: vi.fn(async () => undefined),
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (...args: unknown[]) => Promise<unknown>,
    ) => mocks.handlers.set(channel, handler),
  },
  BrowserWindow: {},
  dialog: {},
}));
vi.mock('./modelWatcher', () => ({
  watchModelSource: (_root: string, change: (paths: string[]) => void) => {
    mocks.changes.push(change);
    return { close: mocks.close };
  },
}));

describe('project story invalidation', () => {
  it('notifies only the watching window with its project and cleans up destroyed senders', async () => {
    const projectStore = {
      open: async (rootPath: string) => ({
        success: true,
        project: { rootPath },
      }),
    } as ProjectStore;
    registerProjectIpc({ projectStore, openEditorWindow: vi.fn() });
    const first = {
      id: 1,
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
      once: vi.fn(),
    };
    const second = { ...first, id: 2, send: vi.fn() };
    await mocks.handlers.get(EVIDENCE_IPC_CHANNELS.open)!(
      { sender: first },
      '/model/one',
    );
    await mocks.handlers.get(EVIDENCE_IPC_CHANNELS.open)!(
      { sender: second },
      '/model/two',
    );
    mocks.changes[0]!(['entities/payment.json']);
    expect(first.send).toHaveBeenCalledWith(STORY_IPC_CHANNELS.INVALIDATED, {
      rootPath: '/model/one',
    });
    expect(second.send).not.toHaveBeenCalled();
    first.isDestroyed.mockReturnValue(true);
    first.send.mockClear();
    mocks.changes[0]!(['entities/payment.json']);
    expect(first.send).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalled();
  });
});
