import type {
  ExtensionAPI,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { SensorReport } from '../sensors/sensorReport.js';

/** What the canvas is showing right now, for selection-aware answers. */
export interface CanvasContext {
  projectRoot: string;
  modelId?: string;
  selection: { nodeId: string | null; attributeName: string | null };
  /** Selected entity, already reduced to the fields a model may read. */
  selected?: {
    nodeId: string;
    label: string;
    kind: string;
    contextRef?: string;
    attributes?: readonly { name: string; meaning?: string }[];
  };
}

/** One proposed change set. Commands stay opaque here and are validated downstream. */
export interface ModelPatchRequest {
  rationale: string;
  commands: readonly unknown[];
}

export type ModelPatchResult =
  | { success: true; appliedCommands: readonly string[] }
  | { success: false; error: string };

export interface EvidenceToolsHandlers {
  /** Runs the pinned Python sensors and returns their verdict. */
  runSensors: (input: {
    modelRoot: string;
    scope?: string;
    signal?: AbortSignal;
  }) => Promise<SensorReport>;
  /** Applies a patch through the renderer's ModelSession so undo keeps working. */
  applyModelPatch: (patch: ModelPatchRequest) => Promise<ModelPatchResult>;
  /** Reads the current selection from the canvas. */
  getCanvasContext: () => Promise<CanvasContext>;
  /** Absolute path of `.evidence/fm` for this project. */
  modelRoot: string;
}

export const TOOL_NAMES = {
  runSensors: 'run_sensors',
  applyModelPatch: 'apply_model_patch',
  getCanvasSelection: 'get_canvas_selection',
} as const;

const textResult = <T>(value: T, text: string) => ({
  content: [{ type: 'text' as const, text }],
  details: value,
});

const commandTypes = (commands: readonly unknown[]): string[] =>
  commands.map((command, index) => {
    if (
      typeof command !== 'object' ||
      command === null ||
      typeof (command as { type?: unknown }).type !== 'string'
    ) {
      throw new Error(`commands[${index}] 缺少字符串 type 字段。`);
    }

    return (command as { type: string }).type;
  });

/**
 * Builds the three tools that turn the desktop into the agent's hands and eyes.
 *
 * They are registered as Pi extension factories so the model can call them
 * mid-conversation: read the canvas, run the sensors, then patch the model
 * through the same command layer a human edit uses.
 */
export const createEvidenceToolsExtension =
  (handlers: EvidenceToolsHandlers) =>
  (pi: ExtensionAPI): void => {
    pi.registerTool({
      name: TOOL_NAMES.runSensors,
      label: '运行质量传感器',
      description:
        '运行锁定的 Python 检查器（一致性、关键数据台账）并返回阻塞与警告项。修改模型后必须调用它确认没有留下虚假胜利。',
      parameters: Type.Object({
        scope: Type.Optional(
          Type.String({
            description: '可选的上下文 ID；省略则只做一致性检查。',
          }),
        ),
      }),
      execute: async (_toolCallId, params, signal) => {
        const report = await handlers.runSensors({
          modelRoot: handlers.modelRoot,
          ...(params.scope === undefined ? {} : { scope: params.scope }),
          ...(signal === undefined ? {} : { signal }),
        });

        return textResult(
          report,
          JSON.stringify(
            {
              passed: report.passed,
              isStageGateReady: report.isStageGateReady,
              blockCount: report.blockCount,
              warnCount: report.warnCount,
              decisionOwed: report.keyDataSummary.decisionOwedCount,
              issues: report.issues,
            },
            null,
            2,
          ),
        );
      },
    });

    pi.registerTool({
      name: TOOL_NAMES.applyModelPatch,
      label: '应用模型补丁',
      description:
        '把强类型 ModelCommand 补丁提交给桌面端内存模型，画布立即更新且用户可按 Cmd+Z 撤销。不要直接改 .evidence/fm 文件。',
      parameters: Type.Object({
        rationale: Type.String({
          description: '本批修改的业务理由，会显示在活动流里。',
        }),
        commands: Type.Array(Type.Unknown(), {
          description: 'ModelCommand 数组，每项必须带 type 字段。',
          minItems: 1,
        }),
      }),
      execute: async (_toolCallId, params) => {
        const types = commandTypes(params.commands);
        const result = await handlers.applyModelPatch({
          rationale: params.rationale,
          commands: params.commands,
        });

        return result.success
          ? textResult<ModelPatchResult>(
              result,
              `补丁已应用（${types.join(', ')}）：${params.rationale}`,
            )
          : {
              ...textResult<ModelPatchResult>(
                result,
                `补丁被拒绝：${result.error}`,
              ),
              isError: true,
            };
      },
    });

    pi.registerTool({
      name: TOOL_NAMES.getCanvasSelection,
      label: '读取画布选中项',
      description:
        '读取用户当前在画布上选中的业务对象与属性，用于“所选即所聊”的追问。',
      parameters: Type.Object({}),
      execute: async () => {
        const context = await handlers.getCanvasContext();

        return textResult(context, JSON.stringify(context, null, 2));
      },
    });
  };

/** The tool definitions the extension registers, for list-based registration. */
export const evidenceToolNames: readonly string[] = Object.values(TOOL_NAMES);

export type EvidenceToolDefinition = ToolDefinition;
