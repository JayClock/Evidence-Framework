import { type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import {
  runDocumentChecks,
  runModelingChecks,
  runReviewChecks,
} from '../../../checks.ts';
import { getExpectedArtifact, isDocumentPhase } from '../../../phases.ts';
import { buildCurrentPrompt } from '../../../prompts.ts';
import {
  requireFinalizing,
  withModelingLock,
} from '../../../state/discovery/index.ts';
import {
  appendHistory,
  loadConfig,
  loadState,
  saveState,
  writeTextAtomic,
} from '../../../storage.ts';
import { validateTestingArtifact } from '../../../test-plan.ts';
import {
  normalizeMarkdown,
  validateArtifactContent,
} from '../../../validation.ts';
import { finishPhaseSubmission } from '../checks.ts';
import { applyPhaseProfile } from '../profile.ts';

export function registerDocumentTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'evidence_submit_artifact',
    label: 'Submit Evidence Artifact',
    description:
      'Submit the complete Markdown for the single artifact currently expected by the local Evidence workflow. The extension validates and atomically writes the configured path.',
    promptSnippet: 'Validate and submit the current Evidence document artifact',
    promptGuidelines: [
      'Use evidence_submit_artifact exactly once as the final action for a Evidence document task; do not write that artifact directly.',
    ],
    parameters: Type.Object({
      content: Type.String({
        description: 'Complete Markdown document without an outer code fence',
        minLength: 100,
      }),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      return withModelingLock(ctx.cwd, async () => {
        const state = await loadState(ctx.cwd);
        if (!state)
          throw new Error('Evidence is not initialized. Run /evidence-init.');
        if (state.status !== 'running')
          throw new Error(
            `Workflow status is ${state.status}, expected running.`,
          );
        if (!isDocumentPhase(state.phase))
          throw new Error(
            `evidence_submit_artifact is unavailable in phase ${state.phase}.`,
          );
        const config = await loadConfig(ctx.cwd);
        const artifact = getExpectedArtifact(
          state.phase,
          state.currentArtifactIndex,
        );
        if (!artifact)
          throw new Error(
            `No artifact expected at index ${state.currentArtifactIndex}.`,
          );
        if (artifact.kind === 'fm-model') {
          throw new Error(
            '统一 FM 模型必须通过 evidence_submit_fm_model 提交。',
          );
        }

        if (state.paused) throw new Error('Evidence 已暂停。');
        if (state.phase === 'modeling') await requireFinalizing(ctx.cwd, state);
        const content = normalizeMarkdown(params.content);
        const validation = validateArtifactContent(artifact, content);
        if (!validation.passed) {
          throw new Error(
            `工件校验失败：\n${validation.issues.map((issue) => `- ${issue.message}`).join('\n')}`,
          );
        }

        await validateTestingArtifact(ctx.cwd, artifact.key, content);
        await writeTextAtomic(ctx.cwd, artifact.output, content);
        state.currentArtifactIndex += 1;
        state.lastError = null;
        appendHistory(state, 'artifact_submitted', artifact.output);
        onUpdate?.({
          content: [{ type: 'text', text: `已写入 ${artifact.output}` }],
          details: { path: artifact.output },
        });

        const nextArtifact = getExpectedArtifact(
          state.phase,
          state.currentArtifactIndex,
        );
        if (nextArtifact) {
          await applyPhaseProfile(pi, ctx, state, config);
          if (config.autoContinueArtifacts) {
            state.status = 'running';
            await saveState(ctx.cwd, state);

            const nextPrompt = await buildCurrentPrompt(ctx.cwd, state, config);
            pi.sendUserMessage(nextPrompt, { deliverAs: 'followUp' });
            return {
              content: [
                {
                  type: 'text',
                  text: `已提交 ${artifact.output}；下一工件：${nextArtifact.output}`,
                },
              ],
              details: { path: artifact.output, next: nextArtifact.output },
              terminate: true,
            };
          }
          state.status = 'ready';
          await saveState(ctx.cwd, state);

          return {
            content: [
              {
                type: 'text',
                text: `已提交 ${artifact.output}。运行 /evidence-run 生成 ${nextArtifact.output}。`,
              },
            ],
            details: { path: artifact.output, next: nextArtifact.output },
            terminate: true,
          };
        }

        let checked: Awaited<ReturnType<typeof runDocumentChecks>>;
        if (state.phase === 'review') {
          checked = await runReviewChecks({
            pi,
            root: ctx.cwd,
            state,
            config,
            signal,
            timeoutMs: config.commandTimeoutMs,
            onProgress: (progress) => {
              onUpdate?.({
                content: [{ type: 'text', text: progress }],
                details: { path: artifact.output },
              });
            },
          });
        } else if (state.phase === 'modeling') {
          checked = await runModelingChecks({
            pi,
            root: ctx.cwd,
            state,
            signal,
            timeoutMs: config.commandTimeoutMs,
            onProgress: (progress) => {
              onUpdate?.({
                content: [{ type: 'text', text: progress }],
                details: { path: artifact.output },
              });
            },
          });
        } else {
          checked = await runDocumentChecks(ctx.cwd, state);
        }
        const message = await finishPhaseSubmission(
          pi,
          ctx,
          state,
          config,
          checked,
        );
        return {
          content: [{ type: 'text', text: message }],
          details: {
            path: artifact.output,
            report: checked.markdownPath,
            passed: checked.report.passed,
          },
          terminate: true,
        };
      });
    },
  });
}
