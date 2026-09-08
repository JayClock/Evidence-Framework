import { type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { runCodingChecks } from '../../../checks.ts';
import { hashArtifacts } from '../../../gates.ts';
import { verifyCodingChanges } from '../../../git.ts';
import {
  appendHistory,
  loadConfig,
  loadState,
  pathExists,
  projectPath,
  relativeProjectPath,
} from '../../../storage.ts';
import { isProductionSourceFile, isTestFile } from '../../../test-files.ts';
import { assertTestingInputs } from '../../../test-plan.ts';
import {
  requireCompleteStory,
  saveStoryRecord,
} from '../../../testing-evidence.ts';
import type { StoryRecord } from '../../../testing-schema.ts';
import { currentCodingStory } from '../../../workflow.ts';
import { markFailedCheck, persistPassedGate } from '../checks.ts';
import { applyPhaseProfile } from '../profile.ts';
import { isProtectedPath, isRuntimeGeneratedPath } from '../protection.ts';
import { withCodingLock } from './tdd.ts';

export function registerStoryTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'evidence_complete_story',
    label: 'Complete TDD Story',
    description:
      'Complete the story only after all planned tasks and TDD cycles are evidenced. Re-run every planned check and all quality commands before creating a gate.',
    promptSnippet: 'Verify and complete the current Evidence TDD story',
    promptGuidelines: [
      'Use evidence_complete_story as the final action after changing real code and completing Red, Green, and Refactor for the current story.',
    ],
    parameters: Type.Object({
      storyId: Type.String({
        description: 'Current story ID, for example US-001',
      }),
      summary: Type.String({
        description: 'Concise implementation and design summary',
        minLength: 40,
        maxLength: 2000,
      }),
      changedFiles: Type.Array(Type.String(), {
        description: 'All project-relative source and test files changed',
        minItems: 2,
      }),
      refactorSummary: Type.String({
        description: 'Refactoring performed while preserving behavior',
        minLength: 20,
        maxLength: 2000,
      }),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      return withCodingLock(ctx.cwd, async () => {
        const state = await loadState(ctx.cwd);
        if (!state)
          throw new Error('Evidence is not initialized. Run /evidence-init.');
        if (
          state.phase !== 'coding' ||
          state.status !== 'running' ||
          state.paused
        ) {
          throw new Error(
            `Expected running coding phase, got ${state.phase}/${state.status}.`,
          );
        }
        const storyId = currentCodingStory(state);
        if (!storyId || params.storyId !== storyId) {
          throw new Error(
            `Expected story ${storyId ?? 'none'}, received ${params.storyId}.`,
          );
        }
        const story = await requireCompleteStory(ctx.cwd, state, storyId);

        const changedFiles = [
          ...new Set(
            params.changedFiles.map((path) =>
              relativeProjectPath(ctx.cwd, path),
            ),
          ),
        ];
        for (const path of changedFiles) {
          const absolute = projectPath(ctx.cwd, path);
          if (!(await pathExists(absolute)))
            throw new Error(`Changed file does not exist: ${path}`);
          if (isProtectedPath(path)) {
            throw new Error(
              `Workflow control file cannot be submitted as a code change: ${path}`,
            );
          }
        }
        if (!changedFiles.some(isTestFile)) {
          throw new Error(
            'TDD completion must include at least one changed test file.',
          );
        }
        if (!changedFiles.some(isProductionSourceFile)) {
          throw new Error(
            'Story completion must include at least one changed production source file.',
          );
        }
        if (!state.coding.baseline)
          throw new Error('Coding 基线缺失，请重新运行 /evidence-run。');
        await verifyCodingChanges(
          pi,
          ctx.cwd,
          state.coding.baseline,
          changedFiles,
          isRuntimeGeneratedPath,
        );

        const config = await loadConfig(ctx.cwd);
        const sourceDigest = await hashArtifacts(ctx.cwd, changedFiles);
        const record: StoryRecord = {
          version: 1,
          runId: state.runId,
          storyId,
          planDigest: state.coding.planDigest!,
          cycles: state.coding.cycles,
          verifications: state.coding.verifications,
          revisionStart: state.coding.revisionStart,
          changedFiles,
          summary: params.summary,
          refactorSummary: params.refactorSummary,
          reportPath: 'pending',
          passed: false,
        };
        const checked = await runCodingChecks({
          record,
          pi,
          root: ctx.cwd,
          state,
          config,
          storyId,
          signal,
          timeoutMs: config.commandTimeoutMs,
          onProgress: (message) => {
            onUpdate?.({
              content: [{ type: 'text', text: message }],
              details: { storyId },
            });
          },
        });
        await verifyCodingChanges(
          pi,
          ctx.cwd,
          state.coding.baseline,
          changedFiles,
          isRuntimeGeneratedPath,
        );
        await assertTestingInputs(ctx.cwd, state);
        if (sourceDigest !== (await hashArtifacts(ctx.cwd, changedFiles)))
          throw new Error('质量检查期间源文件发生变化，请重新验证。');
        state.lastReport = checked.markdownPath;
        state.coding.changedFiles = changedFiles;
        await saveStoryRecord(ctx.cwd, state, story, {
          ...record,
          reportPath: checked.markdownPath,
          passed: checked.report.passed,
        });
        appendHistory(state, 'coding_story_submitted', storyId);

        let message: string;
        if (!checked.report.passed) {
          await markFailedCheck(
            ctx.cwd,
            state,
            config,
            checked.report,
            checked.markdownPath,
          );
          message = `最终质量命令未通过。读取 ${checked.markdownPath} 后修复，再运行 /evidence-run。`;
        } else {
          message = await persistPassedGate(
            ctx.cwd,
            state,
            config,
            checked.report,
            checked.markdownPath,
          );
          await applyPhaseProfile(pi, ctx, state, config);
        }

        return {
          content: [{ type: 'text', text: message }],
          details: {
            storyId,
            changedFiles,
            report: checked.markdownPath,
            passed: checked.report.passed,
          },
          terminate: true,
        };
      });
    },
  });
}
