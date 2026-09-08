import { type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { rm } from 'node:fs/promises';
import { Type } from 'typebox';
import { requireFinalizing, withModelingLock } from '../../../discovery.ts';
import {
  FM_MODEL_ROOT,
  FM_STATUS_PATH,
  listFmModelFiles,
  replaceFmModel,
} from '../../../modeling.ts';
import { getExpectedArtifact } from '../../../phases.ts';
import { buildCurrentPrompt } from '../../../prompts.ts';
import {
  appendHistory,
  loadConfig,
  loadState,
  projectPath,
  saveState,
  writeTextAtomic,
} from '../../../storage.ts';
import { applyPhaseProfile } from '../profile.ts';

export function modelingStatusMarkdown(options: {
  applicable: boolean;
  rationale: string;
  machineValidated: boolean;
  simulationPassed: boolean | null;
  files: string[];
}): string {
  const simulation =
    options.simulationPassed === null
      ? '未运行（未提交验证场景）'
      : options.simulationPassed
        ? '通过'
        : '失败';
  return `# 统一 FM 模型状态

## 适用性

- 结论：${options.applicable ? '适用' : '不适用'}
- 理由：${options.rationale.trim()}

## 机器校验

- machineValidated：${options.machineValidated}
- 说明：${options.applicable ? '模型结构、引用、CEL 与属性追溯由扩展执行确定性校验；架构中的 DDD 映射是设计投影，不是第二份业务事实源。' : '当前范围无独立业务或领域语义，不需生成 FM 定义。'}

## 场景模拟

- simulationPassed：${options.simulationPassed ?? 'not-run'}
- 结果：${simulation}

## 业务确认

- modelStatus / stakeholderReview：${options.applicable ? '以 model.yaml 为准；默认 draft / pending，本状态页不复制或提升人工评审状态。' : '不适用，未生成模型。'}
- 说明：机器校验、单据模拟与 Modeling Gate 不能替代具名业务／领域专家确认；纯领域未执行实例或状态机模拟。

## 模型文件

${options.files.length > 0 ? options.files.map((path) => `- \`${path}\``).join('\n') : '- 无'}
`;
}

export function registerFmTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'evidence_submit_fm_model',
    label: 'Submit FM Model',
    description:
      'Submit a unified FM Schema v3 bundle for domain, channel, fulfillment or mixed scope. No contract is required for pure domain/channel models. Only simple glue without independent semantics may be not applicable. The extension validates, traces, simulates applicable evidence and derives patterns/compiled outputs.',
    promptSnippet: 'Validate and submit the current unified FM v3 model bundle',
    promptGuidelines: [
      'Use evidence_submit_fm_model only for the current fulfillment-model artifact (unified FM). Submit source YAML, discovery notes and validation scenarios; never generated files or 02-business-patterns.md.',
    ],
    parameters: Type.Object({
      applicable: Type.Boolean({
        description:
          'Whether the scope has independent domain, channel or fulfillment semantics; absence of contracts is not a reason to skip FM',
      }),
      rationale: Type.String({
        description:
          'Concrete applicability decision and remaining assumptions',
        minLength: 40,
      }),
      files: Type.Array(
        Type.Object({
          path: Type.String({
            description:
              'Path relative to the FM model root, such as model.yaml or entities/role--buyer.yaml',
            minLength: 1,
          }),
          content: Type.String({
            description: 'Complete UTF-8 YAML or Markdown file content',
            minLength: 1,
            maxLength: 500_000,
          }),
        }),
        { maxItems: 200 },
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      return withModelingLock(ctx.cwd, async () => {
        const state = await loadState(ctx.cwd);
        if (
          !state ||
          state.phase !== 'modeling' ||
          state.status !== 'running'
        ) {
          throw new Error('A running modeling FM task is required.');
        }
        const artifact = getExpectedArtifact(
          state.phase,
          state.currentArtifactIndex,
        );
        if (artifact?.kind !== 'fm-model') {
          throw new Error('当前工件不是统一 FM 模型。');
        }
        if (state.paused) throw new Error('Evidence 已暂停。');
        await requireFinalizing(ctx.cwd, state);
        if (!params.applicable && params.files.length > 0) {
          throw new Error('FM 不适用时不得提交模型文件。');
        }
        if (params.applicable && params.files.length === 0) {
          throw new Error('FM 适用时必须提交模型文件。');
        }

        const config = await loadConfig(ctx.cwd);
        let files: string[];
        let machineValidated = false;
        let simulationPassed: boolean | null = null;
        if (params.applicable) {
          const validation = await replaceFmModel({
            pi,
            root: ctx.cwd,
            files: params.files,
            timeoutMs: config.commandTimeoutMs,
            signal,
            onProgress: (progress) => {
              onUpdate?.({
                content: [{ type: 'text', text: progress }],
                details: { path: FM_MODEL_ROOT },
              });
            },
          });
          if (!validation.passed) {
            throw new Error(
              `统一 FM 模型校验失败：\n${validation.items
                .filter((item) => item.status === 'fail')
                .map((item) => `- ${item.name}: ${item.details}`)
                .join('\n')}`,
            );
          }
          files = validation.files;
          machineValidated = validation.machineValidated;
          simulationPassed = validation.simulationPassed;
        } else {
          await rm(projectPath(ctx.cwd, FM_MODEL_ROOT), {
            recursive: true,
            force: true,
          });
          files = [];
        }

        await writeTextAtomic(
          ctx.cwd,
          FM_STATUS_PATH,
          modelingStatusMarkdown({
            applicable: params.applicable,
            rationale: params.rationale,
            machineValidated,
            simulationPassed,
            files,
          }),
        );
        files = await listFmModelFiles(ctx.cwd);
        state.modeling = {
          applicable: params.applicable,
          rationale: params.rationale.trim(),
          files,
          machineValidated,
          simulationPassed,
        };
        state.currentArtifactIndex += 1;
        state.lastError = null;
        appendHistory(
          state,
          'fm_model_submitted',
          params.applicable ? `${files.length} files` : 'not applicable',
        );

        // FM is followed by software scope and acceptance, sharing one Modeling Gate.
        state.status = config.autoContinueArtifacts ? 'running' : 'ready';
        await saveState(ctx.cwd, state);
        await applyPhaseProfile(pi, ctx, state, config);

        if (config.autoContinueArtifacts)
          pi.sendUserMessage(await buildCurrentPrompt(ctx.cwd, state, config), {
            deliverAs: 'followUp',
          });
        return {
          content: [
            {
              type: 'text',
              text: 'FM 已提交；接下来从模型收敛软件范围、故事和验收标准，尚未创建 Gate。',
            },
          ],
          details: {
            applicable: params.applicable,
            files,
            path: FM_STATUS_PATH,
            next: getExpectedArtifact(state.phase, state.currentArtifactIndex)
              ?.output,
          },
          terminate: true,
        };
      });
    },
  });
}
