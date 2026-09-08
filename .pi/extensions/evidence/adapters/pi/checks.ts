import {
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import {
  runCodingChecks,
  runDocumentChecks,
  runModelingChecks,
  runReviewChecks,
} from '../../checks.ts';
import { createGate, recordGateDecision, refreshGate } from '../../gates.ts';
import { verifyCodingChanges } from '../../git.ts';
import {
  appendHistory,
  pathExists,
  projectPath,
  saveState,
} from '../../storage.ts';
import {
  loadStoryRecord,
  requireCompleteStory,
  saveStoryRecord,
} from '../../testing-evidence.ts';
import type {
  CheckReport,
  EvidenceConfig,
  EvidenceState,
} from '../../types.ts';
import { advanceAfterApproval, currentCodingStory } from '../../workflow.ts';
import { applyPhaseProfile } from './profile.ts';
import { isRuntimeGeneratedPath } from './protection.ts';

export async function persistPassedGate(
  root: string,
  state: EvidenceState,
  config: EvidenceConfig,
  report: CheckReport,
  reportPath: string,
): Promise<string> {
  if (state.phase === 'complete') return '流程已完成';
  const gate = await createGate(root, state, report, reportPath);
  const gateMode = config.gates[state.phase];
  const requiresReview =
    gateMode === 'review' || (gateMode === 'review_if' && report.warnings > 0);

  if (requiresReview) {
    state.pendingGate = gate;
    state.status = 'waiting_review';
    appendHistory(state, 'gate_created', gate.id);
    await saveState(root, state);
    return `质量检查通过，等待人工审核：${gate.path}`;
  }

  await recordGateDecision(
    root,
    gate,
    'approved',
    `Gate 模式为 ${gateMode}，本地自动通过。`,
  );
  state.pendingGate = gate;
  const transition = advanceAfterApproval(state);
  await saveState(root, state);
  return `质量检查通过并自动推进到 ${transition.nextPhase}。运行 /evidence-run 继续。`;
}

export async function markFailedCheck(
  root: string,
  state: EvidenceState,
  config: EvidenceConfig,
  report: CheckReport,
  reportPath: string,
): Promise<void> {
  if (state.pendingGate) {
    await recordGateDecision(
      root,
      state.pendingGate,
      'cancelled',
      '重新检查未通过，原 Gate 失效',
    );
    state.pendingGate = null;
  }
  state.lastReport = reportPath;
  state.round += 1;
  state.currentArtifactIndex = 0;
  state.feedback = `质量检查未通过。请读取 ${reportPath}，修复所有失败项。`;
  state.lastError = report.items
    .flatMap((item) => (item.status === 'fail' ? [item.details] : []))
    .join('；');
  if (state.round >= config.maxRounds) {
    state.status = 'blocked';
    appendHistory(state, 'max_rounds_reached', state.lastError);
  } else {
    state.status = 'ready';
    appendHistory(state, 'quality_check_failed', reportPath);
  }
  await saveState(root, state);
}

export async function finishPhaseSubmission(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: EvidenceState,
  config: EvidenceConfig,
  checked: Awaited<ReturnType<typeof runDocumentChecks>>,
): Promise<string> {
  state.lastReport = checked.markdownPath;
  let message: string;
  if (!checked.report.passed) {
    await markFailedCheck(
      ctx.cwd,
      state,
      config,
      checked.report,
      checked.markdownPath,
    );
    message = `阶段检查未通过，请查看 ${checked.markdownPath}。`;
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

  return message;
}

export async function runCurrentCheck(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  state: EvidenceState,
  config: EvidenceConfig,
): Promise<void> {
  if (state.phase === 'complete') return;
  if (state.phase === 'coding') {
    const storyId = currentCodingStory(state);
    if (!storyId) throw new Error('没有当前用户故事');
    const summaryPath = `artifacts/05-coding/${storyId}.md`;
    if (
      state.coding.changedFiles.length === 0 ||
      !(await pathExists(projectPath(ctx.cwd, summaryPath)))
    ) {
      throw new Error(
        '当前故事还没有 TDD 完成记录，请通过 /evidence-run 完成后再重新检查。',
      );
    }
    const result = await runCodingChecks({
      verifyChanges: async () => {
        if (!state.coding.baseline) throw new Error('Coding 基线缺失');
        await verifyCodingChanges(
          pi,
          ctx.cwd,
          state.coding.baseline,
          state.coding.changedFiles,
          isRuntimeGeneratedPath,
        );
      },
      pi,
      root: ctx.cwd,
      state,
      config,
      storyId,
      timeoutMs: config.commandTimeoutMs,
    });
    ctx.ui.setStatus('evidence-check', undefined);
    state.lastReport = result.markdownPath;
    if (!result.report.passed) {
      await markFailedCheck(
        ctx.cwd,
        state,
        config,
        result.report,
        result.markdownPath,
      );
      return;
    }
    const record = await loadStoryRecord(ctx.cwd, state, storyId);
    const story = await requireCompleteStory(ctx.cwd, state, storyId);
    await saveStoryRecord(ctx.cwd, state, story, {
      ...record,
      reportPath: result.markdownPath,
      passed: true,
    });
    if (state.pendingGate) {
      state.pendingGate = await refreshGate(
        ctx.cwd,
        state,
        result.report,
        result.markdownPath,
      );
      state.status = 'waiting_review';
      await saveState(ctx.cwd, state);
      return;
    }
    await persistPassedGate(
      ctx.cwd,
      state,
      config,
      result.report,
      result.markdownPath,
    );
    if (state.status === 'ready' || state.status === 'complete') {
      await applyPhaseProfile(pi, ctx, state, config);
    }
    return;
  }

  let result: Awaited<ReturnType<typeof runDocumentChecks>>;
  if (state.phase === 'review') {
    result = await runReviewChecks({
      pi,
      root: ctx.cwd,
      state,
      config,
      timeoutMs: config.commandTimeoutMs,
    });
  } else if (state.phase === 'modeling') {
    result = await runModelingChecks({
      pi,
      root: ctx.cwd,
      state,
      timeoutMs: config.commandTimeoutMs,
    });
  } else {
    result = await runDocumentChecks(ctx.cwd, state);
  }
  ctx.ui.setStatus('evidence-check', undefined);
  state.lastReport = result.markdownPath;
  if (!result.report.passed) {
    await markFailedCheck(
      ctx.cwd,
      state,
      config,
      result.report,
      result.markdownPath,
    );
    return;
  }
  if (state.pendingGate) {
    state.pendingGate = await refreshGate(
      ctx.cwd,
      state,
      result.report,
      result.markdownPath,
    );
    state.status = 'waiting_review';
    await saveState(ctx.cwd, state);
    return;
  }
  await persistPassedGate(
    ctx.cwd,
    state,
    config,
    result.report,
    result.markdownPath,
  );
  if (state.status === 'ready' || state.status === 'complete') {
    await applyPhaseProfile(pi, ctx, state, config);
  }
}
