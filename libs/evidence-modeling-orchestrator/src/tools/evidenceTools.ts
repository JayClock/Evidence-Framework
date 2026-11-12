import type {
  ExtensionAPI,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type {
  DomainModelDocument,
  ValueType,
} from '@evidence-poc/evidence-schema';
import {
  addBreachCompensation,
  annotateContractClauses,
  domainNounOf,
  introduceFulfillmentPair,
  isolateDomainCalculator,
  parseBlueprint,
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
  annotateContractClauses: 'annotate_contract_clauses',
  readServiceBlueprint: 'read_service_blueprint',
  isolateDomainCalculator: 'isolate_domain_calculator',
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

    pi.registerTool({
      name: TOOL_NAMES.annotateContractClauses,
      label: '读一份协议的条款分类',
      description:
        '把一份协议或用户协议原文按业务逻辑、领域逻辑、纯法务条款分成三类，并给出可以抽成领域计算器的条款。只读不写：先看清哪几句是业务，再决定建什么。',
      parameters: Type.Object({
        text: Type.String({
          description: '协议或合同原文，整段粘贴，不需要预先分句。',
        }),
      }),
      execute: async (_toolCallId, params) => {
        const { clauses, issues } = annotateContractClauses(params.text);
        const summary = {
          counts: {
            business: clauses.filter((clause) => clause.category === 'business')
              .length,
            domain: clauses.filter((clause) => clause.category === 'domain').length,
            boilerplate: clauses.filter((clause) => clause.category === 'boilerplate')
              .length,
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

    pi.registerTool({
      name: TOOL_NAMES.readServiceBlueprint,
      label: '读一张服务蓝图',
      description:
        '把「阶段 / 活动 / 凭证 / 当事人 / 标的物」的服务蓝图表格读成履约草稿，返回凭证、成对履约与缺口。没有合同可读时，用它把业务流程转成模型骨架。',
      parameters: Type.Object({
        table: Type.String({
          description: 'Markdown 表格或 CSV，表头至少包含「业务凭证 / 凭证」列。',
        }),
        modelName: Type.Optional(Type.String({ description: '模型名称。' })),
      }),
      execute: async (_toolCallId, params) => {
        const parsed = parseBlueprint(params.table, {
          ...(params.modelName === undefined ? {} : { modelName: params.modelName }),
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

    pi.registerTool({
      name: TOOL_NAMES.isolateDomainCalculator,
      label: '抽出领域计算器',
      description:
        '把合同里「按比例算、按阶梯算、按条件判定」的部分抽成领域上下文里的计算器或检查器，并同时写入读取它的派生规则。计价、折扣、等级、有效期、资格校验都走这条路径，不要把它们留成合同参数或前端入参。',
      parameters: Type.Object({
        host: Type.Object({
          ref: Type.String({ description: '承载派生值的实体 ID，通常是履约凭证。' }),
          attribute: Type.Object({
            name: Type.String({ description: '派生属性名，例如 service_fee。' }),
            label: Type.String({ description: '属性中文名，例如 服务费。' }),
            meaning: Type.String({ description: '业务含义，写清由谁形成、怎么核对。' }),
            valueType: Type.String({
              description: '属性值类型，例如 money、decimal、int、date。',
            }),
            required: Type.Optional(Type.Boolean()),
            keyData: Type.Optional(Type.Boolean()),
          }),
        }),
        context: Type.Object({
          id: Type.String({ description: '领域上下文 ID，例如 context.fee-rules。' }),
          label: Type.String({ description: '领域上下文名称。' }),
        }),
        calculator: Type.Object({
          id: Type.String({ description: '组件 ID，例如 thing.fee-calculator。' }),
          label: Type.String({
            description: '组件名称，例如 服务费计算器；判定类用 检查器。',
          }),
          role: Type.Optional(
            Type.String({ description: 'calculator 或 checker，缺省 calculator。' }),
          ),
          meaning: Type.Optional(
            Type.String({ description: '这个组件负责算什么、依据什么。' }),
          ),
          attributes: Type.Optional(
            Type.Array(
              Type.Object({
                name: Type.String(),
                label: Type.String(),
                meaning: Type.String(),
                valueType: Type.String(),
                required: Type.Optional(Type.Boolean()),
                keyData: Type.Optional(Type.Boolean()),
              }),
              { description: '计算器的输入参数，例如协议费率。' },
            ),
          ),
        }),
        rule: Type.Object({
          id: Type.String({ description: '规则 ID，例如 rule.service-fee。' }),
          label: Type.String(),
          description: Type.String({
            description: '业务口径，用一句话写清这条规则怎么算。',
          }),
          expression: Type.String({
            description:
              'CEL 表达式，只读已建模属性；计算器默认别名 calculator，宿主默认别名 host。',
          }),
          resultType: Type.String({ description: '结果类型，例如 money。' }),
          alias: Type.Optional(Type.String()),
        }),
        hostAlias: Type.Optional(Type.String()),
      }),
      execute: async (_toolCallId, params) =>
        runOperator(
          `抽出领域计算：${params.calculator.label}`,
          (document) =>
            isolateDomainCalculator(document, {
              host: {
                ref: params.host.ref,
                attribute: {
                  name: params.host.attribute.name,
                  label: params.host.attribute.label,
                  meaning: params.host.attribute.meaning,
                  valueType: params.host.attribute.valueType as ValueType,
                  ...(params.host.attribute.required === undefined
                    ? {}
                    : { required: params.host.attribute.required }),
                  ...(params.host.attribute.keyData === undefined
                    ? {}
                    : { keyData: params.host.attribute.keyData }),
                },
              },
              context: params.context,
              calculator: {
                id: params.calculator.id,
                label: params.calculator.label,
                role: params.calculator.role === 'checker' ? 'checker' : 'calculator',
                ...(params.calculator.meaning === undefined
                  ? {}
                  : { meaning: params.calculator.meaning }),
                ...(params.calculator.attributes === undefined
                  ? {}
                  : {
                      attributes: params.calculator.attributes.map((attribute) => ({
                        name: attribute.name,
                        label: attribute.label,
                        meaning: attribute.meaning,
                        valueType: attribute.valueType as ValueType,
                        ...(attribute.required === undefined
                          ? {}
                          : { required: attribute.required }),
                        ...(attribute.keyData === undefined
                          ? {}
                          : { keyData: attribute.keyData }),
                      })),
                    }),
              },
              rule: {
                id: params.rule.id,
                label: params.rule.label,
                description: params.rule.description,
                expression: params.rule.expression,
                resultType: params.rule.resultType as ValueType,
                ...(params.rule.alias === undefined ? {} : { alias: params.rule.alias }),
              },
              ...(params.hostAlias === undefined ? {} : { hostAlias: params.hostAlias }),
            }),
        ),
    });
  };

/** The tool definitions the extension registers, for list-based registration. */
export const evidenceToolNames: readonly string[] = Object.values(TOOL_NAMES);

export type EvidenceToolDefinition = ToolDefinition;
