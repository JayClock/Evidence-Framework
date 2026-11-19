import {
  createModelTools,
  MODEL_TOOL_NAMES,
  type ModelPatchRequest,
  type ModelPatchResult,
} from '@evidence-poc/evidence-tools';
export type {
  ModelPatchRequest,
  ModelPatchResult,
} from '@evidence-poc/evidence-tools';
import type {
  ExtensionAPI,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import {
  DomainIdSchema,
  evidenceStageOf,
  isEvidenceEntity,
  isFulfillmentConfirmation,
  JsonPatchSchema,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';
import {
  applyModelPatches,
  annotateContractClauses,
  buildKeyDataLedger,
  createDomainGraph,
  domainNounOf,
  parseBlueprint,
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
const focusedParameters = z
  .object({ nodeRef: DomainIdSchema.optional() })
  .strict();
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
  ...MODEL_TOOL_NAMES,
  getFocusedNodeContext: 'get_focused_node_context',
  annotateContractClauses: 'annotate_contract_clauses',
  readServiceBlueprint: 'read_service_blueprint',
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
 * through the same transactional session a human edit uses.
 */
export const createEvidenceToolsExtension =
  (handlers: EvidenceToolsHandlers) =>
  (pi: ExtensionAPI): void => {
    for (const tool of createModelTools(handlers)) {
      registerZodTool(pi, {
        name: tool.name,
        label: tool.label,
        description: tool.description,
        parameters: tool.parameters,
        execute: async (_id, input) => {
          const result = await tool.run(input);
          return {
            ...textResult(result.value, result.text),
            ...(result.isError ? { isError: true } : {}),
          };
        },
      });
    }

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
      name: TOOL_NAMES.getFocusedNodeContext,
      label: '读取当前凭证与关键数据',
      description:
        '读取指定节点（或当前选中节点）、关键数据来源、关联请求与确认。没有焦点时返回现有凭证索引。',
      parameters: focusedParameters,
      execute: async (_id, { nodeRef }) => {
        const canvas = await handlers.getCanvasContext();
        const document = await handlers.loadDocument();
        const graph = createDomainGraph(document);
        const ref = nodeRef ?? canvas.selection.nodeId;
        const entity = ref === null ? undefined : graph.getEntity(ref);
        if (ref !== null && entity === undefined) {
          return {
            ...textResult(
              { ref, missing: true },
              `节点 ${ref} 已不存在，请重新选择。`,
            ),
            isError: true,
          };
        }
        const requestRefs =
          ref === null
            ? []
            : isFulfillmentConfirmation(entity)
              ? (graph
                  .fulfillmentConfirmations()
                  .find(({ entity }) => entity.id === ref)
                  ?.incomingRequests.map(({ id }) => id) ?? [])
              : graph.fulfillmentPair(ref)
                ? [ref]
                : [];
        const context = {
          selection: canvas.selection,
          entity: entity ?? null,
          keyData:
            ref === null
              ? []
              : buildKeyDataLedger(document).entries.filter(
                  (entry) => entry.entityRef === ref,
                ),
          pairs: requestRefs.map((id) => graph.fulfillmentPair(id)),
          evidences: document.entities
            .filter(isEvidenceEntity)
            .map((evidence) => ({
              id: evidence.id,
              label: evidence.label,
              stage: evidenceStageOf(evidence),
            })),
          contexts: document.entities
            .filter((entity) => entity.category === 'context')
            .map(({ id, label, kind }) => ({ id, label, kind })),
        };
        return textResult<unknown>(context, JSON.stringify(context));
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
  };

/** The tool definitions the extension registers, for list-based registration. */
export const evidenceToolNames: readonly string[] = Object.values(TOOL_NAMES);

export type EvidenceToolDefinition = ToolDefinition;
