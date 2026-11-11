import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEvidenceMcpBridgeClient } from './client.js';
import { getEvidenceMcpBridgeEndpoint, isNamedPipe } from './endpoint.js';
import { createEvidenceMcpBridgeServer } from './server.js';
import type { EvidenceMcpAppClient, McpAppState } from '../types.js';

const openEndpoints: string[] = [];

const endpointFor = (name: string): string => {
  const endpoint = join(tmpdir(), `evidence-mcp-test-${process.pid}-${name}.sock`);

  openEndpoints.push(endpoint);

  return endpoint;
};

const appState = (revision: number): McpAppState => ({
  isRunning: true,
  activeProject: {
    rootPath: '/repo',
    modelRoot: '/repo/.evidence/fm',
    modelId: 'product-procurement',
    modelVersion: '1.0.0',
    documentRevision: revision,
  },
  selection: { nodeId: 'evidence.request', attributeName: null },
  sensorsSummary: {
    blockCount: 0,
    warnCount: 0,
    decisionOwedCount: 0,
    isStageGateReady: true,
  },
  mcp: { connections: 1, calls: 1 },
});

afterEach(async () => {
  openEndpoints.length = 0;
});

describe('getEvidenceMcpBridgeEndpoint', () => {
  it('derives a per-user socket path and pipes on Windows', () => {
    const mac = getEvidenceMcpBridgeEndpoint({
      platform: 'darwin',
      userDataPath: '/Users/a/Library/Application Support/Evidence',
    });
    const win = getEvidenceMcpBridgeEndpoint({
      platform: 'win32',
      userDataPath: 'C:\\Users\\a\\AppData\\Evidence',
    });

    expect(mac.endsWith('.sock')).toBe(true);
    expect(mac).not.toContain(' ');
    expect(isNamedPipe(mac)).toBe(false);
    expect(win.startsWith('\\\\.\\pipe\\')).toBe(true);
    expect(isNamedPipe(win)).toBe(true);
  });

  it('gives two user data directories different endpoints', () => {
    const first = getEvidenceMcpBridgeEndpoint({
      platform: 'darwin',
      userDataPath: '/Users/a/Evidence',
    });
    const second = getEvidenceMcpBridgeEndpoint({
      platform: 'darwin',
      userDataPath: '/Users/b/Evidence',
    });

    expect(first).not.toBe(second);
  });
});

describe('evidence mcp bridge', () => {
  it('round-trips a request over the local socket', async () => {
    const endpoint = endpointFor('roundtrip');
    const server = await createEvidenceMcpBridgeServer({
      endpoint,
      handleRequest: async (request) => {
        expect(request).toEqual({ method: 'get_app_state' });

        return appState(11);
      },
    });

    try {
      const client = createEvidenceMcpBridgeClient({ endpoint });
      const state = await client.getAppState();

      expect(state.activeProject?.documentRevision).toBe(11);
    } finally {
      await server.close();
    }
  });

  it('restricts the Unix socket to the current user', async () => {
    const endpoint = endpointFor('mode');
    const server = await createEvidenceMcpBridgeServer({
      endpoint,
      handleRequest: async () => appState(1),
    });

    try {
      const stats = await stat(endpoint);

      expect(stats.mode & 0o777).toBe(0o600);
    } finally {
      await server.close();
    }
  });

  it('answers get_app_state with isRunning false when nothing listens', async () => {
    const client = createEvidenceMcpBridgeClient({
      endpoint: endpointFor('offline'),
      timeoutMs: 200,
    });

    await expect(client.getAppState()).resolves.toMatchObject({
      isRunning: false,
      activeProject: null,
    });
    await expect(client.getDomainModel({})).rejects.toMatchObject({
      code: 'APP_NOT_RUNNING',
    });
  });

  it('propagates a handler error code to the caller', async () => {
    const endpoint = endpointFor('error');
    const server = await createEvidenceMcpBridgeServer({
      endpoint,
      handleRequest: async () => {
        throw Object.assign(new Error('no selection'), {
          name: 'EvidenceMcpError',
          code: 'NO_SELECTION',
        });
      },
    });

    try {
      const client = createEvidenceMcpBridgeClient({ endpoint });

      await expect(client.getSelectedEntity()).rejects.toThrowError(
        /no selection/,
      );
    } finally {
      await server.close();
    }
  });

  it('keeps the endpoint reusable after a close', async () => {
    const endpoint = endpointFor('reuse');
    const first = await createEvidenceMcpBridgeServer({
      endpoint,
      handleRequest: async () => appState(1),
    });

    await first.close();

    const second = await createEvidenceMcpBridgeServer({
      endpoint,
      handleRequest: async () => appState(2),
    });

    try {
      const client = createEvidenceMcpBridgeClient({ endpoint });

      expect((await client.getAppState()).activeProject?.documentRevision).toBe(
        2,
      );
    } finally {
      await second.close();
    }
  });
});

describe('createEvidenceMcpBridgeClient', () => {
  it('forwards every method to the matching request', async () => {
    const endpoint = endpointFor('methods');
    const seen: string[] = [];
    const server = await createEvidenceMcpBridgeServer({
      endpoint,
      handleRequest: async (request) => {
        seen.push(request.method);

        return appState(1);
      },
    });

    try {
      const client: EvidenceMcpAppClient = createEvidenceMcpBridgeClient({
        endpoint,
      });

      await client.getDomainModel({ contextRef: 'context.procurement' });
      await client.getSelectedEntity();
      await client.getKeyDataAudit();
      await client.getScreenshot({ targetNodeId: 'evidence.request' });
      await client.applyModelPatch({
        rationale: '测试',
        commands: [{ type: 'update-attribute' }],
      });
      await client.runStageGate({ target: 'api' });

      expect(seen).toEqual([
        'get_domain_model',
        'get_selected_entity',
        'get_key_data_audit',
        'get_canvas_screenshot',
        'apply_model_patch',
        'run_stage_gate',
      ]);
    } finally {
      await server.close();
    }
  });

  it('times out when the app stops answering', async () => {
    vi.useFakeTimers();
    const endpoint = endpointFor('timeout');
    const server = await createEvidenceMcpBridgeServer({
      endpoint,
      handleRequest: () => new Promise(() => undefined),
    });

    try {
      const client = createEvidenceMcpBridgeClient({
        endpoint,
        timeoutMs: 50,
      });
      const assertion = expect(client.getKeyDataAudit()).rejects.toMatchObject({
        code: 'RENDERER_UNAVAILABLE',
      });

      await vi.advanceTimersByTimeAsync(60);
      await assertion;
    } finally {
      await server.close();
      vi.useRealTimers();
    }
  });
});
