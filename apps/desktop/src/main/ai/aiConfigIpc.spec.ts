import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EVIDENCE_AI_CONFIG_IPC_CHANNELS as AI,
  type AiConfigStatus,
} from '@evidence-poc/desktop-contracts/aiConfig';
import type { AiConfigService } from './aiConfigService';
import { registerAiConfigIpc } from './aiConfigIpc';

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  send: vi.fn(),
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (...args: unknown[]) => Promise<unknown>,
    ) => electron.handlers.set(channel, handler),
    removeHandler: (channel: string) => electron.handlers.delete(channel),
  },
  BrowserWindow: {
    getAllWindows: () => [
      { isDestroyed: () => false, webContents: { send: electron.send } },
      { isDestroyed: () => true },
    ],
  },
}));
afterEach(() => {
  electron.handlers.clear();
  vi.clearAllMocks();
});
const status: AiConfigStatus = {
  agentDir: '/test/pi',
  isConfigured: true,
  activeProviderId: 'local-gateway',
  activeModelId: 'route/flash',
  activeModelName: 'Gateway Flash',
  thinkingLevel: 'off',
  availableModels: [],
};

describe('AI configuration IPC', () => {
  it('publishes public status to live windows after resetting sessions', async () => {
    const selection = { providerId: 'local-gateway', modelId: 'route/flash' };
    const service = {
      getStatus: vi.fn(async () => status),
      selectModel: vi.fn(async () => undefined),
      testConnection: vi.fn(),
    } as unknown as AiConfigService;
    let finish: () => void = () => undefined;
    const reset = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const ipc = registerAiConfigIpc(service, reset);
    const select = electron.handlers.get(AI.selectModel)?.({}, selection);
    await vi.waitFor(() => expect(reset).toHaveBeenCalledOnce());
    expect(service.selectModel).toHaveBeenCalledWith(selection);
    expect(electron.send).not.toHaveBeenCalled();
    finish();
    await select;
    expect(electron.send).toHaveBeenCalledExactlyOnceWith(AI.changed, status);
    ipc.dispose();
    expect(electron.handlers.size).toBe(0);
  });

  it('does not forward raw SDK errors or reset sessions when selection fails', async () => {
    const service = {
      selectModel: async () => {
        throw new Error('private provider error');
      },
    } as unknown as AiConfigService;
    const reset = vi.fn();
    registerAiConfigIpc(service, reset);
    await expect(
      electron.handlers.get(AI.selectModel)?.({}, {}),
    ).rejects.toThrow('无法保存 Pi 模型选择');
    expect(reset).not.toHaveBeenCalled();
  });
});
