import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import {
  addBreachCompensation,
  introduceFulfillmentPair,
  roleifyAndInvertDependency,
  type OperatorPatch,
} from '@evidence-poc/evidence-model-core';
import * as z from 'zod/v4';

import type { EvidenceMcpAppClient } from '../types.js';

const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const WRITES_MODEL: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};

export interface EvidenceToolResult {
  /** Human-readable payload shown to the agent. */
  text: string;
  /** Optional image attachment (base64 PNG). */
  image?: { data: string; mimeType: 'image/png' };
  isError?: boolean;
  /** Structured value kept for tests and in-process callers. */
  value: unknown;
}

export interface EvidenceTool {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  annotations: ToolAnnotations;
  run(input: Record<string, never> | Record<string, unknown>): Promise<EvidenceToolResult>;
}

export const TOOL_NAMES = {
  appState: 'get_app_state',
  domainModel: 'get_domain_model',
  selectedEntity: 'get_selected_entity',
  keyDataAudit: 'get_key_data_audit',
  screenshot: 'get_canvas_screenshot',
  applyPatch: 'apply_model_patch',
  stageGate: 'run_stage_gate',
  introduceFulfillmentPair: 'introduce_fulfillment_pair',
  addBreachCompensation: 'add_breach_compensation',
  roleifyAndInvertDependency: 'roleify_and_invert_dependency',
  deliveryTopology: 'get_delivery_topology',
  openApiContract: 'export_openapi_contract',
  scenarioReplay: 'run_scenario_replay',
  productionDrift: 'audit_production_drift',
} as const;

const json = (value: unknown): EvidenceToolResult => ({
  text: JSON.stringify(value, null, 2),
  value,
});

const momentSchema = {
  id: z.string().min(1).describe('实体 ID，例如 request.refund。'),
  label: z.string().min(1).describe('业务名称，例如 退款申请。'),
  responsibleRoleRef: z
    .string()
    .min(1)
    .describe('责任角色 ID，必须是根合同绑定的当事人角色。'),
};

const proofSchema = z
  .object({
    id: z.string().min(1).describe('证明凭证 ID。'),
    label: z.string().min(1).describe('证明凭证名称，例如 银行回单。'),
    responsibleRoleRef: z
      .string()
      .min(1)
      .optional()
      .describe('出具证明的角色，缺省与确认方一致。'),
  })
  .optional();

/**
 * Builds one operator's commands against the live model, then commits them
 * through the same patch channel a hand-written command batch uses.
 *
 * External agents hit the same guards and the same undo history as the desktop
 * session; a builder refusal becomes a readable error instead of a partial
 * write.
 */
const runOperator = async (
  client: EvidenceMcpAppClient,
  rationale: string,
  build: (
    document: Awaited<ReturnType<EvidenceMcpAppClient['getDomainModel']>>['document'],
  ) => OperatorPatch,
): Promise<EvidenceToolResult> => {
  let patch: OperatorPatch;

  try {
    const model = await client.getDomainModel({ includeRules: true });

    patch = build(model.document);
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知原因';

    return { text: `算子未执行：${message}`, value: { error: message }, isError: true };
  }

  const result = await client.applyModelPatch({
    rationale,
    commands: patch.commands,
  });

  return result.success
    ? json({ ...result, createdIds: patch.createdIds })
    : {
        text: JSON.stringify(result, null, 2),
        value: result,
        isError: true,
      };
};

/**
 * The seven tools the desktop exposes to external agents.
 *
 * Registration and transport live in `createEvidenceMcpServer`; keeping the
 * behaviour here makes it testable without a transport and lets the desktop
 * main process reuse the same handlers in-process.
 */
export const createEvidenceTools = (
  client: EvidenceMcpAppClient,
): readonly EvidenceTool[] => [
  {
    name: TOOL_NAMES.appState,
    title: '读取 Evidence 桌面端状态',
    description:
      '返回当前打开的项目、画布选区、传感器门禁结论与 MCP 连接数。调用其他工具前先用它确认桌面端已打开正确的模型。',
    inputSchema: {},
    annotations: READ_ONLY,
    run: async () => json(await client.getAppState()),
  },
  {
    name: TOOL_NAMES.domainModel,
    title: '读取领域模型 AST',
    description:
      '返回当前 .evidence/fm 的完整领域模型（实体、关系、规则），可按上下文过滤。读取用于分析，不要据此直接改写文件。',
    inputSchema: {
      contextRef: z
        .string()
        .min(1)
        .optional()
        .describe('可选：只返回该上下文内的对象。'),
      includeRules: z
        .boolean()
        .optional()
        .describe('是否包含规则，默认包含。'),
    },
    annotations: READ_ONLY,
    run: async (input) =>
      json(
        await client.getDomainModel({
          ...(typeof input.contextRef === 'string'
            ? { contextRef: input.contextRef }
            : {}),
          ...(typeof input.includeRules === 'boolean'
            ? { includeRules: input.includeRules }
            : {}),
        }),
      ),
  },
  {
    name: TOOL_NAMES.selectedEntity,
    title: '读取画布选中的业务对象',
    description:
      '返回当前选中对象的完整定义、所属上下文、进出关系、派生规则与成对履约结构，用于“所选即所聊”的追问。',
    inputSchema: {},
    annotations: READ_ONLY,
    run: async () => json(await client.getSelectedEntity()),
  },
  {
    name: TOOL_NAMES.keyDataAudit,
    title: '读取关键数据台账',
    description:
      '返回关键数据台账：哪些金额、期限、数量与时间差仍缺少提供方或派生规则。',
    inputSchema: {},
    annotations: READ_ONLY,
    run: async () => json(await client.getKeyDataAudit()),
  },
  {
    name: TOOL_NAMES.screenshot,
    title: '截取画布渲染结果',
    description:
      '按 1:1 渲染当前画布或指定对象并返回 PNG，用于视觉审查模型拓扑与排版。截图不含编辑器辅助线。',
    inputSchema: {
      targetNodeId: z
        .string()
        .min(1)
        .optional()
        .describe('可选：目标对象 ID，缺省为当前选区或整个画布。'),
    },
    annotations: READ_ONLY,
    run: async (input) => {
      const screenshot = await client.getScreenshot({
        ...(typeof input.targetNodeId === 'string'
          ? { targetNodeId: input.targetNodeId }
          : {}),
      });

      return {
        text: JSON.stringify(
          {
            nodeId: screenshot.nodeId,
            width: screenshot.width,
            height: screenshot.height,
            mimeType: screenshot.mimeType,
          },
          null,
          2,
        ),
        image: { data: screenshot.data, mimeType: screenshot.mimeType },
        value: screenshot,
      };
    },
  },
  {
    name: TOOL_NAMES.applyPatch,
    title: '提交模型补丁',
    description:
      '把强类型 ModelCommand 补丁提交给桌面端内存模型：画布立即更新、用户可 Cmd+Z 撤销。补丁先在克隆图上做静态检查，破坏红线即整体拒绝。',
    inputSchema: {
      rationale: z
        .string()
        .min(1)
        .describe('本批修改的业务理由，会显示在桌面端活动流里。'),
      commands: z
        .array(z.unknown())
        .min(1)
        .describe('ModelCommand 数组，每项必须带 type 字段。'),
    },
    annotations: WRITES_MODEL,
    run: async (input) => {
      const rationale =
        typeof input.rationale === 'string' ? input.rationale : '';
      const commands = Array.isArray(input.commands) ? input.commands : [];
      const result = await client.applyModelPatch({ rationale, commands });

      return {
        text: JSON.stringify(result, null, 2),
        value: result,
        ...(result.success ? {} : { isError: true }),
      };
    },
  },
  {
    name: TOOL_NAMES.introduceFulfillmentPair,
    title: '新增成对履约项',
    description:
      '在一个合同上下文里新增一组履约请求（时段）与履约确认（时刻），自动补齐业务时间、引用根合同并装配完成判断规则。有请求就必须有确认，不要分两次建。',
    inputSchema: {
      contextRef: z
        .string()
        .min(1)
        .describe('所属合同上下文 ID，例如 context.procurement。'),
      request: z.object({
        ...momentSchema,
        window: z.string().min(1).optional().describe('履约窗口，例如 7 个工作日。'),
      }),
      confirmation: z.object(momentSchema),
      proof: proofSchema,
    },
    annotations: WRITES_MODEL,
    run: async (input) => {
      const intent = input as unknown as Parameters<
        typeof introduceFulfillmentPair
      >[1];

      return runOperator(
        client,
        `新增履约项：${intent.request.label} / ${intent.confirmation.label}`,
        (document) => introduceFulfillmentPair(document, intent),
      );
    },
  },
  {
    name: TOOL_NAMES.addBreachCompensation,
    title: '新增违约补偿分支',
    description:
      '为一个已有履约请求声明违约条件，并同时新增该违约触发的补偿履约对。违约不是回滚，而是在同一合同上下文中触发新的履约项。',
    inputSchema: {
      requestRef: z.string().min(1).describe('被违反的履约请求 ID。'),
      confirmationRef: z
        .string()
        .min(1)
        .describe('本应关闭该请求的履约确认 ID。'),
      condition: z
        .string()
        .min(1)
        .describe('违约的业务描述，例如 超过约定窗口仍未到账。'),
      request: z.object({
        ...momentSchema,
        window: z.string().min(1).optional(),
      }),
      confirmation: z.object(momentSchema),
      proof: proofSchema,
    },
    annotations: WRITES_MODEL,
    run: async (input) => {
      const intent = input as unknown as Parameters<
        typeof addBreachCompensation
      >[1];

      return runOperator(client, `违约补偿：${intent.condition}`, (document) =>
        addBreachCompensation(document, intent),
      );
    },
  },
  {
    name: TOOL_NAMES.roleifyAndInvertDependency,
    title: '反转依赖并隔离变化点',
    description:
      '把核心合同依赖的履约确认抽象为能力角色，并新增独立的支撑合同上下文，让外部履约确认扮演该角色。用于引入支付渠道、物流或其它第三方能力时隔离变化点。',
    inputSchema: {
      targetConfirmationRef: z
        .string()
        .min(1)
        .describe('核心合同中将被抽象的履约确认 ID。'),
      socket: z.object({
        id: z.string().min(1).describe('能力角色 ID。'),
        label: z.string().min(1).describe('能力角色名称，例如 付款能力。'),
      }),
      supporting: z.object({
        context: z.object({ id: z.string().min(1), label: z.string().min(1) }),
        contract: z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          signedAtMeaning: z.string().min(1).optional(),
        }),
        provider: z.object({
          id: z.string().min(1),
          label: z.string().min(1).describe('提供能力的一方。'),
        }),
        consumer: z.object({
          id: z.string().min(1),
          label: z.string().min(1).describe('请求能力的一方。'),
        }),
        request: z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          window: z.string().min(1).optional(),
        }),
        confirmation: z.object({ id: z.string().min(1), label: z.string().min(1) }),
      }),
    },
    annotations: WRITES_MODEL,
    run: async (input) => {
      const intent = input as unknown as Parameters<
        typeof roleifyAndInvertDependency
      >[1];

      return runOperator(
        client,
        `反转依赖：${intent.socket.label} 交由 ${intent.supporting.contract.label} 履约`,
        (document) => roleifyAndInvertDependency(document, intent),
      );
    },
  },
  {
    name: TOOL_NAMES.deliveryTopology,
    title: '读取交付拓扑',
    description:
      '返回模型落成的服务边界：每个上下文一个服务，跨边界的调用方式（同步/异步）与尚未闭环的能力。用于在写代码前确认微服务切分与依赖方向。',
    inputSchema: {},
    annotations: READ_ONLY,
    run: async () => json(await client.getDeliveryTopology()),
  },
  {
    name: TOOL_NAMES.openApiContract,
    title: '导出 OpenAPI 契约',
    description:
      '返回模型投影出的 OpenAPI 3.1 文档：履约请求映射为发起接口，履约确认映射为完成接口。派生值与业务时间不出现在请求体中。',
    inputSchema: {},
    annotations: READ_ONLY,
    run: async () => json(await client.exportOpenApiContract()),
  },
  {
    name: TOOL_NAMES.scenarioReplay,
    title: '回放业务场景',
    description:
      '逐步回放模型自带的验证场景：每一步发起了什么、由谁发起、算出了哪些派生值、每个履约请求此刻是什么状态。用来确认模型自己的场景仍然成立，而不是只看最后一句结论。',
    inputSchema: {
      scenarioId: z
        .string()
        .min(1)
        .optional()
        .describe('可选：只回放该场景并返回它的逐帧结果，缺省只返回各场景摘要。'),
    },
    annotations: READ_ONLY,
    run: async (input) =>
      json(
        await client.runScenarioReplay({
          ...(typeof input.scenarioId === 'string'
            ? { scenarioId: input.scenarioId }
            : {}),
        }),
      ),
  },
  {
    name: TOOL_NAMES.productionDrift,
    title: '比对生产轨迹与模型',
    description:
      '把导出的 OTLP/JSON trace 与已保存的模型比对：生产提交了模型没有的凭证、把值写进派生字段、跨上下文写入、违约后没有后续履约，都会逐条报告。阻塞项的修复方向不是改模型迁就代码。',
    inputSchema: {
      document: z
        .unknown()
        .describe('OTLP/JSON 导出，形如 { resourceSpans: [...] }。'),
    },
    annotations: READ_ONLY,
    run: async (input) =>
      json(await client.auditProductionDrift({ document: input.document })),
  },
  {
    name: TOOL_NAMES.stageGate,
    title: '执行阶段门禁',
    description:
      '运行阶段门禁判定，说明当前模型是否满足下游 API 契约或联合审核页的交付条件。',
    inputSchema: {
      target: z
        .enum(['api', 'visualization'])
        .describe('下游阶段：api 或 visualization。'),
    },
    annotations: READ_ONLY,
    run: async (input) => {
      const target = input.target === 'api' ? 'api' : 'visualization';
      const result = await client.runStageGate({ target });

      return { text: JSON.stringify(result, null, 2), value: result };
    },
  },
];

export const evidenceToolNames: readonly string[] = Object.values(TOOL_NAMES);

export const SERVER_INSTRUCTIONS =
  'These tools read the Evidence business model that is open in the desktop app. Read get_app_state first, then get_selected_entity or get_domain_model before proposing changes. Prefer the fulfillment operators over hand-written commands: introduce_fulfillment_pair for a request plus the confirmation that closes it, add_breach_compensation for a missed deadline and the pair it triggers, roleify_and_invert_dependency when a capability moves behind its own contract. Anything else goes through apply_model_patch so the modeler can undo it; never write .evidence/fm files directly. After a patch, check get_key_data_audit and run_stage_gate before claiming the work is done. When the question is what the model becomes, read get_delivery_topology and export_openapi_contract instead of inventing a service split. When the question is whether the model still holds, run_scenario_replay; when the question is whether production matches it, audit_production_drift — and treat a blocking drift as a service-side defect, not a reason to edit the model.';
