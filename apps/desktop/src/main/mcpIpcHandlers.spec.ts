import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { McpRendererResponse, McpStatus } from '../shared/mcpIpc';

import type { McpBridgeRuntime } from './mcpBridgeRuntime';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const listeners = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, listener: (...args: unknown[]) => unknown) => {
      listeners.set(channel, listener);
    },
    removeListener: (channel: string) => {
      listeners.delete(channel);
    },
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    },
    removeHandler: (channel: string) => {
      handlers.delete(channel);
    },
  },
}));

const { registerMcpIpc } = await import('./mcpIpcHandlers');

const runtimeOf = (status: McpStatus): McpBridgeRuntime & {
  respond: (response: McpRendererResponse) => void;
} => ({
  status: () => status,
  respond: vi.fn<(response: McpRendererResponse) => void>(),
  dispose: async () => undefined,
});

describe('registerMcpIpc', () => {
  beforeEach(() => {
    handlers.clear();
    listeners.clear();
  });

  it('answers the status pull the header makes on mount', async () => {
    const status: McpStatus = {
      listening: true,
      endpoint: '/tmp/evidence-mcp.sock',
      connections: 0,
      calls: 0,
      registeredClients: [],
      error: null,
    };

    registerMcpIpc({ runtime: runtimeOf(status) });

    expect(await handlers.get('evidence:mcp:status')?.()).toEqual(status);
  });

  it('forwards renderer responses to the bridge and unregisters on dispose', () => {
    const runtime = runtimeOf({
      listening: true,
      endpoint: '/tmp/evidence-mcp.sock',
      connections: 1,
      calls: 0,
      registeredClients: [],
      error: null,
    });
    const registration = registerMcpIpc({ runtime });

    listeners.get('evidence:mcp:response')?.({}, { requestId: 'one', success: true, result: 1 });

    expect(runtime.respond).toHaveBeenCalledOnce();

    registration.dispose();

    expect(listeners.size).toBe(0);
    expect(handlers.size).toBe(0);
  });
});
