import { describe, expect, it, vi } from 'vitest';

import type { EvidenceMcpAppClient } from '../types.js';
import { TOOL_NAMES, createEvidenceTools, evidenceToolNames } from './toolset.js';

const createClient = (
  overrides: Partial<EvidenceMcpAppClient> = {},
): EvidenceMcpAppClient => ({
  getAppState: vi.fn(async () => ({
    isRunning: true,
    activeProject: {
      rootPath: '/repo',
      modelRoot: '/repo/.evidence/fm',
      modelId: 'product-procurement',
      modelVersion: '1.0.0',
      documentRevision: 7,
    },
    selection: { nodeId: 'evidence.request', attributeName: null },
    sensorsSummary: {
      blockCount: 0,
      warnCount: 1,
      decisionOwedCount: 2,
      isStageGateReady: false,
    },
    mcp: { connections: 1, calls: 3 },
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
  getSelectedEntity: vi.fn(async () => ({
    entity: { id: 'evidence.request' },
    context: { id: 'context.procurement' },
    incomingRelations: [],
    outgoingRelations: [],
    derivationRules: [],
    fulfillmentPair: null,
  })),
  getKeyDataAudit: vi.fn(async () => ({
    producedBy: 'native' as const,
    keyDataCount: 3,
    counts: { 'request-input': 1, 'needs-decision': 2 },
    needsDecision: [],
    derived: [],
    note: 'needsDecision 是待决清单。',
  })),
  getScreenshot: vi.fn(async () => ({
    nodeId: 'evidence.request',
    width: 320,
    height: 120,
    mimeType: 'image/png' as const,
    data: 'ZmFrZQ==',
  })),
  applyModelPatch: vi.fn(async () => ({
    success: true,
    appliedCommands: ['update-attribute'],
    revision: 8,
    undoable: true,
    diagnostics: [],
  })),
  runStageGate: vi.fn(async () => ({
    passed: true,
    exitCode: 0,
    driftDetected: false,
    blockingReasons: [],
  })),
  ...overrides,
});

const toolOf = (name: string) => {
  const client = createClient();
  const tool = createEvidenceTools(client).find(
    (candidate) => candidate.name === name,
  );

  if (tool === undefined) {
    throw new Error(`missing tool ${name}`);
  }

  return { client, tool };
};

describe('createEvidenceTools', () => {
  it('registers exactly the seven phase 4 tools', () => {
    expect(evidenceToolNames).toEqual([
      TOOL_NAMES.appState,
      TOOL_NAMES.domainModel,
      TOOL_NAMES.selectedEntity,
      TOOL_NAMES.keyDataAudit,
      TOOL_NAMES.screenshot,
      TOOL_NAMES.applyPatch,
      TOOL_NAMES.stageGate,
    ]);
    expect(createEvidenceTools(createClient())).toHaveLength(7);
  });

  it('marks the patch tool as the only writer', () => {
    const tools = createEvidenceTools(createClient());
    const writers = tools.filter(
      (tool) => tool.annotations.readOnlyHint === false,
    );

    expect(writers.map((tool) => tool.name)).toEqual([TOOL_NAMES.applyPatch]);
  });

  it('forwards the domain model filter', async () => {
    const { client, tool } = toolOf(TOOL_NAMES.domainModel);

    await tool.run({ contextRef: 'context.procurement', includeRules: false });

    expect(client.getDomainModel).toHaveBeenCalledWith({
      contextRef: 'context.procurement',
      includeRules: false,
    });
  });

  it('returns the screenshot as text metadata plus a PNG image', async () => {
    const { tool } = toolOf(TOOL_NAMES.screenshot);
    const result = await tool.run({});

    expect(result.image).toEqual({ data: 'ZmFrZQ==', mimeType: 'image/png' });
    expect(JSON.parse(result.text)).toMatchObject({
      width: 320,
      height: 120,
    });
  });

  it('reports a rejected patch as an error result', async () => {
    const client = createClient({
      applyModelPatch: vi.fn(async () => ({
        success: false,
        appliedCommands: [],
        revision: 7,
        undoable: false,
        diagnostics: [
          {
            severity: 'block' as const,
            code: 'attribute.duplicate',
            message: 'duplicate',
          },
        ],
        error: '静态检查拒绝',
      })),
    });
    const tool = createEvidenceTools(client).find(
      (candidate) => candidate.name === TOOL_NAMES.applyPatch,
    )!;
    const result = await tool.run({
      rationale: '补充关键数据来源',
      commands: [{ type: 'update-attribute' }],
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('静态检查拒绝');
  });

  it('passes the stage gate target through', async () => {
    const { client, tool } = toolOf(TOOL_NAMES.stageGate);

    await tool.run({ target: 'visualization' });

    expect(client.runStageGate).toHaveBeenCalledWith({
      target: 'visualization',
    });
  });
});
