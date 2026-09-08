import { type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { assertFmSubmission } from '../../../modeling/fm/submission.ts';
import { getExpectedArtifact } from '../../../phases.ts';
import { buildCurrentPrompt } from '../../../prompts.ts';
import {
  requireFinalizing,
  withModelingLock,
} from '../../../state/discovery/index.ts';
import { submitFmModel } from '../../../state/fm/index.ts';
import { FM_MODEL_ROOT, FM_STATUS_PATH } from '../../../state/fm/paths.ts';
import {
  appendHistory,
  loadConfig,
  loadState,
  saveState,
} from '../../../storage.ts';
import { applyPhaseProfile } from '../profile.ts';

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
        assertFmSubmission(params);
        const config = await loadConfig(ctx.cwd);
        state.modeling = await submitFmModel(params, {
          executor: pi,
          root: ctx.cwd,
          timeoutMs: config.commandTimeoutMs,
          signal,
          onProgress: (progress) => {
            onUpdate?.({
              content: [{ type: 'text', text: progress }],
              details: { path: FM_MODEL_ROOT },
            });
          },
        });
        const { files } = state.modeling;
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
