import { createModelTools } from '@evidence-poc/evidence-tools';
import { describe, expect, it, vi } from 'vitest';

import {
  SplitEvidenceToPairInputSchema,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';

import type { EvidenceMcpAppClient } from '../types.js';
import {
  TOOL_NAMES,
  createEvidenceTools,
  evidenceToolNames,
} from './toolset.js';

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
        schemaVersion: '6.0' as const,
        id: 'product-procurement',
        name: '商品采购（Product Procurement）',
        version: '1.0.0',
        ruleLanguage: 'CEL' as const,
        entryContextRefs: [],
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
    blockingReasons: [],
  })),
  getDeliveryTopology: vi.fn(async () => ({
    modelId: 'product-procurement',
    modelName: '商品采购',
    modelVersion: '1.0.0',
    services: [
      {
        id: 'service.procurement',
        name: '采购',
        kind: 'fulfillment' as const,
        contextRef: 'context.procurement',
        supplies: [],
        consumes: [],
        routeCount: 1,
        routePrefixes: ['/product-procurements'],
        routes: ['route.sign.contract.product-procurement'],
      },
    ],
    links: [],
    limitations: [],
  })),
  exportOpenApiContract: vi.fn(async () => ({
    modelId: 'product-procurement',
    modelVersion: '1.0.0',
    pathCount: 0,
    document: {},
    limitations: [],
  })),
  ...overrides,
});

describe('shared Zod input contracts', () => {
  it('uses the schema object directly and rejects malformed input before any model access', async () => {
    const client = createClient();
    const tool = createEvidenceTools(client).find(
      (tool) => tool.name === TOOL_NAMES.splitEvidenceToPair,
    );
    if (tool === undefined) throw new Error('expected pair tool');
    expect(tool.inputSchema).toBe(SplitEvidenceToPairInputSchema);
    const valid = {
      evidenceRef: 'evidence.refund',
      request: { mode: 'create', id: 'request.refund', label: 'Refund' },
    };
    for (const input of [
      { ...valid, request: { ...valid.request, id: 'Invalid Id' } },
      { ...valid, request: { mode: 'reuse' } },
      { ...valid, extra: true },
    ])
      await expect(tool.run(input)).rejects.toThrow();
    expect(client.getDomainModel).not.toHaveBeenCalled();
    expect(client.applyModelPatch).not.toHaveBeenCalled();
  });

  it('does not silently substitute a stage-gate target or an empty patch', async () => {
    const client = createClient();
    const tools = createEvidenceTools(client);
    const stageGate = tools.find((tool) => tool.name === TOOL_NAMES.stageGate);
    const applyPatch = tools.find(
      (tool) => tool.name === TOOL_NAMES.applyModelPatch,
    );
    if (!stageGate || !applyPatch)
      throw new Error('expected gate and patch tools');
    await expect(stageGate.run({ target: 'invalid' })).rejects.toThrow();
    await expect(
      applyPatch.run({ rationale: 'x', patches: [] }),
    ).rejects.toThrow();
    expect(client.runStageGate).not.toHaveBeenCalled();
    expect(client.applyModelPatch).not.toHaveBeenCalled();
  });
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
    schemaVersion: '6.0',
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
  it('adapts every shared model tool without replacing its schema or safety annotations', () => {
    const client = createClient();
    const registry = createModelTools({
      loadDocument: async () =>
        (await client.getDomainModel({ includeRules: true })).document,
      applyModelPatch: async () => {
        throw new Error('not invoked');
      },
    });
    const exposed = createEvidenceTools(client);
    for (const definition of registry) {
      const tool = exposed.find(({ name }) => name === definition.name);
      expect(tool?.inputSchema.safeParse({ unexpected: true }).success).toBe(
        false,
      );
      expect(tool?.annotations).toEqual(definition.annotations);
      expect(tool?.description).toBe(definition.description);
    }
  });

  it('registers the read, patch and operator tools', () => {
    expect(evidenceToolNames).toEqual([
      TOOL_NAMES.appState,
      TOOL_NAMES.domainModel,
      TOOL_NAMES.selectedEntity,
      TOOL_NAMES.keyDataAudit,
      TOOL_NAMES.screenshot,
      TOOL_NAMES.stageGate,
      TOOL_NAMES.applyModelPatch,
      TOOL_NAMES.batchAddEvidence,
      TOOL_NAMES.splitEvidenceToPair,
      TOOL_NAMES.bindKeyDataSource,
      TOOL_NAMES.assignFulfillmentContext,
      TOOL_NAMES.simulateWhatIfChallenge,
      TOOL_NAMES.growBreachCompensation,
      TOOL_NAMES.roleifyAndInvertDependency,
      TOOL_NAMES.isolateDomainCalculator,
      TOOL_NAMES.deliveryTopology,
      TOOL_NAMES.openApiContract,
    ]);
    expect(createEvidenceTools(createClient())).toHaveLength(17);
  });

  it('hands an outside agent the delivery boundaries and the contract', async () => {
    const topology = toolOf(TOOL_NAMES.deliveryTopology);
    const contract = toolOf(TOOL_NAMES.openApiContract);

    const topologyResult = await topology.tool.run({});
    const contractResult = await contract.tool.run({});

    expect(topology.client.getDeliveryTopology).toHaveBeenCalledTimes(1);
    expect(topology.tool.annotations.readOnlyHint).toBe(true);
    expect(topologyResult.value).toMatchObject({
      modelId: 'product-procurement',
      services: [
        {
          routePrefixes: ['/product-procurements'],
          routes: ['route.sign.contract.product-procurement'],
        },
      ],
    });
    expect(contract.client.exportOpenApiContract).toHaveBeenCalledTimes(1);
    expect(contractResult.value).toMatchObject({ pathCount: 0 });
  });

  it('marks the writers, and only the writers, as destructive', () => {
    const tools = createEvidenceTools(createClient());
    const writers = tools.filter(
      (tool) => tool.annotations.readOnlyHint === false,
    );

    expect(writers.map((tool) => tool.name)).toEqual([
      TOOL_NAMES.applyModelPatch,
      TOOL_NAMES.batchAddEvidence,
      TOOL_NAMES.splitEvidenceToPair,
      TOOL_NAMES.bindKeyDataSource,
      TOOL_NAMES.assignFulfillmentContext,
      TOOL_NAMES.growBreachCompensation,
      TOOL_NAMES.roleifyAndInvertDependency,
      TOOL_NAMES.isolateDomainCalculator,
    ]);
  });

  it('reads the model before trying to pair a missing proof', async () => {
    const { client, tool } = toolOf(TOOL_NAMES.splitEvidenceToPair);
    const result = await tool.run({
      evidenceRef: 'evidence.missing',
      request: { mode: 'create', id: 'request.refund', label: '退款申请' },
    });
    expect(client.getDomainModel).toHaveBeenCalledWith({ includeRules: true });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('evidence.missing');
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
      (candidate) => candidate.name === TOOL_NAMES.applyModelPatch,
    )!;
    const result = await tool.run({
      rationale: '补充关键数据来源',
      patches: [{ op: 'replace', path: '/entities/0/label', value: 'updated' }],
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('静态检查拒绝');
  });

  it('passes the stage gate target through', async () => {
    const { client, tool } = toolOf(TOOL_NAMES.stageGate);

    await tool.run({ target: 'api' });

    expect(client.runStageGate).toHaveBeenCalledWith({
      target: 'api',
    });
  });

  it('commits an evidence batch through the same channel as a command batch', async () => {
    const { client, tool } = toolOf(TOOL_NAMES.batchAddEvidence);
    const result = await tool.run({
      evidences: [
        { id: 'evidence.refund', stage: 'fulfillment', label: '退款确认' },
      ],
    });
    expect(client.applyModelPatch).toHaveBeenCalledWith({
      rationale: '铺设业务凭证',
      patches: expect.arrayContaining([
        expect.objectContaining({
          op: 'add',
          value: expect.objectContaining({ id: 'evidence.refund' }),
        }),
      ]),
    });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.text)).toMatchObject({
      createdIds: ['evidence.refund'],
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
      (candidate) => candidate.name === TOOL_NAMES.growBreachCompensation,
    )!;
    const result = await tool.run({
      requestRef: 'request.unknown',
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
    expect(result.text).toContain('已配对');
    expect(client.applyModelPatch).not.toHaveBeenCalled();
  });
});
