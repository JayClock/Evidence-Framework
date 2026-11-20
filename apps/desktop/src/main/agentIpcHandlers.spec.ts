import { EventEmitter } from 'node:events';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  EVIDENCE_AGENT_IPC_CHANNELS as channels,
  type LiveModelInput,
  type PatchTransaction,
} from '@evidence-poc/desktop-contracts/agentIpc';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { registerAgentIpc } from './agentIpcHandlers';
import { createAgentRuntime } from './agentRuntime';

type Handler = (event: { sender: unknown }, input: unknown) => unknown;
const ipc = vi.hoisted(() => new Map<string, Handler>());
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: Handler) => ipc.set(channel, listener),
    removeHandler: (channel: string) => ipc.delete(channel),
  },
}));

const renderer = () =>
  Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    send: vi.fn(),
  });
const invoke = (
  channel: string,
  sender: ReturnType<typeof renderer>,
  input: unknown,
) => {
  const handler = ipc.get(channel);
  if (!handler) throw new Error(`Missing test IPC handler: ${channel}`);
  return handler({ sender }, input);
};

const rootPath = '/models/procurement';
const document = createDesktopFixture();
const initial: LiveModelInput = {
  rootPath,
  document,
  baseDocument: document,
  revision: 1,
  editorId: 'editor',
};
const transaction: PatchTransaction = {
  id: 'test-commit',
  baseRevision: 1,
  revision: 2,
  rationale: 'test',
  commands: ['replace'],
  patches: [{ op: 'replace', path: '/manifest/name', value: 'new' }],
  inversePatches: [
    { op: 'replace', path: '/manifest/name', value: document.manifest.name },
  ],
};

describe('agent transaction IPC', () => {
  it('publishes once to the owning editor and returns committed writes even when the turn fails', async () => {
    const owner = renderer();
    const other = renderer();
    const binding = registerAgentIpc({
      createRuntime: (options) => ({
        ...createAgentRuntime(options),
        notifyModelChanged: vi.fn(),
        prompt: async (_text, _focus, revision, commits) => {
          expect(revision).toBe(1);
          if (!commits) throw new Error('No transaction collector');
          commits.push(transaction);
          options.transport.publishPatch(transaction);
          throw new Error('provider failed after commit');
        },
      }),
    });
    try {
      invoke(channels.modelChanged, owner, initial);
      expect(() => invoke(channels.modelChanged, other, initial)).toThrow(
        '另一个编辑窗口',
      );
      const input = {
        rootPath,
        text: 'model',
        revision: 1,
        editorId: initial.editorId,
      };
      await expect(
        invoke(channels.prompt, owner, { ...input, editorId: 'stale' }),
      ).resolves.toMatchObject({ success: false });
      await expect(
        invoke(channels.prompt, other, input),
      ).resolves.toMatchObject({ success: false });
      expect(owner.send).not.toHaveBeenCalled();
      const payload = { rootPath, editorId: initial.editorId, transaction };
      await expect(invoke(channels.prompt, owner, input)).resolves.toEqual({
        success: false,
        error: 'provider failed after commit',
        transactions: [transaction],
      });
      expect(owner.send).toHaveBeenCalledExactlyOnceWith(
        channels.patchCommitted,
        payload,
      );
      expect(other.send).not.toHaveBeenCalled();
    } finally {
      binding.dispose();
    }
    expect(ipc.size).toBe(0);
  });

  it('assigns a stable desktop transcript directory to each project', () => {
    const owner = renderer();
    const dispose = vi.fn();
    const createRuntime = vi.fn<typeof createAgentRuntime>((options) => ({
      ...createAgentRuntime(options),
      notifyModelChanged: vi.fn(),
      dispose,
    }));
    const sessionsRoot = path.resolve('desktop-sessions');
    const binding = registerAgentIpc({ createRuntime, sessionsRoot });
    try {
      invoke(channels.modelChanged, owner, initial);
      invoke(channels.modelChanged, owner, {
        ...initial,
        editorId: 'reopened',
      });
      expect(dispose).toHaveBeenCalledOnce();
      expect(createRuntime).toHaveBeenCalledTimes(2);
      expect(() =>
        invoke(channels.modelChanged, owner, { ...initial, revision: 2 }),
      ).toThrow('编辑会话已关闭');
      const first = createRuntime.mock.calls[0]?.[0].sessionDirectory;
      expect(first && path.dirname(first)).toBe(sessionsRoot);
      expect(createRuntime.mock.calls[1]?.[0].sessionDirectory).toBe(first);
      owner.emit('destroyed');
      expect(dispose).toHaveBeenCalledTimes(2);
      invoke(channels.modelChanged, renderer(), {
        ...initial,
        rootPath: '/models/another-project',
      });
      expect(createRuntime.mock.calls[2]?.[0].sessionDirectory).not.toBe(first);
    } finally {
      binding.dispose();
    }
  });
});
