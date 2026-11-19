import { z } from 'zod';
import {
  AssignFulfillmentContextInputSchema,
  BatchAddEvidenceInputSchema,
  BindKeyDataSourceInputSchema,
  DomainCalculatorIntentSchema,
  DomainIdSchema,
  DomainModelDocumentSchema,
  GrowBreachCompensationInputSchema,
  ModelPatchRequestSchema,
  RoleInversionIntentSchema,
  SplitEvidenceToPairInputSchema,
  timeAttributeOf,
  type DomainModelDocument,
  type JsonPatchOperation,
} from '@evidence-poc/evidence-schema';
import {
  assignFulfillmentContextMutator,
  batchAddEvidenceMutator,
  bindKeyDataSourceMutator,
  createDomainGraph,
  createModelPatch,
  growBreachCompensationMutator,
  isolateDomainCalculatorMutator,
  roleifyAndInvertDependencyMutator,
  splitEvidenceToPairMutator,
  type OperatorResult,
} from '@evidence-poc/evidence-model-core';

export const MODEL_TOOL_NAMES = {
  applyModelPatch: 'apply_model_patch',
  batchAddEvidence: 'batch_add_evidence_stubs',
  splitEvidenceToPair: 'split_evidence_to_pair',
  bindKeyDataSource: 'bind_key_data_source',
  assignFulfillmentContext: 'assign_fulfillment_context',
  simulateWhatIfChallenge: 'simulate_what_if_challenge',
  growBreachCompensation: 'grow_breach_compensation',
  roleifyAndInvertDependency: 'roleify_and_invert_dependency',
  isolateDomainCalculator: 'isolate_domain_calculator',
} as const;

/** Mutations are not idempotent; neither adapter may advertise them as reads. */
export const MODEL_WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const MODEL_READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export interface ModelPatchRequest {
  rationale: string;
  patches: readonly JsonPatchOperation[];
}
export type ModelPatchResult =
  | { success: true; appliedCommands: readonly string[] }
  | { success: false; error: string };

/** The host owns authorization, static guards, atomic application and undo. */
export interface ModelToolPorts {
  loadDocument: () => Promise<DomainModelDocument>;
  applyModelPatch: (request: ModelPatchRequest) => Promise<ModelPatchResult>;
}
export interface ModelToolResult {
  text: string;
  value: unknown;
  isError?: boolean;
}
export interface ModelTool {
  name: (typeof MODEL_TOOL_NAMES)[keyof typeof MODEL_TOOL_NAMES];
  label: string;
  description: string;
  parameters: z.AnyZodObject;
  annotations: typeof MODEL_WRITE_ANNOTATIONS | typeof MODEL_READ_ANNOTATIONS;
  /** Validates before touching any host port, including in-process callers. */
  run: (input: unknown) => Promise<ModelToolResult>;
}

const define = <Schema extends z.AnyZodObject>(
  definition: Omit<ModelTool, 'run' | 'parameters' | 'annotations'> & {
    parameters: Schema;
    readOnly?: boolean;
    run: (input: z.infer<Schema>) => Promise<ModelToolResult>;
  },
): ModelTool => {
  const { readOnly, ...tool } = definition;
  return {
    ...tool,
    annotations: readOnly ? MODEL_READ_ANNOTATIONS : MODEL_WRITE_ANNOTATIONS,
    run: async (input) => definition.run(definition.parameters.parse(input)),
  };
};

/** A single registry of domain mutations; no Pi, MCP, Node or renderer imports. */
export const createModelTools = (
  ports: ModelToolPorts,
): readonly ModelTool[] => {
  const runOperator = async (
    rationale: string,
    build: (document: DomainModelDocument) => OperatorResult,
  ): Promise<ModelToolResult> => {
    let patch: ReturnType<typeof createModelPatch<OperatorResult>>;
    let document: DomainModelDocument;
    try {
      document = await ports.loadDocument();
      patch = createModelPatch(document, (draft) => {
        const result = build(draft);
        DomainModelDocumentSchema.parse(draft);
        return result;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知原因';
      return {
        text: `算子未执行：${message}`,
        value: { error: message },
        isError: true,
      };
    }
    if (patch.patches.length === 0) {
      return { text: '模型已经包含这些内容。', value: { createdIds: [] } };
    }
    const result = await ports.applyModelPatch({
      rationale,
      patches: [{ op: 'test', path: '', value: document }, ...patch.patches],
    });
    return result.success
      ? {
          text: ['已写入模型。', ...patch.result.createdIds].join(' '),
          value: { ...result, createdIds: patch.result.createdIds },
        }
      : { text: `补丁被拒绝：${result.error}`, value: result, isError: true };
  };

  return [
    define({
      name: MODEL_TOOL_NAMES.applyModelPatch,
      label: '应用模型补丁',
      description:
        '把 RFC 6902 JSON Patch 提交给桌面端内存模型，path/from 使用 JSON Pointer（如 /entities/0/label）；支持 add/remove/replace/move/copy/test，整批原子应用且用户可按 Cmd+Z 撤销。不要直接改 .evidence/fm 文件。',
      parameters: ModelPatchRequestSchema,
      run: async (input) => {
        const result = await ports.applyModelPatch(input);
        return result.success
          ? {
              value: result,
              text: `补丁已应用（${input.patches.map(({ op }) => op).join(', ')}）：${input.rationale}`,
            }
          : {
              value: result,
              text: `补丁被拒绝：${result.error}`,
              isError: true,
            };
      },
    }),
    define({
      name: MODEL_TOOL_NAMES.batchAddEvidence,
      label: '铺设凭证',
      description:
        '按邀请投标、投标、合同、履约批量写入已识别的凭证。不要求合同、角色或时标齐全，不生成样例事实。',
      parameters: BatchAddEvidenceInputSchema,
      run: (input) =>
        runOperator('铺设业务凭证', (draft) =>
          batchAddEvidenceMutator(draft, input),
        ),
    }),
    define({
      name: MODEL_TOOL_NAMES.splitEvidenceToPair,
      label: '从凭证形成履约对',
      description:
        '复用原凭证 ID 作为确认；只有业务确实有对应的履约主张时才新建或复用请求。填报项只绑定实际传递的字段，两端保持同一合同归属。',
      parameters: SplitEvidenceToPairInputSchema,
      run: (input) =>
        runOperator(`补齐履约请求：${input.evidenceRef}`, (draft) =>
          splitEvidenceToPairMutator(draft, input),
        ),
    }),
    define({
      name: MODEL_TOOL_NAMES.bindKeyDataSource,
      label: '绑定关键数据来源',
      description:
        '绑定一个凭证字段的来源：本身产出、申请输入、合同参数、领域属性、前序凭证或带真实绑定的 CEL 规则。不清楚时可撤销来源而保留字段。',
      parameters: BindKeyDataSourceInputSchema,
      run: (input) =>
        runOperator(`追溯 ${input.evidenceRef}#${input.attribute}`, (draft) =>
          bindKeyDataSourceMutator(draft, input),
        ),
    }),
    define({
      name: MODEL_TOOL_NAMES.assignFulfillmentContext,
      label: '为整组履约关联同一合同',
      description:
        '将请求、确认及同合同的补偿分支一并挂到已存在的合同上下文。不覆盖另一份合同的归属。',
      parameters: AssignFulfillmentContextInputSchema,
      run: (input) =>
        runOperator(`确定履约归属：${input.requestRef}`, (draft) =>
          assignFulfillmentContextMutator(draft, input),
        ),
    }),
    define({
      name: MODEL_TOOL_NAMES.simulateWhatIfChallenge,
      label: '查看履约的 What-If 问题',
      description:
        '只读检查指定履约请求、截止时标、确认和已经记录的补偿，给出待确认的超时、拒收与中断假设。不写入，不执行后端。',
      readOnly: true,
      parameters: z.object({ requestRef: DomainIdSchema }).strict(),
      run: async ({ requestRef }) => {
        const model = await ports.loadDocument();
        const pair = createDomainGraph(model).fulfillmentPair(requestRef);
        if (pair === undefined || pair.confirmations.length === 0) {
          const error = '没有找到该请求所对应的履约对。';
          return { text: error, value: { error }, isError: true };
        }
        const deadline = timeAttributeOf(pair.request, 'deadline');
        const value = {
          requestRef,
          label: pair.request.label,
          contextRef: pair.request.contextRef,
          deadline,
          confirmations: pair.confirmations.map(({ id, label }) => ({
            id,
            label,
          })),
          existingResponses: model.relationships.filter(
            (edge) =>
              edge.targetRef === requestRef &&
              (edge.flowKind === 'breach_compensation' ||
                edge.flowKind === 'escalation'),
          ),
          breachRules: pair.breachRules,
          hypotheses: [
            {
              kind: 'timeout',
              question: deadline
                ? '超过这一履约截止时间还未完成，如何判定、由谁处理？'
                : '什么情况才算逾期？哪条约定定义了截止时间？',
            },
            {
              kind: 'rejection',
              question: '拒绝或交付不合格时，凭什么判定，由谁处置？',
            },
            {
              kind: 'interruption',
              question:
                '义务中途无法继续时，有补偿、人工处理，还是无需另行处置？',
            },
          ],
        };
        return { text: JSON.stringify(value), value };
      },
    }),
    define({
      name: MODEL_TOOL_NAMES.growBreachCompensation,
      label: '生长违约补偿分支',
      description:
        '仅将已确认的违约触发条件与补偿动作写成同合同的独立履约对。假设不写入；没有可执行规则时不要补造 CEL。',
      parameters: GrowBreachCompensationInputSchema,
      run: (input) =>
        runOperator(`违约补偿：${input.condition}`, (draft) =>
          growBreachCompensationMutator(draft, input),
        ),
    }),
    define({
      name: MODEL_TOOL_NAMES.roleifyAndInvertDependency,
      label: '反转依赖并隔离变化点',
      description:
        '把核心合同依赖的履约确认抽象为能力角色，并新增独立的支撑合同上下文，让外部履约确认扮演该角色。用于引入支付渠道、物流或其它第三方能力时隔离变化点。',
      parameters: RoleInversionIntentSchema,
      run: (intent) =>
        runOperator(
          `反转依赖：${intent.socket.label} 交由 ${intent.supporting.contract.label} 履约`,
          (document) => roleifyAndInvertDependencyMutator(document, intent),
        ),
    }),
    define({
      name: MODEL_TOOL_NAMES.isolateDomainCalculator,
      label: '抽出领域计算器',
      description:
        '把合同里「按比例算、按阶梯算、按条件判定」的部分抽成领域上下文里的计算器或检查器，并同时写入读取它的派生规则。计价、折扣、等级、有效期、资格校验都走这条路径，不要把它们留成合同参数或前端入参。',
      parameters: DomainCalculatorIntentSchema,
      run: (intent) =>
        runOperator(`抽出领域计算：${intent.calculator.label}`, (document) =>
          isolateDomainCalculatorMutator(document, intent),
        ),
    }),
  ];
};
