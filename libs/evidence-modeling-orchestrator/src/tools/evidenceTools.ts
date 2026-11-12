import type {
  ExtensionAPI,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import {
  addBreachCompensation,
  introduceFulfillmentPair,
  roleifyAndInvertDependency,
  type OperatorPatch,
} from '@evidence-poc/evidence-model-core';
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
  /** Runs the sensors and returns their verdict. */
  runSensors: (input: {
    modelRoot: string;
    scope?: string;
    signal?: AbortSignal;
  }) => Promise<SensorReport>;
  /** Applies a patch through the renderer's ModelSession so undo keeps working. */
  applyModelPatch: (patch: ModelPatchRequest) => Promise<ModelPatchResult>;
  /** Reads the current selection from the canvas. */
  getCanvasContext: () => Promise<CanvasContext>;
  /**
   * Reads the model the operators resolve references against.
   *
   * An operator names the root contract or the breached request itself, so it
   * needs the current tree rather than a guessed id.
   */
  loadDocument: () => Promise<DomainModelDocument>;
  /** Absolute path of `.evidence/fm` for this project. */
  modelRoot: string;
}

export const TOOL_NAMES = {
  runSensors: 'run_sensors',
  applyModelPatch: 'apply_model_patch',
  getCanvasSelection: 'get_canvas_selection',
  introduceFulfillmentPair: 'introduce_fulfillment_pair',
  addBreachCompensation: 'add_breach_compensation',
  roleifyAndInvertDependency: 'roleify_and_invert_dependency',
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
        '运行质量传感器（一致性、关键数据台账）并返回阻塞与警告项。修改模型后必须调用它确认没有留下虚假胜利。',
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

    const pairShape = Type.Object({
      id: Type.String({ description: '实体 ID，例如 request.refund。' }),
      label: Type.String({ description: '业务名称，例如 退款申请。' }),
      responsibleRoleRef: Type.String({
        description: '责任角色 ID，必须是根合同绑定的当事人角色。',
      }),
    });

    /** Shape every operator tool answers with, so the three stay uniform. */
    type OperatorToolResult = {
      content: { type: 'text'; text: string }[];
      details: unknown;
      isError?: boolean;
    };

    const operatorResult = (
      details: unknown,
      text: string,
      isError = false,
    ): OperatorToolResult => ({
      content: [{ type: 'text' as const, text }],
      details,
      ...(isError ? { isError: true } : {}),
    });

    /**
     * Runs one operator and hands its commands to the patch channel.
     *
     * The operator decides nothing the model cannot check: its commands go
     * through the same guards and undo history as a hand edit, and a builder
     * refusal comes back as a readable tool error instead of a stack trace.
     */
    const runOperator = async (
      rationale: string,
      build: (document: DomainModelDocument) => OperatorPatch,
    ): Promise<OperatorToolResult> => {
      let patch: OperatorPatch;

      try {
        patch = build(await handlers.loadDocument());
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知原因';

        return operatorResult({ error: message }, `算子未执行：${message}`, true);
      }

      const result = await handlers.applyModelPatch({
        rationale,
        commands: patch.commands,
      });

      return result.success
        ? operatorResult(
            { ...result, createdIds: patch.createdIds },
            `已写入：${patch.createdIds.join(', ')}。`,
          )
        : operatorResult(result, `补丁被拒绝：${result.error}`, true);
    };

    pi.registerTool({
      name: TOOL_NAMES.introduceFulfillmentPair,
      label: '新增成对履约项',
      description:
        '在一个合同上下文里新增一组履约请求（时段）与履约确认（时刻），自动补齐业务时间、引用根合同并装配完成判断规则。有请求就必须有确认，不要分两次建。',
      parameters: Type.Object({
        contextRef: Type.String({
          description: '所属合同上下文 ID，例如 context.procurement。',
        }),
        request: Type.Intersect([
          pairShape,
          Type.Object({
            window: Type.Optional(
              Type.String({ description: '履约窗口，例如 7 个工作日。' }),
            ),
          }),
        ]),
        confirmation: pairShape,
        proof: Type.Optional(
          Type.Object({
            id: Type.String({ description: '证明凭证 ID。' }),
            label: Type.String({ description: '证明凭证名称，例如 银行回单。' }),
            responsibleRoleRef: Type.Optional(
              Type.String({ description: '出具证明的角色，缺省与确认方一致。' }),
            ),
          }),
        ),
      }),
      execute: async (_toolCallId, params) =>
        runOperator(
          `新增履约项：${params.request.label} / ${params.confirmation.label}`,
          (document) => introduceFulfillmentPair(document, params),
        ),
    });

    pi.registerTool({
      name: TOOL_NAMES.addBreachCompensation,
      label: '新增违约补偿分支',
      description:
        '为一个已有履约请求声明违约条件，并同时新增该违约触发的补偿履约对。违约不是回滚，而是在同一合同上下文中触发新的履约项。',
      parameters: Type.Object({
        requestRef: Type.String({ description: '被违反的履约请求 ID。' }),
        confirmationRef: Type.String({
          description: '本应关闭该请求的履约确认 ID。',
        }),
        condition: Type.String({
          description: '违约的业务描述，例如 超过约定窗口仍未到账。',
        }),
        request: Type.Intersect([
          pairShape,
          Type.Object({
            window: Type.Optional(Type.String()),
          }),
        ]),
        confirmation: pairShape,
        proof: Type.Optional(
          Type.Object({
            id: Type.String(),
            label: Type.String(),
            responsibleRoleRef: Type.Optional(Type.String()),
          }),
        ),
      }),
      execute: async (_toolCallId, params) =>
        runOperator(
          `违约补偿：${params.condition}`,
          (document) => addBreachCompensation(document, params),
        ),
    });

    pi.registerTool({
      name: TOOL_NAMES.roleifyAndInvertDependency,
      label: '反转依赖并隔离变化点',
      description:
        '把核心合同依赖的履约确认抽象为能力角色，并新增独立的支撑合同上下文，让外部履约确认扮演该角色。用于引入支付渠道、物流或其它第三方能力时隔离变化点。',
      parameters: Type.Object({
        targetConfirmationRef: Type.String({
          description: '核心合同中将被抽象的履约确认 ID。',
        }),
        socket: Type.Object({
          id: Type.String({ description: '能力角色 ID。' }),
          label: Type.String({ description: '能力角色名称，例如 付款能力。' }),
        }),
        supporting: Type.Object({
          context: Type.Object({ id: Type.String(), label: Type.String() }),
          contract: Type.Object({
            id: Type.String(),
            label: Type.String(),
            signedAtMeaning: Type.Optional(Type.String()),
          }),
          provider: Type.Object({
            id: Type.String(),
            label: Type.String({ description: '提供能力的一方。' }),
          }),
          consumer: Type.Object({
            id: Type.String(),
            label: Type.String({ description: '请求能力的一方。' }),
          }),
          request: Type.Object({
            id: Type.String(),
            label: Type.String(),
            window: Type.Optional(Type.String()),
          }),
          confirmation: Type.Object({ id: Type.String(), label: Type.String() }),
        }),
      }),
      execute: async (_toolCallId, params) =>
        runOperator(
          `反转依赖：${params.socket.label} 交由 ${params.supporting.contract.label} 履约`,
          (document) => roleifyAndInvertDependency(document, params),
        ),
    });
  };

/** The tool definitions the extension registers, for list-based registration. */
export const evidenceToolNames: readonly string[] = Object.values(TOOL_NAMES);

export type EvidenceToolDefinition = ToolDefinition;
