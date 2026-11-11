import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
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
} as const;

const json = (value: unknown): EvidenceToolResult => ({
  text: JSON.stringify(value, null, 2),
  value,
});

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
      '返回锁定的 Python 检查器给出的关键数据台账：哪些金额、期限、数量与时间差仍缺少提供方或派生规则。',
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
    name: TOOL_NAMES.stageGate,
    title: '执行阶段门禁',
    description:
      '运行锁定的阶段门禁脚本，判断当前模型是否满足下游 API 契约或联合审核页的交付条件。',
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
  'These tools read the Evidence business model that is open in the desktop app. Read get_app_state first, then get_selected_entity or get_domain_model before proposing changes. Every edit must go through apply_model_patch so the modeler can undo it; never write .evidence/fm files directly. After a patch, check get_key_data_audit and run_stage_gate before claiming the work is done.';
