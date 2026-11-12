import { describe, expect, it } from 'vitest';

import type {
  EvidenceMcpAppRequest,
  McpAppState,
  McpStageGateResult,
} from '@evidence-poc/evidence-mcp';

import { createMcpRequestHandler, type McpSensorService } from './mcpRequestHandler';

const appState = (): McpAppState => ({
  isRunning: true,
  activeProject: {
    rootPath: '/models/procurement',
    modelRoot: '/models/procurement/.evidence/fm',
    modelId: 'product-procurement',
    modelVersion: '1.1.0',
    documentRevision: 4,
  },
  selection: { nodeId: 'evidence.request', attributeName: null },
  sensorsSummary: null,
  mcp: { connections: 1, calls: 2 },
});

const sensors = (): McpSensorService & {
  keyDataCalls: string[];
  gateCalls: { rootPath: string; target: string }[];
} => {
  const keyDataCalls: string[] = [];
  const gateCalls: { rootPath: string; target: string }[] = [];

  return {
    keyDataCalls,
    gateCalls,
    readKeyDataAudit: async (rootPath) => {
      keyDataCalls.push(rootPath);

      return {
        producedBy: 'native',
        keyDataCount: 3,
        counts: { 'needs-decision': 1 },
        needsDecision: [],
        derived: [],
        note: '待决清单',
      };
    },
    checkStageGate: async (input): Promise<McpStageGateResult> => {
      gateCalls.push({ rootPath: input.rootPath, target: input.target });

      return {
        passed: false,
        exitCode: 1,
        driftDetected: false,
        blockingReasons: ['key data decision owed'],
      };
    },
  };
};

describe('createMcpRequestHandler', () => {
  it('forwards renderer-bound calls verbatim', async () => {
    const seen: { method: string; payload: unknown }[] = [];
    const handler = createMcpRequestHandler({
      renderer: async (method, payload) => {
        seen.push({ method, payload });

        return appState();
      },
      sensors: sensors(),
      capture: async () => ({ data: 'ZmFrZQ==', width: 1, height: 1 }),
    });

    await handler({ method: 'get_app_state' });
    await handler({
      method: 'apply_model_patch',
      patch: { rationale: '补充来源', commands: [{ type: 'update-attribute' }] },
    });

    expect(seen.map((entry) => entry.method)).toEqual([
      'get_app_state',
      'apply_model_patch',
    ]);
    expect(seen[1]?.payload).toMatchObject({ rationale: '补充来源' });
  });

  it('runs the key data audit for the active project root', async () => {
    const service = sensors();
    const handler = createMcpRequestHandler({
      renderer: async () => appState(),
      sensors: service,
      capture: async () => ({ data: '', width: 1, height: 1 }),
    });

    const result = await handler({ method: 'get_key_data_audit' });

    expect(service.keyDataCalls).toEqual(['/models/procurement']);
    expect(result).toMatchObject({ producedBy: 'native' });
  });

  it('refuses sensor work when no project is open', async () => {
    const handler = createMcpRequestHandler({
      renderer: async () => ({
        ...appState(),
        activeProject: null,
      }),
      sensors: sensors(),
      capture: async () => ({ data: '', width: 1, height: 1 }),
    });

    await expect(
      handler({ method: 'run_stage_gate', target: 'api' }),
    ).rejects.toMatchObject({ code: 'NO_ACTIVE_PROJECT' });
  });

  it('captures the rect the renderer measured', async () => {
    const captured: { x: number; y: number; width: number; height: number }[] =
      [];
    const handler = createMcpRequestHandler({
      renderer: async (method) =>
        method === 'get_capture_rect'
          ? { x: 24, y: 24, width: 320, height: 120 }
          : appState(),
      sensors: sensors(),
      capture: async (rect) => {
        captured.push(rect);

        return { data: 'ZmFrZQ==', width: 320, height: 120 };
      },
    });

    const result = await handler({
      method: 'get_canvas_screenshot',
      targetNodeId: 'evidence.request',
    });

    expect(captured).toEqual([{ x: 24, y: 24, width: 320, height: 120 }]);
    expect(result).toMatchObject({
      nodeId: 'evidence.request',
      mimeType: 'image/png',
      data: 'ZmFrZQ==',
    });
  });

  it('reports an empty canvas instead of an empty image', async () => {
    const handler = createMcpRequestHandler({
      renderer: async () => null,
      sensors: sensors(),
      capture: async () => ({ data: '', width: 0, height: 0 }),
    });

    await expect(
      handler({ method: 'get_canvas_screenshot' }),
    ).rejects.toMatchObject({ code: 'SCREENSHOT_FAILED' });
  });

  it('counts served calls', async () => {
    const calls: EvidenceMcpAppRequest['method'][] = [];
    const handler = createMcpRequestHandler({
      renderer: async () => appState(),
      sensors: sensors(),
      capture: async () => ({ data: '', width: 1, height: 1 }),
      onCall: (method) => calls.push(method),
    });

    await handler({ method: 'get_domain_model', includeRules: false });

    expect(calls).toEqual(['get_domain_model']);
  });
});
