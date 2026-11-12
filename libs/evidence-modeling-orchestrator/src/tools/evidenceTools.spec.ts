import { describe, expect, it } from 'vitest';

import type {
  ExtensionAPI,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';

import {
  TOOL_NAMES,
  createEvidenceToolsExtension,
  type CanvasContext,
  type EvidenceToolsHandlers,
  type ModelPatchRequest,
  type ModelPatchResult,
} from './evidenceTools.js';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import type { SensorReport } from '../sensors/sensorReport.js';

/** Business time an operator fills in; the model must already name it. */
const momentTime = (name: string, label: string) => ({
  name,
  label,
  meaning: `${label}由责任方登记。`,
  valueType: 'timestamp' as const,
  required: true,
  keyData: true,
});

/** Smallest Contract Context the operators need: one root, two parties, one pair. */
const createOrchestratorModel = (): DomainModelDocument => ({
  manifest: {
    type: 'fm_model',
    schemaVersion: '5.0',
    id: 'orchestrator-fixture',
    name: '采购夹具（Orchestrator Fixture）',
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
      attributes: [momentTime('signed_at', '签署时间')],
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
    {
      type: 'entity',
      id: 'request.payment',
      category: 'evidence',
      kind: 'fulfillment_request',
      label: '支付申请',
      contextRef: 'context.procurement',
      responsibleRoleRef: 'role.buyer',
      attributes: [
        momentTime('started_at', '发起时间'),
        momentTime('expired_at', '履约截止时间'),
      ],
    },
    {
      type: 'entity',
      id: 'confirmation.payment',
      category: 'evidence',
      kind: 'fulfillment_confirmation',
      label: '支付确认',
      contextRef: 'context.procurement',
      responsibleRoleRef: 'role.seller',
      attributes: [momentTime('confirmed_at', '确认时间')],
    },
  ],
  relationships: [],
  rules: [],
});

type Registered = ToolDefinition<never, unknown, unknown>;

const createFakePi = () => {
  const tools: Registered[] = [];
  const pi = {
    registerTool: (tool: Registered) => {
      tools.push(tool);
    },
  } as unknown as ExtensionAPI;

  return {
    pi,
    tools,
    tool: (name: string): Registered => {
      const found = tools.find((candidate) => candidate.name === name);

      if (found === undefined) {
        throw new Error(`tool ${name} was not registered`);
      }

      return found;
    },
  };
};

const REPORT: SensorReport = {
  timestamp: '2026-11-11T09:00:00.000Z',
  passed: false,
  blockCount: 1,
  warnCount: 0,
  infoCount: 0,
  issues: [
    {
      issueId: 'check_fm:FM_INCONSISTENT:x',
      severity: 'block',
      source: 'check_fm',
      code: 'FM_INCONSISTENT',
      message: '缺失确认端',
    },
  ],
  keyDataSummary: {
    totalItems: 3,
    resolvedCount: 3,
    decisionOwedCount: 0,
    unresolvedItems: [],
  },
  isStageGateReady: false,
  unavailableSensors: [],
};

const canvasContext: CanvasContext = {
  projectRoot: '/project',
  modelId: 'product-procurement',
  selection: { nodeId: 'request.payment', attributeName: 'expired_at' },
  selected: {
    nodeId: 'request.payment',
    label: '支付请求',
    kind: 'evidence',
    contextRef: 'ctx.purchase',
  },
};

const createHandlers = (overrides: Partial<EvidenceToolsHandlers> = {}) => {
  const patches: ModelPatchRequest[] = [];
  const scopes: (string | undefined)[] = [];
  const handlers: EvidenceToolsHandlers = {
    modelRoot: '/project/.evidence/fm',
    runSensors: async ({ scope }) => {
      scopes.push(scope);

      return REPORT;
    },
    applyModelPatch: async (patch) => {
      patches.push(patch);

      return {
        success: true,
        appliedCommands: patch.commands.map(
          (command) => (command as { type: string }).type,
        ),
      } satisfies ModelPatchResult;
    },
    getCanvasContext: async () => canvasContext,
    loadDocument: async () => createOrchestratorModel(),
    ...overrides,
  };

  return { handlers, patches, scopes };
};

const invoke = async <TParams>(
  tool: Registered,
  params: TParams,
): Promise<{
  content: { type: string; text: string }[];
  details: unknown;
  isError?: boolean;
}> =>
  (await tool.execute(
    'call-1',
    params as never,
    undefined,
    undefined,
    {} as never,
  )) as never;

describe('createEvidenceToolsExtension', () => {
  it('registers the three read/write tools and the three operators', () => {
    const fake = createFakePi();
    const { handlers } = createHandlers();

    createEvidenceToolsExtension(handlers)(fake.pi);

    expect(fake.tools.map(({ name }) => name)).toEqual([
      TOOL_NAMES.runSensors,
      TOOL_NAMES.applyModelPatch,
      TOOL_NAMES.getCanvasSelection,
      TOOL_NAMES.introduceFulfillmentPair,
      TOOL_NAMES.addBreachCompensation,
      TOOL_NAMES.roleifyAndInvertDependency,
    ]);
  });

  it('runs the sensors over the project model root', async () => {
    const fake = createFakePi();
    const { handlers, scopes } = createHandlers();
    createEvidenceToolsExtension(handlers)(fake.pi);

    const result = await invoke(fake.tool(TOOL_NAMES.runSensors), {
      scope: 'ctx.purchase',
    });

    expect(scopes).toEqual(['ctx.purchase']);
    expect(result.details).toBe(REPORT);
    expect(JSON.parse(result.content[0]?.text ?? '{}')).toEqual({
      passed: false,
      isStageGateReady: false,
      blockCount: 1,
      warnCount: 0,
      decisionOwed: 0,
      issues: REPORT.issues,
    });
  });

  it('applies a patch and names the command types back to the model', async () => {
    const fake = createFakePi();
    const { handlers, patches } = createHandlers();
    createEvidenceToolsExtension(handlers)(fake.pi);

    const result = await invoke(fake.tool(TOOL_NAMES.applyModelPatch), {
      rationale: '补齐退货确认端',
      commands: [
        { type: 'create-entity', entity: { id: 'evidence.return' } },
        { type: 'create-relationship', id: 'relation.return' },
      ],
    });

    expect(patches).toEqual([
      {
        rationale: '补齐退货确认端',
        commands: [
          { type: 'create-entity', entity: { id: 'evidence.return' } },
          { type: 'create-relationship', id: 'relation.return' },
        ],
      },
    ]);
    expect(result.content[0]?.text).toBe(
      '补丁已应用（create-entity, create-relationship）：补齐退货确认端',
    );
    expect(result.isError).toBeUndefined();
  });

  it('marks a rejected patch as an error result instead of throwing', async () => {
    const fake = createFakePi();
    const { handlers } = createHandlers({
      applyModelPatch: async () => ({
        success: false,
        error: 'key data keeps no provider',
      }),
    });
    createEvidenceToolsExtension(handlers)(fake.pi);

    const result = await invoke(fake.tool(TOOL_NAMES.applyModelPatch), {
      rationale: '尝试',
      commands: [{ type: 'create-entity' }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(
      '补丁被拒绝：key data keeps no provider',
    );
  });

  it('rejects a command without a type before touching the session', async () => {
    const fake = createFakePi();
    const { handlers, patches } = createHandlers();
    createEvidenceToolsExtension(handlers)(fake.pi);

    await expect(
      invoke(fake.tool(TOOL_NAMES.applyModelPatch), {
        rationale: '坏补丁',
        commands: [{ entity: {} }],
      }),
    ).rejects.toThrow('commands[0] 缺少字符串 type 字段。');
    expect(patches).toEqual([]);
  });

  it('reports the current canvas selection', async () => {
    const fake = createFakePi();
    const { handlers } = createHandlers();
    createEvidenceToolsExtension(handlers)(fake.pi);

    const result = await invoke(fake.tool(TOOL_NAMES.getCanvasSelection), {});

    expect(result.details).toEqual(canvasContext);
    expect(JSON.parse(result.content[0]?.text ?? '{}')).toEqual(canvasContext);
  });

  it('turns one pair intent into a single patch the session can validate', async () => {
    const fake = createFakePi();
    const { handlers, patches } = createHandlers();
    createEvidenceToolsExtension(handlers)(fake.pi);

    const result = await invoke(fake.tool(TOOL_NAMES.introduceFulfillmentPair), {
      contextRef: 'context.procurement',
      request: {
        id: 'request.refund',
        label: '退款申请',
        responsibleRoleRef: 'role.buyer',
        window: '3 个工作日',
      },
      confirmation: {
        id: 'confirmation.refund',
        label: '退款到账确认',
        responsibleRoleRef: 'role.seller',
      },
    });

    expect(patches).toEqual([
      {
        rationale: '新增履约项：退款申请 / 退款到账确认',
        commands: [
          expect.objectContaining({ type: 'create-fulfillment-pair' }),
        ],
      },
    ]);
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toBe(
      '已写入：request.refund, confirmation.refund。',
    );
  });

  it('reads the model before an operator resolves a reference', async () => {
    const fake = createFakePi();
    const reads: unknown[] = [];
    const { handlers } = createHandlers({
      loadDocument: async () => {
        reads.push('read');

        return createOrchestratorModel();
      },
    });
    createEvidenceToolsExtension(handlers)(fake.pi);

    await invoke(fake.tool(TOOL_NAMES.addBreachCompensation), {
      requestRef: 'request.payment',
      confirmationRef: 'confirmation.payment',
      condition: '超过约定窗口仍未到账',
      request: {
        id: 'request.penalty',
        label: '逾期违约金申请',
        responsibleRoleRef: 'role.seller',
      },
      confirmation: {
        id: 'confirmation.penalty',
        label: '违约金到账确认',
        responsibleRoleRef: 'role.buyer',
      },
    });

    expect(reads).toEqual(['read']);
  });

  it('answers a refused operator with a readable error instead of a command batch', async () => {
    const fake = createFakePi();
    const { handlers, patches } = createHandlers();
    createEvidenceToolsExtension(handlers)(fake.pi);

    const result = await invoke(fake.tool(TOOL_NAMES.roleifyAndInvertDependency), {
      targetConfirmationRef: 'request.payment',
      socket: { id: 'role.payment-capability', label: '付款能力' },
      supporting: {
        context: { id: 'context.wallet', label: '钱包支付服务' },
        contract: { id: 'contract.wallet', label: '钱包支付服务协议' },
        provider: { id: 'role.wallet-provider', label: '钱包服务商' },
        consumer: { id: 'role.wallet-user', label: '付款用户' },
        request: { id: 'request.wallet-charge', label: '钱包扣款请求' },
        confirmation: {
          id: 'confirmation.wallet-charge',
          label: '钱包扣款确认',
        },
      },
    });

    expect(patches).toEqual([]);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('不是履约确认');
  });

  it('reports a rejected operator patch as an error, not as a silent success', async () => {
    const fake = createFakePi();
    const { handlers } = createHandlers({
      applyModelPatch: async () => ({
        success: false,
        error: 'role.notBound',
      }),
    });
    createEvidenceToolsExtension(handlers)(fake.pi);

    const result = await invoke(fake.tool(TOOL_NAMES.introduceFulfillmentPair), {
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

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe('补丁被拒绝：role.notBound');
  });
});
