import { describe, expect, it, vi } from 'vitest';

import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

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


const momentTime = (name: string) => ({
  name,
  label: name,
  meaning: `${name}由责任方登记。`,
  valueType: 'timestamp' as const,
  required: true,
  keyData: true,
});

/** Contract Context an operator can read the root contract out of. */
const procurementDocument = (): DomainModelDocument => ({
  manifest: {
    type: 'fm_model',
    schemaVersion: '5.0',
    id: 'product-procurement',
    name: '商品采购（Product Procurement）',
    version: '1.0.0',
    ruleLanguage: 'CEL',
    entryContextRefs: ['context.procurement'],
  },
  entities: [
    {
      type: 'entity',
      id: 'context.procurement',
      category: 'context',
      kind: 'contract',
      label: '商品采购',
      rootRefs: ['contract.procurement'],
    },
    {
      type: 'entity',
      id: 'contract.procurement',
      category: 'evidence',
      kind: 'contract',
      label: '采购合同',
      contextRef: 'context.procurement',
      roleRefs: ['role.buyer', 'role.seller'],
      attributes: [momentTime('signed_at')],
    },
    {
      type: 'entity',
      id: 'role.buyer',
      category: 'role',
      kind: 'party',
      label: '买方',
      contextRef: 'context.procurement',
    },
    {
      type: 'entity',
      id: 'role.seller',
      category: 'role',
      kind: 'party',
      label: '卖方',
      contextRef: 'context.procurement',
    },
  ],
  relationships: [],
  rules: [],
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
  it('registers the read, patch and operator tools', () => {
    expect(evidenceToolNames).toEqual([
      TOOL_NAMES.appState,
      TOOL_NAMES.domainModel,
      TOOL_NAMES.selectedEntity,
      TOOL_NAMES.keyDataAudit,
      TOOL_NAMES.screenshot,
      TOOL_NAMES.applyPatch,
      TOOL_NAMES.stageGate,
      TOOL_NAMES.introduceFulfillmentPair,
      TOOL_NAMES.addBreachCompensation,
      TOOL_NAMES.roleifyAndInvertDependency,
    ]);
    expect(createEvidenceTools(createClient())).toHaveLength(10);
  });

  it('marks the writers, and only the writers, as destructive', () => {
    const tools = createEvidenceTools(createClient());
    const writers = tools.filter(
      (tool) => tool.annotations.readOnlyHint === false,
    );

    expect(writers.map((tool) => tool.name)).toEqual([
      TOOL_NAMES.applyPatch,
      TOOL_NAMES.introduceFulfillmentPair,
      TOOL_NAMES.addBreachCompensation,
      TOOL_NAMES.roleifyAndInvertDependency,
    ]);
  });

  it('reads the model before an operator resolves a reference', async () => {
    const { client, tool } = toolOf(TOOL_NAMES.introduceFulfillmentPair);
    const result = await tool.run({
      contextRef: 'context.procurement',
      request: {
        id: 'request.refund',
        label: '退款申请',
        responsibleRoleRef: 'role.buyer',
      },
      confirmation: {
        id: 'confirmation.refund',
        label: '退款确认',
        responsibleRoleRef: 'role.seller',
      },
    });

    expect(client.getDomainModel).toHaveBeenCalledWith({ includeRules: true });
    // The fixture model has no such Context, so the builder refuses and nothing
    // reaches the patch channel.
    expect(result.isError).toBe(true);
    expect(result.text).toContain("未知的上下文 'context.procurement'");
    expect(client.applyModelPatch).not.toHaveBeenCalled();
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

  it('commits an operator patch through the same channel as a command batch', async () => {
    const client = createClient({
      getDomainModel: vi.fn(async () => ({
        document: procurementDocument(),
        summary: { contracts: 1, fulfillments: 0, entities: 4, rules: 0 },
      })),
    });
    const tool = createEvidenceTools(client).find(
      (candidate) => candidate.name === TOOL_NAMES.introduceFulfillmentPair,
    )!;
    const result = await tool.run({
      contextRef: 'context.procurement',
      request: {
        id: 'request.refund',
        label: '退款申请',
        responsibleRoleRef: 'role.buyer',
        window: '3 个工作日',
      },
      confirmation: {
        id: 'confirmation.refund',
        label: '退款确认',
        responsibleRoleRef: 'role.seller',
      },
    });

    expect(client.applyModelPatch).toHaveBeenCalledWith({
      rationale: '新增履约项：退款申请 / 退款确认',
      commands: [expect.objectContaining({ type: 'create-fulfillment-pair' })],
    });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.text)).toMatchObject({
      createdIds: ['request.refund', 'confirmation.refund'],
    });
  });

  it('reports an operator refusal without touching the model', async () => {
    const client = createClient({
      getDomainModel: vi.fn(async () => ({
        document: procurementDocument(),
        summary: { contracts: 1, fulfillments: 0, entities: 4, rules: 0 },
      })),
    });
    const tool = createEvidenceTools(client).find(
      (candidate) => candidate.name === TOOL_NAMES.addBreachCompensation,
    )!;
    const result = await tool.run({
      requestRef: 'request.unknown',
      confirmationRef: 'confirmation.unknown',
      condition: '根本不存在',
      request: {
        id: 'request.penalty',
        label: '违约金申请',
        responsibleRoleRef: 'role.seller',
      },
      confirmation: {
        id: 'confirmation.penalty',
        label: '违约金确认',
        responsibleRoleRef: 'role.buyer',
      },
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('不是履约请求');
    expect(client.applyModelPatch).not.toHaveBeenCalled();
  });
});
