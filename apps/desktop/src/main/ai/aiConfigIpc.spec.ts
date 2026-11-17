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
  isConfigured: true,
  activeProviderId: 'deepseek',
  activeModelId: 'deepseek-chat',
  thinkingLevel: 'off',
  availableModels: [],
  hasLocalPiCliConfig: false,
};
describe('AI configuration IPC', () => {
  it('publishes public status to all live windows after session reset and cleans up handlers', async () => {
    let changed: () => void = () => undefined;
    const unsubscribe = vi.fn();
    const service = {
      getStatus: vi.fn(async () => status),
      save: vi.fn(),
      testConnection: vi.fn(),
      importFromLocalPiCli: vi.fn(),
      onChanged: (listener: () => void) => {
        changed = listener;
        return unsubscribe;
      },
    } as unknown as AiConfigService;
    let finish: () => void = () => undefined;
    const reset = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const ipc = registerAiConfigIpc(service, reset);
    changed();
    expect(reset).toHaveBeenCalledOnce();
    expect(electron.send).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() =>
      expect(electron.send).toHaveBeenCalledWith(AI.changed, status),
    );
    ipc.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(electron.handlers.size).toBe(0);
  });
  it('never forwards raw credential or SDK errors in mutation responses', async () => {
    const fail = async () => {
      throw new Error('secret-key-in-provider-error');
    };
    const service = {
      getStatus: vi.fn(),
      save: fail,
      testConnection: vi.fn(),
      importFromLocalPiCli: fail,
      onChanged: () => () => undefined,
    } as unknown as AiConfigService;
    registerAiConfigIpc(service, async () => undefined);
    await expect(electron.handlers.get(AI.save)?.({}, {})).rejects.toThrow(
      '无法保存 AI 配置',
    );
    await expect(electron.handlers.get(AI.importCli)?.({})).rejects.toThrow(
      '无法导入 Pi CLI 配置',
    );
  });
});
