import { type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { discoveryCoverage } from '../../../modeling/fm/coverage.ts';
import { assertFmSubmission } from '../../../modeling/fm/submission.ts';
import { getExpectedArtifact } from '../../../phases.ts';
import {
  requireFinalizing,
  completeModelUpdate,
  loadDiscovery,
  withModelingLock,
} from '../../../state/discovery/index.ts';
import { submitFmModel } from '../../../state/fm/index.ts';
import { FM_MODEL_ROOT, FM_STATUS_PATH } from '../../../state/fm/paths.ts';
import { appendHistory, loadConfig, loadState } from '../../../storage.ts';
import { applyPhaseProfile } from '../profile.ts';

export function registerFmTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'evidence_submit_fm_model',
    label: 'Submit FM Model',
    description:
      'Submit a unified FM Schema v3 bundle for domain, channel, fulfillment or mixed scope. No contract is required for pure domain/channel models. Only simple glue without independent semantics may be not applicable. For an assessed manual update, include discovery/formalization.md with one discovery-coverage JSON block binding the current discovery revision and ALL includedCandidateRefs to existing model IDs; pending candidates remain gaps, not formal facts. The extension validates staged coverage, traces, simulates applicable evidence and derives patterns/compiled outputs before replacing FM. A successful manual update returns to discovery and waits for a separate human converge action, even with autoContinueArtifacts enabled.',
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
        const snapshot = await loadDiscovery(ctx.cwd, state);
        if (!snapshot.modelUpdateRequested || !snapshot.formalization)
          throw new Error('缺少人工授权的 Context 更新批次');
        if (
          params.applicable !==
          snapshot.formalization.assessment.applicability.applicable
        )
          throw new Error('FM 适用性必须与 Context 评估一致');
        const validatePublication = params.applicable
          ? discoveryCoverage(snapshot, params.files)
          : undefined;
        const config = await loadConfig(ctx.cwd);
        state.modeling = await submitFmModel(params, {
          executor: pi,
          root: ctx.cwd,
          timeoutMs: config.commandTimeoutMs,
          signal,
          validatePublication,
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

        await completeModelUpdate(ctx.cwd, state);
        await applyPhaseProfile(pi, ctx, state, config);
        ctx.ui.setEditorText('/evidence-answer');
        return {
          content: [
            {
              type: 'text',
              text: `模型已更新至发现版本 ${snapshot.revision}；本批次结束，未创建 Gate，也未自动进入需求收敛。纳入：${
                snapshot.formalization.contexts
                  .filter((c) => c.status !== 'pending')
                  .map((c) => `${c.contextRef}(${c.status})`)
                  .join('、') || '不适用'
              }；待完善：${snapshot.formalization.contexts.flatMap((c) => c.missingFactRefs).join('、') || '无'}。可继续问答（/evidence-discovery resume），或选择进入需求收敛（/evidence-discovery converge）。`,
            },
          ],
          details: {
            applicable: params.applicable,
            files,
            path: FM_STATUS_PATH,
            appliedRevision: snapshot.revision,
          },
          terminate: true,
        };
      });
    },
  });
}
