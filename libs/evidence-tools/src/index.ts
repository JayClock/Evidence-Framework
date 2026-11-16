import { z } from 'zod';
import {
  BreachCompensationIntentSchema,
  DomainCalculatorIntentSchema,
  FulfillmentPairIntentSchema,
  ModelPatchRequestSchema,
  RoleInversionIntentSchema,
  type DomainModelDocument,
  type JsonPatchOperation,
} from '@evidence-poc/evidence-schema';
import {
  addBreachCompensationMutator,
  createModelPatch,
  introduceFulfillmentPairMutator,
  isolateDomainCalculatorMutator,
  roleifyAndInvertDependencyMutator,
  type OperatorResult,
} from '@evidence-poc/evidence-model-core';

export const MODEL_TOOL_NAMES = {
  applyModelPatch: 'apply_model_patch',
  introduceFulfillmentPair: 'introduce_fulfillment_pair',
  addBreachCompensation: 'add_breach_compensation',
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
  annotations: typeof MODEL_WRITE_ANNOTATIONS;
  /** Validates before touching any host port, including in-process callers. */
  run: (input: unknown) => Promise<ModelToolResult>;
}

const define = <Schema extends z.AnyZodObject>(
  definition: Omit<ModelTool, 'run' | 'parameters' | 'annotations'> & {
    parameters: Schema;
    run: (input: z.infer<Schema>) => Promise<ModelToolResult>;
  },
): ModelTool => ({
  ...definition,
  annotations: MODEL_WRITE_ANNOTATIONS,
  run: async (input) => definition.run(definition.parameters.parse(input)),
});

/** A single registry of domain mutations; no Pi, MCP, Node or renderer imports. */
export const createModelTools = (
  ports: ModelToolPorts,
): readonly ModelTool[] => {
  const runOperator = async (
    rationale: string,
    build: (document: DomainModelDocument) => OperatorResult,
  ): Promise<ModelToolResult> => {
    let patch: ReturnType<typeof createModelPatch<OperatorResult>>;
    try {
      patch = createModelPatch(await ports.loadDocument(), build);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知原因';
      return {
        text: `算子未执行：${message}`,
        value: { error: message },
        isError: true,
      };
    }
    const result = await ports.applyModelPatch({
      rationale,
      patches: patch.patches,
    });
    return result.success
      ? {
          text: `已写入：${patch.result.createdIds.join(', ')}。`,
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
      name: MODEL_TOOL_NAMES.introduceFulfillmentPair,
      label: '新增成对履约项',
      description:
        '在一个合同上下文里新增一组履约请求（时段）与履约确认（时刻），自动补齐业务时间、引用根合同并装配完成判断规则。有请求就必须有确认，不要分两次建。',
      parameters: FulfillmentPairIntentSchema,
      run: (intent) =>
        runOperator(
          `新增履约项：${intent.request.label} / ${intent.confirmation.label}`,
          (document) => introduceFulfillmentPairMutator(document, intent),
        ),
    }),
    define({
      name: MODEL_TOOL_NAMES.addBreachCompensation,
      label: '新增违约补偿分支',
      description:
        '为一个已有履约请求声明违约条件，并同时新增该违约触发的补偿履约对。违约不是回滚，而是在同一合同上下文中触发新的履约项。',
      parameters: BreachCompensationIntentSchema,
      run: (intent) =>
        runOperator(`违约补偿：${intent.condition}`, (document) =>
          addBreachCompensationMutator(document, intent),
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
