import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createEvidenceMcpBridgeClient } from '@evidence-poc/evidence-mcp';
import { describe, expect, it, vi } from 'vitest';

import type { McpStatus } from '../shared/mcpIpc';
import { startMcpBridgeRuntime } from './mcpBridgeRuntime';
import { createMcpRequestHandler } from './mcpRequestHandler';

const endpointFor = (name: string): string =>
  join(tmpdir(), `evidence-mcp-runtime-${process.pid}-${name}.sock`);

const deliveryService = () => ({
  topology: async () => ({
    modelId: 'product-procurement',
    modelName: '商品采购',
    modelVersion: '1.1.0',
    services: [],
    links: [],
    limitations: [],
  }),
  openapi: async () => ({
    modelId: 'product-procurement',
    modelVersion: '1.1.0',
    pathCount: 0,
    document: {},
    limitations: [],
  }),
});

const simulationService = () => ({
  replay: async () => ({
    modelId: 'product-procurement',
    passed: true,
    scenarios: [],
    frames: [],
    errors: [],
  }),
  auditDrift: async () => ({
    modelId: 'product-procurement',
    spanCount: 0,
    commitCount: 0,
    counts: {},
    findings: [],
    passed: true,
    errors: [],
  }),
});

const appState = {
  isRunning: true,
  activeProject: {
    rootPath: '/models/procurement',
    modelRoot: '/models/procurement/.evidence/fm',
    modelId: 'product-procurement',
    modelVersion: '1.1.0',
    documentRevision: 2,
  },
  selection: null,
  sensorsSummary: null,
  mcp: { connections: 0, calls: 0 },
};

/**
 * Stands in for the renderer: `webContents.send` records the request and the
 * test answers it through `runtime.respond`.
 */
const fakeContents = () => {
  const sent: { channel: string; payload: unknown }[] = [];
  const contents = {
    isDestroyed: () => false,
    send: (channel: string, payload: unknown) => {
      sent.push({ channel, payload });
    },
    capturePage: vi.fn(async () => ({
      toPNG: () => Buffer.from('png'),
      getSize: () => ({ width: 320, height: 120 }),
    })),
  };

  return { contents, sent };
};

describe('startMcpBridgeRuntime', () => {
  it('round-trips a renderer-bound call over the socket', async () => {
    const endpoint = endpointFor('roundtrip');
    const { contents, sent } = fakeContents();
    const statuses: McpStatus[] = [];
    const runtime = await startMcpBridgeRuntime({
      endpoint,
      getActiveContents: () => contents as never,
      createHandler: ({ renderer, capture, onCall }) =>
        createMcpRequestHandler({
          renderer,
          capture,
          delivery: deliveryService(),
          simulation: simulationService(),
        sensors: {
            readKeyDataAudit: async () => ({
              producedBy: 'unavailable',
              keyDataCount: 0,
              counts: {},
              needsDecision: [],
              derived: [],
              note: '',
            }),
            checkStageGate: async () => ({
              passed: true,
              exitCode: 0,
              driftDetected: false,
              blockingReasons: [],
            }),
          },
          onCall,
        }),
      publishStatus: (status) => statuses.push(status),
    });

    try {
      const client = createEvidenceMcpBridgeClient({ endpoint });
      const pending = client.getAppState();

      await vi.waitFor(() => {
        expect(sent).toHaveLength(1);
      });

      const [{ payload }] = sent;
      const request = payload as { requestId: string };

      runtime.respond({
        requestId: request.requestId,
        success: true,
        result: appState,
      });

      await expect(pending).resolves.toMatchObject({
        activeProject: { modelId: 'product-procurement' },
      });
      expect(runtime.status()).toMatchObject({ listening: true, calls: 1 });
      expect(statuses.at(-1)?.calls).toBe(1);
    } finally {
      await runtime.dispose();
    }
  });

  it('surfaces a renderer error as a rejection', async () => {
    const endpoint = endpointFor('error');
    const { contents, sent } = fakeContents();
    const runtime = await startMcpBridgeRuntime({
      endpoint,
      getActiveContents: () => contents as never,
      createHandler: ({ renderer, capture, onCall }) =>
        createMcpRequestHandler({
          renderer,
          capture,
          delivery: deliveryService(),
          simulation: simulationService(),
        sensors: {
            readKeyDataAudit: async () => ({
              producedBy: 'unavailable',
              keyDataCount: 0,
              counts: {},
              needsDecision: [],
              derived: [],
              note: '',
            }),
            checkStageGate: async () => ({
              passed: true,
              exitCode: 0,
              driftDetected: false,
              blockingReasons: [],
            }),
          },
          onCall,
        }),
      publishStatus: () => undefined,
    });

    try {
      const client = createEvidenceMcpBridgeClient({ endpoint });
      const pending = client.getSelectedEntity();

      await vi.waitFor(() => {
        expect(sent).toHaveLength(1);
      });

      const { requestId } = sent[0]!.payload as { requestId: string };

      runtime.respond({
        requestId,
        success: false,
        error: { code: 'NO_SELECTION', message: '画布上没有选中的业务对象。' },
      });

      await expect(pending).rejects.toThrowError(/没有选中的业务对象/);
      expect(runtime.status().error).toContain('没有选中的业务对象');
    } finally {
      await runtime.dispose();
    }
  });

  it('captures the canvas and restores chrome afterwards', async () => {
    const endpoint = endpointFor('capture');
    const { contents, sent } = fakeContents();
    const runtime = await startMcpBridgeRuntime({
      endpoint,
      getActiveContents: () => contents as never,
      createHandler: ({ renderer, capture, onCall }) =>
        createMcpRequestHandler({
          renderer,
          capture,
          delivery: deliveryService(),
          simulation: simulationService(),
        sensors: {
            readKeyDataAudit: async () => ({
              producedBy: 'unavailable',
              keyDataCount: 0,
              counts: {},
              needsDecision: [],
              derived: [],
              note: '',
            }),
            checkStageGate: async () => ({
              passed: true,
              exitCode: 0,
              driftDetected: false,
              blockingReasons: [],
            }),
          },
          onCall,
        }),
      publishStatus: () => undefined,
    });

    try {
      const client = createEvidenceMcpBridgeClient({ endpoint });
      const pending = client.getScreenshot({ targetNodeId: 'evidence.request' });

      await vi.waitFor(() => {
        expect(sent).toHaveLength(1);
      });

      runtime.respond({
        requestId: (sent[0]!.payload as { requestId: string }).requestId,
        success: true,
        result: { x: 24, y: 24, width: 320, height: 120 },
      });

      await expect(pending).resolves.toMatchObject({
        nodeId: 'evidence.request',
        width: 320,
        height: 120,
      });
      expect(contents.capturePage).toHaveBeenCalledWith({
        x: 24,
        y: 24,
        width: 320,
        height: 120,
      });
      expect(sent.filter((entry) => entry.channel.endsWith('capture-mode'))).toEqual([
        { channel: 'evidence:mcp:capture-mode', payload: true },
        { channel: 'evidence:mcp:capture-mode', payload: false },
      ]);
    } finally {
      await runtime.dispose();
    }
  });

  it('refuses model calls when no editor window is open', async () => {
    const endpoint = endpointFor('nowindow');
    const runtime = await startMcpBridgeRuntime({
      endpoint,
      getActiveContents: () => null,
      createHandler: ({ renderer, capture, onCall }) =>
        createMcpRequestHandler({
          renderer,
          capture,
          delivery: deliveryService(),
          simulation: simulationService(),
        sensors: {
            readKeyDataAudit: async () => ({
              producedBy: 'unavailable',
              keyDataCount: 0,
              counts: {},
              needsDecision: [],
              derived: [],
              note: '',
            }),
            checkStageGate: async () => ({
              passed: true,
              exitCode: 0,
              driftDetected: false,
              blockingReasons: [],
            }),
          },
          onCall,
        }),
      publishStatus: () => undefined,
    });

    try {
      const client = createEvidenceMcpBridgeClient({ endpoint });

      await expect(client.getDomainModel({})).rejects.toThrowError(
        /没有打开的模型窗口/,
      );
    } finally {
      await runtime.dispose();
    }
  });
});
