import {
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { captureCodingBaseline } from '../../git.ts';
import { buildCurrentPrompt } from '../../prompts.ts';
import { withModelingLock } from '../../state/discovery/index.ts';
import {
  appendHistory,
  loadConfig,
  loadState,
  saveState,
} from '../../storage.ts';
import { assertTestingInputs } from '../../test-plan.ts';
import type { EvidenceState } from '../../types.ts';
import {
  createExecutionOwner,
  recoverInterruptedExecution,
} from './execution-owner.ts';
import { applyPhaseProfile } from './profile.ts';
import { sendWorkPrompt } from './session-context.ts';
import { subjectLabel } from './ui/status.ts';

export async function loadRequiredState(
  ctx: ExtensionContext,
): Promise<EvidenceState | null> {
  const state = await loadState(ctx.cwd);
  if (!state)
    ctx.ui.notify('Evidence 尚未初始化，请先运行 /evidence-init。', 'warning');
  return state;
}

export async function ensureCodingStories(
  root: string,
  state: EvidenceState,
): Promise<void> {
  if (state.phase !== 'coding') return;
  if (state.coding.planDigest !== null) {
    await assertTestingInputs(root, state);
    return;
  }
  throw new Error('测试计划尚未通过 Planning Gate，请回退计划阶段重新审核。');
}

export async function startCurrentWork(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): Promise<void> {
  await ctx.waitForIdle();
  const previous = await loadState(ctx.cwd);
  const legacy = previous?.status === 'running' && !previous.execution;
  if (
    legacy &&
    (!ctx.hasUI ||
      !(await ctx.ui.confirm(
        '恢复归属未知的旧任务？',
        '旧版任务未记录执行会话。请先确认其他窗口／进程已停止执行本项目，再确认恢复；否则请取消。',
      )))
  )
    return;
  await withModelingLock(ctx.cwd, async () => {
    const state = await loadState(ctx.cwd);
    if (legacy) {
      // The answer UI is outside the lock; never act on its stale snapshot.
      if (
        !ctx.isIdle() ||
        !state ||
        state.execution ||
        state.status !== 'running' ||
        state.runId !== previous.runId ||
        state.updatedAt !== previous.updatedAt
      )
        return;
      state.status = 'ready';
      state.lastError = null;
      appendHistory(
        state,
        'legacy_execution_recovered',
        `evidence-run; session=${ctx.sessionManager.getSessionId()}; human-confirmed`,
      );
      await saveState(ctx.cwd, state);
    } else if (state) {
      await recoverInterruptedExecution(state, ctx, 'evidence-run');
    }
    await startIdleWork(pi, ctx);
  });
}

export async function startIdleWork(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<void> {
  if (!ctx.isIdle()) return;
  const state = await loadRequiredState(ctx);
  if (!state) return;
  if (state.phase === 'complete' || state.status === 'complete') {
    ctx.ui.notify('Evidence 已完成。使用 /evidence-status 查看结果。', 'info');
    return;
  }
  if (state.status === 'waiting_answer') {
    ctx.ui.setEditorText('/evidence-answer');
    ctx.ui.notify(
      '当前等待业务回答，请运行 /evidence-answer（可跳过），或 /evidence-discovery finish 结束本轮并整理；不会重复生成工件。',
      'info',
    );
    return;
  }
  if (state.status === 'waiting_review') {
    ctx.ui.notify('当前阶段等待人工审核，请运行 /evidence-review。', 'warning');
    return;
  }
  if (state.status === 'blocked') {
    ctx.ui.notify(
      `当前被阻塞：${state.lastError ?? '需要人工修订'}。使用 /evidence-revise 提供反馈后继续。`,
      'error',
    );
    return;
  }
  if (state.status === 'running') {
    ctx.ui.notify('当前任务仍在执行。', 'warning');
    return;
  }

  const config = await loadConfig(ctx.cwd);
  state.paused = false;
  try {
    await ensureCodingStories(ctx.cwd, state);
    if (state.phase === 'coding' && state.coding.baseline === null) {
      state.coding.baseline = await captureCodingBaseline(pi, ctx.cwd);
      appendHistory(
        state,
        'coding_baseline_captured',
        state.coding.baseline.capturedAt,
      );
    }
    await applyPhaseProfile(pi, ctx, state, config);
    const prompt = await buildCurrentPrompt(ctx.cwd, state, config);
    state.status = 'running';
    state.execution = createExecutionOwner(ctx);
    state.lastError = null;
    appendHistory(
      state,
      'work_started',
      `${subjectLabel(state)}; execution=${JSON.stringify(state.execution)}`,
    );
    await saveState(ctx.cwd, state);

    sendWorkPrompt(pi, state, prompt);
  } catch (error) {
    state.status = 'blocked';
    state.lastError = (error as Error).message;
    appendHistory(state, 'work_start_failed', state.lastError);
    await saveState(ctx.cwd, state);

    ctx.ui.notify(state.lastError, 'error');
  }
}
