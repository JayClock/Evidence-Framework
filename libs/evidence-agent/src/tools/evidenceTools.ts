import type {
  ExtensionAPI,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import {
  BreachCompensationIntentSchema,
  DomainCalculatorIntentSchema,
  DomainIdSchema,
  FulfillmentPairIntentSchema,
  RoleInversionIntentSchema,
  ModelPatchRequestSchema,
  JsonPatchSchema,
  type JsonPatchOperation,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';
import {
  applyModelPatches,
  createModelPatch,
  addBreachCompensationMutator,
  annotateContractClauses,
  domainNounOf,
  introduceFulfillmentPairMutator,
  isolateDomainCalculatorMutator,
  parseBlueprint,
  roleifyAndInvertDependencyMutator,
  type OperatorResult,
} from '@evidence-poc/evidence-model-core';
import { z } from 'zod';
import { registerZodTool } from './registerZodTool.js';

import { checkNativeApiSensor } from '../sensors/native/nativeApiSensor.js';
import type { SensorReport } from '../sensors/sensorReport.js';

const nonEmptyText = (description?: string) =>
  (description === undefined
    ? z.string()
    : z.string().describe(description)
  ).min(1);

const apiDiffParameters = z
  .object({
    proposedPatches: JsonPatchSchema.optional(),
  })
  .strict();
const syncApiParameters = z.object({ rationale: nonEmptyText() }).strict();
const sensorParameters = z
  .object({
    scope: DomainIdSchema.describe(
      '可选的上下文 ID；省略则只做一致性检查。',
    ).optional(),
  })
  .strict();
const applyPatchParameters = ModelPatchRequestSchema;
const emptyParameters = z.object({}).strict();
const clauseParameters = z
  .object({
    text: nonEmptyText('协议或合同原文，整段粘贴，不需要预先分句。'),
  })
  .strict();
const blueprintParameters = z
  .object({
    table: nonEmptyText(
      'Markdown 表格或 CSV，表头至少包含「业务凭证 / 凭证」列。',
    ),
    modelName: z.string().describe('模型名称。').optional(),
  })
  .strict();
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

/** One RFC 6902 change set, validated again at the renderer boundary. */
export interface ModelPatchRequest {
  rationale: string;
  patches: readonly JsonPatchOperation[];
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
  loadBaseDocument?: () => Promise<DomainModelDocument | undefined>;
  refreshApi?: () => Promise<void>;
  loadDocument: () => Promise<DomainModelDocument>;
  /** Absolute path of `.evidence/fm` for this project. */
  modelRoot: string;
}

export const TOOL_NAMES = {
  getApiDiff: 'get_api_diff',
  syncApiProjection: 'sync_api_projection',
  runSensors: 'run_sensors',
  applyModelPatch: 'apply_model_patch',
  getCanvasSelection: 'get_canvas_selection',
  introduceFulfillmentPair: 'introduce_fulfillment_pair',
  addBreachCompensation: 'add_breach_compensation',
  roleifyAndInvertDependency: 'roleify_and_invert_dependency',
  annotateContractClauses: 'annotate_contract_clauses',
  readServiceBlueprint: 'read_service_blueprint',
  isolateDomainCalculator: 'isolate_domain_calculator',
} as const;

const textResult = <T>(value: T, text: string) => ({
  content: [{ type: 'text' as const, text }],
  details: value,
});

/**
 * Builds the tools that turn the desktop into the agent's hands and eyes.
 *
 * They are registered as Pi extension factories so the model can call them
 * mid-conversation: read the canvas, run the sensors, then patch the model
 * through the same command layer a human edit uses.
 */
export const createEvidenceToolsExtension =
  (handlers: EvidenceToolsHandlers) =>
  (pi: ExtensionAPI): void => {
    registerZodTool(pi, {
      name: TOOL_NAMES.getApiDiff,
      label: '查看 API 增量',
      description:
        '只读比对当前画布与会话基线；可试算补丁，不修改模型或发布基线。',
      parameters: apiDiffParameters,
      execute: async (_id, params) => {
        const current = await handlers.loadDocument();
        const proposed = applyModelPatches(
          current,
          params.proposedPatches ?? [],
        );
        const base =
          params.proposedPatches === undefined
            ? await handlers.loadBaseDocument?.()
            : current;
        const outcome = await checkNativeApiSensor({
          currentDocument: proposed,
          ...(base === undefined ? {} : { baseDocument: base }),
        });
        return textResult(
          outcome,
          outcome.diff === null
            ? '当前没有比较基线；仅返回当前 API 检查结果。'
            : outcome.diff.changelog,
        );
      },
    });
    registerZodTool(pi, {
      name: TOOL_NAMES.syncApiProjection,
      label: '刷新 API 草稿',
      description:
        '重新投影当前模型并刷新诊断；不写盘、不补造接口、不确认破坏性变更。',
      parameters: syncApiParameters,
      execute: async (_id, params) => {
        await handlers.refreshApi?.();
        const current = await handlers.loadDocument();
        const base = await handlers.loadBaseDocument?.();
        const outcome = await checkNativeApiSensor({
          currentDocument: current,
          ...(base === undefined ? {} : { baseDocument: base }),
        });
        return textResult(
          outcome,
          `${params.rationale}\n${JSON.stringify(outcome.summary)}`,
        );
      },
    });
    registerZodTool(pi, {
      name: TOOL_NAMES.runSensors,
      label: '运行质量传感器',
      description:
        '运行质量传感器（一致性、关键数据台账）并返回阻塞与警告项。修改模型后必须调用它确认没有留下虚假胜利。',
      parameters: sensorParameters,
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

    registerZodTool(pi, {
      name: TOOL_NAMES.applyModelPatch,
      label: '应用模型补丁',
      description:
        '把 RFC 6902 JSON Patch 提交给桌面端内存模型，path/from 使用 JSON Pointer（如 /entities/0/label）；支持 add/remove/replace/move/copy/test，画布立即更新且用户可按 Cmd+Z 撤销。不要直接改 .evidence/fm 文件。',
      parameters: applyPatchParameters,
      execute: async (_toolCallId, params) => {
        const types = params.patches.map((patch) => patch.op);
        const result = await handlers.applyModelPatch(params);

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

    registerZodTool(pi, {
      name: TOOL_NAMES.getCanvasSelection,
      label: '读取画布选中项',
      description:
        '读取用户当前在画布上选中的业务对象与属性，用于“所选即所聊”的追问。',
      parameters: emptyParameters,
      execute: async () => {
        const context = await handlers.getCanvasContext();

        return textResult(context, JSON.stringify(context, null, 2));
      },
    });

    registerZodTool(pi, {
      name: TOOL_NAMES.annotateContractClauses,
      label: '读一份协议的条款分类',
      description:
        '把一份协议或用户协议原文按业务逻辑、领域逻辑、纯法务条款分成三类，并给出可以抽成领域计算器的条款。只读不写：先看清哪几句是业务，再决定建什么。',
      parameters: clauseParameters,
      execute: async (_toolCallId, params) => {
        const { clauses, issues } = annotateContractClauses(params.text);
        const summary = {
          counts: {
            business: clauses.filter((clause) => clause.category === 'business')
              .length,
            domain: clauses.filter((clause) => clause.category === 'domain')
              .length,
            boilerplate: clauses.filter(
              (clause) => clause.category === 'boilerplate',
            ).length,
          },
          clauses: clauses.map((clause) => ({
            index: clause.index,
            category: clause.category,
            computesValue: clause.computesValue,
            reason: clause.reason,
            text: clause.text,
            component: clause.computesValue
              ? (domainNounOf(clause.text) ?? null)
              : null,
          })),
          issues,
        };

        return textResult(summary, JSON.stringify(summary, null, 2));
      },
    });

    registerZodTool(pi, {
      name: TOOL_NAMES.readServiceBlueprint,
      label: '读一张服务蓝图',
      description:
        '把「阶段 / 活动 / 凭证 / 当事人 / 标的物」的服务蓝图表格读成履约草稿，返回凭证、成对履约与缺口。没有合同可读时，用它把业务流程转成模型骨架。',
      parameters: blueprintParameters,
      execute: async (_toolCallId, params) => {
        const parsed = parseBlueprint(params.table, {
          ...(params.modelName === undefined
            ? {}
            : { modelName: params.modelName }),
          format: 'auto',
        });

        if (!parsed.success) {
          const failure = {
            contexts: [],
            evidences: [],
            pairs: [],
            things: [],
            issues: [
              parsed.error,
              ...parsed.issues.map((issue) => issue.message),
            ],
          };

          return {
            ...textResult(failure, `蓝图读不出来：${parsed.error}`),
            isError: true,
          };
        }

        const summary = {
          contexts: parsed.draft.contexts.map((context) => ({
            id: context.id,
            label: context.label,
            kind: context.kind,
          })),
          evidences: parsed.draft.evidences.map((evidence) => ({
            id: evidence.id,
            label: evidence.label,
            kind: evidence.kind,
            contextRef: evidence.contextRef,
          })),
          pairs: parsed.draft.fulfillmentPairs.map((pair) => pair.label),
          things: parsed.draft.things.map((thing) => thing.label),
          issues: parsed.issues.map((issue) => issue.message),
        };

        return textResult(summary, JSON.stringify(summary, null, 2));
      },
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
      build: (document: DomainModelDocument) => OperatorResult,
    ): Promise<OperatorToolResult> => {
      let patch: ReturnType<typeof createModelPatch<OperatorResult>>;

      try {
        patch = createModelPatch(await handlers.loadDocument(), build);
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知原因';

        return operatorResult(
          { error: message },
          `算子未执行：${message}`,
          true,
        );
      }

      const result = await handlers.applyModelPatch({
        rationale,
        patches: patch.patches,
      });

      return result.success
        ? operatorResult(
            { ...result, createdIds: patch.result.createdIds },
            `已写入：${patch.result.createdIds.join(', ')}。`,
          )
        : operatorResult(result, `补丁被拒绝：${result.error}`, true);
    };

    registerZodTool(pi, {
      name: TOOL_NAMES.introduceFulfillmentPair,
      label: '新增成对履约项',
      description:
        '在一个合同上下文里新增一组履约请求（时段）与履约确认（时刻），自动补齐业务时间、引用根合同并装配完成判断规则。有请求就必须有确认，不要分两次建。',
      parameters: FulfillmentPairIntentSchema,
      execute: async (_toolCallId, params) =>
        runOperator(
          `新增履约项：${params.request.label} / ${params.confirmation.label}`,
          (document) => introduceFulfillmentPairMutator(document, params),
        ),
    });

    registerZodTool(pi, {
      name: TOOL_NAMES.addBreachCompensation,
      label: '新增违约补偿分支',
      description:
        '为一个已有履约请求声明违约条件，并同时新增该违约触发的补偿履约对。违约不是回滚，而是在同一合同上下文中触发新的履约项。',
      parameters: BreachCompensationIntentSchema,
      execute: async (_toolCallId, params) =>
        runOperator(`违约补偿：${params.condition}`, (document) =>
          addBreachCompensationMutator(document, params),
        ),
    });

    registerZodTool(pi, {
      name: TOOL_NAMES.roleifyAndInvertDependency,
      label: '反转依赖并隔离变化点',
      description:
        '把核心合同依赖的履约确认抽象为能力角色，并新增独立的支撑合同上下文，让外部履约确认扮演该角色。用于引入支付渠道、物流或其它第三方能力时隔离变化点。',
      parameters: RoleInversionIntentSchema,
      execute: async (_toolCallId, params) =>
        runOperator(
          `反转依赖：${params.socket.label} 交由 ${params.supporting.contract.label} 履约`,
          (document) => roleifyAndInvertDependencyMutator(document, params),
        ),
    });

    registerZodTool(pi, {
      name: TOOL_NAMES.isolateDomainCalculator,
      label: '抽出领域计算器',
      description:
        '把合同里「按比例算、按阶梯算、按条件判定」的部分抽成领域上下文里的计算器或检查器，并同时写入读取它的派生规则。计价、折扣、等级、有效期、资格校验都走这条路径，不要把它们留成合同参数或前端入参。',
      parameters: DomainCalculatorIntentSchema,
      execute: async (_toolCallId, params) =>
        runOperator(`抽出领域计算：${params.calculator.label}`, (document) =>
          isolateDomainCalculatorMutator(document, params),
        ),
    });
  };

/** The tool definitions the extension registers, for list-based registration. */
export const evidenceToolNames: readonly string[] = Object.values(TOOL_NAMES);

export type EvidenceToolDefinition = ToolDefinition;
