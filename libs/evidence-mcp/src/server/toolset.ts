import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import {
  createModelTools,
  MODEL_TOOL_NAMES,
} from '@evidence-poc/evidence-tools';
import { z } from 'zod';
import { DomainIdSchema } from '@evidence-poc/evidence-schema';

import type { EvidenceMcpAppClient } from '../types.js';

const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
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
  inputSchema: z.AnyZodObject;
  annotations: ToolAnnotations;
  run(
    input: Record<string, never> | Record<string, unknown>,
  ): Promise<EvidenceToolResult>;
}

const defineTool = <Schema extends z.AnyZodObject>(
  tool: Omit<EvidenceTool, 'inputSchema' | 'run'> & {
    inputSchema: Schema;
    run(input: z.infer<Schema>): Promise<EvidenceToolResult>;
  },
): EvidenceTool => ({
  ...tool,
  run: async (input) => tool.run(tool.inputSchema.parse(input)),
});

export const TOOL_NAMES = {
  appState: 'get_app_state',
  domainModel: 'get_domain_model',
  selectedEntity: 'get_selected_entity',
  keyDataAudit: 'get_key_data_audit',
  screenshot: 'get_canvas_screenshot',
  stageGate: 'run_stage_gate',
  ...MODEL_TOOL_NAMES,
  deliveryTopology: 'get_delivery_topology',
  openApiContract: 'export_openapi_contract',
} as const;

const json = (value: unknown): EvidenceToolResult => ({
  text: JSON.stringify(value, null, 2),
  value,
});

/**
 * The tools the desktop exposes to external agents.
 *
 * Registration and transport live in `createEvidenceMcpServer`; keeping the
 * behaviour here makes it testable without a transport and lets the desktop
 * main process reuse the same handlers in-process.
 */
export const createEvidenceTools = (
  client: EvidenceMcpAppClient,
): readonly EvidenceTool[] => [
  defineTool({
    name: TOOL_NAMES.appState,
    title: '读取 Evidence 桌面端状态',
    description:
      '返回当前打开的项目、画布选区、传感器门禁结论与 MCP 连接数。调用其他工具前先用它确认桌面端已打开正确的模型。',
    inputSchema: z.object({}).strict(),
    annotations: READ_ONLY,
    run: async () => json(await client.getAppState()),
  }),
  defineTool({
    name: TOOL_NAMES.domainModel,
    title: '读取领域模型 AST',
    description:
      '返回当前 .evidence/fm 的完整领域模型（实体、关系、规则），可按上下文过滤。读取用于分析，不要据此直接改写文件。',
    inputSchema: z
      .object({
        contextRef:
          DomainIdSchema.optional().describe('可选：只返回该上下文内的对象。'),
        includeRules: z
          .boolean()
          .optional()
          .describe('是否包含规则，默认包含。'),
      })
      .strict(),
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
  }),
  defineTool({
    name: TOOL_NAMES.selectedEntity,
    title: '读取画布选中的业务对象',
    description:
      '返回当前选中对象的完整定义、所属上下文、进出关系、派生规则与成对履约结构，用于“所选即所聊”的追问。',
    inputSchema: z.object({}).strict(),
    annotations: READ_ONLY,
    run: async () => json(await client.getSelectedEntity()),
  }),
  defineTool({
    name: TOOL_NAMES.keyDataAudit,
    title: '读取关键数据台账',
    description:
      '返回关键数据台账：哪些金额、期限、数量与时间差仍缺少提供方或派生规则。',
    inputSchema: z.object({}).strict(),
    annotations: READ_ONLY,
    run: async () => json(await client.getKeyDataAudit()),
  }),
  defineTool({
    name: TOOL_NAMES.screenshot,
    title: '截取画布渲染结果',
    description:
      '按 1:1 渲染当前画布或指定对象并返回 PNG，用于视觉审查模型拓扑与排版。截图不含编辑器辅助线。',
    inputSchema: z
      .object({
        targetNodeId: DomainIdSchema.optional().describe(
          '可选：目标对象 ID，缺省为当前选区或整个画布。',
        ),
      })
      .strict(),
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
  }),
  ...createModelTools({
    loadDocument: async () =>
      (await client.getDomainModel({ includeRules: true })).document,
    applyModelPatch: async (patch) => {
      const result = await client.applyModelPatch(patch);
      return result.success
        ? { ...result, success: true as const }
        : {
            ...result,
            success: false as const,
            error: result.error ?? '模型补丁被拒绝。',
          };
    },
  }).map(
    (tool): EvidenceTool => ({
      name: tool.name,
      title: tool.label,
      description: tool.description,
      inputSchema: tool.parameters,
      annotations: tool.annotations,
      run: async (input) => {
        const result = await tool.run(input);
        return {
          value: result.value,
          text: result.isError
            ? result.text
            : JSON.stringify(result.value, null, 2),
          ...(result.isError ? { isError: true } : {}),
        };
      },
    }),
  ),
  defineTool({
    name: TOOL_NAMES.deliveryTopology,
    title: '读取交付拓扑',
    description:
      '返回模型落成的服务边界：每个上下文一个服务，routePrefixes 与精确 routes 标明业务路径归属，跨边界的调用方式（同步/异步）与尚未闭环的能力。用于在写代码前确认微服务切分与依赖方向。',
    inputSchema: z.object({}).strict(),
    annotations: READ_ONLY,
    run: async () => json(await client.getDeliveryTopology()),
  }),
  defineTool({
    name: TOOL_NAMES.openApiContract,
    title: '导出 OpenAPI 契约',
    description:
      '返回模型投影出的 OpenAPI 3.1 文档：履约请求映射为发起接口，履约确认映射为完成接口。公开 URI 从业务聚合根起始，与部署上下文解耦；每个创建端点有对称 GET，响应采用 HAL self 与集合 _embedded。派生值与业务时间不出现在请求体中。',
    inputSchema: z.object({}).strict(),
    annotations: READ_ONLY,
    run: async () => json(await client.exportOpenApiContract()),
  }),
  defineTool({
    name: TOOL_NAMES.stageGate,
    title: '执行阶段门禁',
    description:
      '运行 API 阶段门禁判定，说明当前模型是否满足下游 API 契约的交付条件。',
    inputSchema: z
      .object({
        target: z.literal('api').describe('下游阶段：api。'),
      })
      .strict(),
    annotations: READ_ONLY,
    run: async (input) => {
      const result = await client.runStageGate(input);

      return { text: JSON.stringify(result, null, 2), value: result };
    },
  }),
];

export const evidenceToolNames: readonly string[] = Object.values(TOOL_NAMES);

export const SERVER_INSTRUCTIONS =
  'Read get_app_state, then get_selected_entity or get_domain_model. Start with business evidence using batch_add_evidence_stubs, then clarify field provenance with bind_key_data_source. Use split_evidence_to_pair only when a real request and its confirmation are known. Assign contract context to the group with assign_fulfillment_context; cite external evidence instead of pairing across contracts. simulate_what_if_challenge is read-only; grow_breach_compensation records an agreed remedy, not a hypothesis. Other edits use apply_model_patch with RFC 6902 operations and RFC 6901 pointers. Guard positional edits with test operations. The modeler can undo each write batch; never edit .evidence/fm directly. An incomplete graph can be saved. Check get_key_data_audit and run_stage_gate before API delivery; view get_delivery_topology or export_openapi_contract to inspect delivery. Run exported Bruno acceptance cases on a real backend with evidence test.';
