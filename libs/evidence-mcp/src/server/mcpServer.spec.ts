import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EvidenceMcpAppClient } from '../types.js';
import { createEvidenceMcpServer } from './mcpServer.js';
import { TOOL_NAMES } from './toolset.js';

const client = (): EvidenceMcpAppClient => ({
  getAppState: vi.fn(async () => ({
    isRunning: true,
    activeProject: {
      rootPath: '/repo',
      modelRoot: '/repo/.evidence/fm',
      modelId: 'product-procurement',
      modelVersion: '1.0.0',
      documentRevision: 3,
    },
    selection: null,
    sensorsSummary: null,
    mcp: { connections: 1, calls: 0 },
  })),
  getDomainModel: vi.fn(async () => ({
    document: {
      manifest: {
        type: 'fm_model' as const,
        schemaVersion: '5.0' as const,
        id: 'product-procurement',
        name: '商品采购（Product Procurement）',
        version: '1.0.0',
        ruleLanguage: 'CEL' as const,
        entryContextRefs: ['context.procurement'],
      },
      entities: [],
      relationships: [],
      rules: [],
    },
    summary: { contracts: 1, fulfillments: 1, entities: 0, rules: 0 },
  })),
  getSelectedEntity: vi.fn(async () => {
    throw new Error('selection is empty');
  }),
  getKeyDataAudit: vi.fn(async () => ({
    producedBy: 'native' as const,
    keyDataCount: 0,
    counts: {},
    needsDecision: [],
    derived: [],
    note: 'needsDecision 是待决清单。',
  })),
  getScreenshot: vi.fn(async () => ({
    nodeId: null,
    width: 10,
    height: 10,
    mimeType: 'image/png' as const,
    data: 'ZmFrZQ==',
  })),
  applyModelPatch: vi.fn(async () => ({
    success: true,
    appliedCommands: ['update-attribute'],
    revision: 4,
    undoable: true,
    diagnostics: [],
  })),
  runStageGate: vi.fn(async () => ({
    passed: false,
    exitCode: 1,
    driftDetected: false,
    blockingReasons: ['key data decision owed'],
  })),
  getDeliveryTopology: vi.fn(async () => ({
    modelId: 'product-procurement',
    modelName: '商品采购',
    modelVersion: '1.0.0',
    services: [],
    links: [],
    limitations: [],
  })),
  runScenarioReplay: vi.fn(async () => ({
    modelId: 'product-procurement',
    passed: true,
    scenarios: [],
    frames: [],
    errors: [],
  })),
  auditProductionDrift: vi.fn(async () => ({
    modelId: 'product-procurement',
    spanCount: 0,
    commitCount: 0,
    counts: {},
    findings: [],
    passed: true,
    errors: [],
  })),
  exportOpenApiContract: vi.fn(async () => ({
    modelId: 'product-procurement',
    modelVersion: '1.0.0',
    pathCount: 0,
    document: {},
    limitations: [],
  })),
});

let connected: Client | null = null;

afterEach(async () => {
  await connected?.close();
  connected = null;
});

describe('createEvidenceMcpServer', () => {
  it('lists the tools with their read-only annotations', async () => {
    const server = createEvidenceMcpServer({ appClient: client() });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const mcp = new Client({ name: 'test', version: '0.0.1' });
    connected = mcp;
    await mcp.connect(clientTransport);

    const { tools } = await mcp.listTools();

    expect(tools.map((tool) => tool.name)).toContain(TOOL_NAMES.appState);
    expect(tools).toHaveLength(14);
    expect(
      tools.find((tool) => tool.name === TOOL_NAMES.applyPatch)?.annotations,
    ).toMatchObject({ readOnlyHint: false });
  });

  it('returns a tool error when the desktop call fails', async () => {
    const server = createEvidenceMcpServer({ appClient: client() });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const mcp = new Client({ name: 'test', version: '0.0.1' });
    connected = mcp;
    await mcp.connect(clientTransport);

    const result = await mcp.callTool({
      name: TOOL_NAMES.selectedEntity,
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('selection is empty');
  });

  it('answers a read-only call with the projected payload', async () => {
    const server = createEvidenceMcpServer({ appClient: client() });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const mcp = new Client({ name: 'test', version: '0.0.1' });
    connected = mcp;
    await mcp.connect(clientTransport);

    const result = await mcp.callTool({
      name: TOOL_NAMES.domainModel,
      arguments: { contextRef: 'context.procurement' },
    });
    const [content] = result.content as { type: string; text: string }[];

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(content!.text)).toMatchObject({
      summary: { contracts: 1 },
    });
  });
});
