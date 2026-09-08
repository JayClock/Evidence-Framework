import {
  type ExtensionAPI,
  type ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';
import { hashArtifacts, recordGateDecision } from '../../../gates.ts';
import { getPhaseDefinition, isDocumentPhase } from '../../../phases.ts';
import {
  loadConfig,
  loadState,
  readText,
  saveState,
  STATE_PATH,
  writeTextAtomic,
} from '../../../storage.ts';
import type { EvidenceConfig, EvidenceState } from '../../../types.ts';
import { normalizeMarkdown } from '../../../validation.ts';
import { advanceAfterApproval, requestRevision } from '../../../workflow.ts';
import { runCurrentCheck } from '../checks.ts';
import { applyPhaseProfile } from '../profile.ts';
import { loadRequiredState } from '../runtime.ts';

export async function requestChanges(
  ctx: ExtensionCommandContext,
  state: EvidenceState,
  config: EvidenceConfig,
  providedFeedback?: string,
): Promise<void> {
  let feedback = providedFeedback?.trim();
  if (!feedback && ctx.hasUI)
    feedback = (
      await ctx.ui.editor('填写修改意见', state.feedback ?? '')
    )?.trim();
  if (!feedback) {
    ctx.ui.notify('未提供修改意见，操作已取消。', 'info');
    return;
  }
  if (state.pendingGate)
    await recordGateDecision(
      ctx.cwd,
      state.pendingGate,
      'changes_requested',
      feedback,
    );
  if (state.status === 'blocked') state.round = 0;
  requestRevision(state, feedback, config.maxRounds);
  await saveState(ctx.cwd, state);

  ctx.ui.setEditorText('/evidence-run');
  ctx.ui.notify(
    state.status === 'blocked'
      ? '仍处于阻塞状态，请提高 maxRounds 或再次人工处理。'
      : '已记录反馈，运行 /evidence-run 开始修订。',
    'info',
  );
}

export async function createLocalCheckpoint(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  config: EvidenceConfig,
  state: EvidenceState,
  files: string[],
  message: string,
): Promise<void> {
  if (!config.gitCheckpointOnApproval) return;
  const git = await pi.exec('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: ctx.cwd,
    timeout: 5_000,
  });
  if (git.code !== 0) return;
  const existingIndex = await pi.exec('git', ['diff', '--cached', '--quiet'], {
    cwd: ctx.cwd,
    timeout: 10_000,
  });
  if (existingIndex.code === 1) {
    ctx.ui.notify(
      'Git index 已有人工暂存内容；为避免混入提交，本次跳过自动检查点。',
      'warning',
    );
    return;
  }
  if (existingIndex.code !== 0) {
    ctx.ui.notify(`无法检查 Git index：${existingIndex.stderr}`, 'warning');
    return;
  }

  const paths = [...new Set([STATE_PATH, ...files])];
  const unstage = async () =>
    pi.exec('git', ['reset', '--', ...paths], {
      cwd: ctx.cwd,
      timeout: 30_000,
    });
  const add = await pi.exec('git', ['add', '--', ...paths], {
    cwd: ctx.cwd,
    timeout: 30_000,
  });
  if (add.code !== 0) {
    await unstage();
    ctx.ui.notify(`本地检查点暂存失败：${add.stderr}`, 'warning');
    return;
  }
  const diff = await pi.exec('git', ['diff', '--cached', '--quiet'], {
    cwd: ctx.cwd,
    timeout: 10_000,
  });
  if (diff.code === 0) return;
  if (diff.code !== 1) {
    await unstage();
    ctx.ui.notify(`无法检查本次暂存，已撤销：${diff.stderr}`, 'warning');
    return;
  }
  const commit = await pi.exec('git', ['commit', '-m', message], {
    cwd: ctx.cwd,
    timeout: 60_000,
  });
  if (commit.code !== 0) {
    await unstage();
    ctx.ui.notify(
      `本地检查点提交失败，已撤销本次暂存：${commit.stderr}`,
      'warning',
    );
  } else {
    ctx.ui.notify(`已创建本地 Git 检查点：${message}`, 'info');
  }
}

export async function reviewCurrentGate(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): Promise<void> {
  await ctx.waitForIdle();
  const state = await loadRequiredState(ctx);
  if (!state) return;
  if (state.status !== 'waiting_review' || !state.pendingGate) {
    ctx.ui.notify('当前没有等待审核的 Gate。', 'info');
    return;
  }
  const config = await loadConfig(ctx.cwd);
  const gate = state.pendingGate;
  const currentDigest = await hashArtifacts(ctx.cwd, gate.artifactPaths);
  if (currentDigest !== gate.artifactDigest) {
    ctx.ui.notify(
      '工件在 Gate 创建后发生变化。请先运行 /evidence-check 重新检查。',
      'warning',
    );
    return;
  }

  const options = ['批准并继续', '要求修改', '重新运行质量检查'];
  if (isDocumentPhase(state.phase)) options.push('编辑文档工件');
  options.push('稍后决定');
  const decision = await ctx.ui.select(
    `审核 ${gate.subject}\nGate: ${gate.path}\nReport: ${gate.reportPath}`,
    options,
  );

  if (!decision || decision === '稍后决定') return;
  if (decision === '重新运行质量检查') {
    await runCurrentCheck(pi, ctx, state, config);
    const refreshed = await loadState(ctx.cwd);

    ctx.ui.notify(
      refreshed?.lastError ? '质量检查未通过。' : '质量检查完成。',
      refreshed?.lastError ? 'error' : 'info',
    );
    return;
  }
  if (decision === '要求修改') {
    await requestChanges(ctx, state, config);
    return;
  }
  if (decision === '编辑文档工件' && isDocumentPhase(state.phase)) {
    const definition = getPhaseDefinition(state.phase);
    const selected = await ctx.ui.select(
      '选择要编辑的工件',
      definition.artifacts
        .filter((item) => item.kind !== 'fm-model')
        .map((item) => item.output),
    );
    if (
      !selected ||
      !definition.artifacts.some(
        (item) => item.kind !== 'fm-model' && item.output === selected,
      )
    )
      return;
    const original = await readText(ctx.cwd, selected);
    const edited = await ctx.ui.editor(`编辑 ${selected}`, original);
    if (edited === undefined || edited === original) return;
    await writeTextAtomic(ctx.cwd, selected, normalizeMarkdown(edited));
    await runCurrentCheck(pi, ctx, state, config);
    ctx.ui.notify(
      '工件已保存并重新检查，请再次运行 /evidence-review。',
      'info',
    );
    return;
  }

  const latest = await loadState(ctx.cwd);
  if (
    latest?.runId !== state.runId ||
    latest.pendingGate?.id !== gate.id ||
    latest.discovery.digest !== state.discovery.digest ||
    (await hashArtifacts(ctx.cwd, gate.artifactPaths)) !== gate.artifactDigest
  ) {
    ctx.ui.notify('审核期间证据或状态已改变，请重新检查。', 'warning');
    return;
  }
  await recordGateDecision(ctx.cwd, gate, 'approved');
  const checkpointFiles = [
    ...gate.artifactPaths,
    gate.path,
    gate.reportPath,
    gate.reportPath.replace(/\.md$/, '.json'),
  ];
  const transition = advanceAfterApproval(state);
  await saveState(ctx.cwd, state);
  await applyPhaseProfile(pi, ctx, state, config);
  await createLocalCheckpoint(
    pi,
    ctx,
    config,
    state,
    checkpointFiles,
    `evidence(${gate.phase}): approve ${gate.subject}`,
  );

  if (state.phase === 'complete') {
    ctx.ui.notify('Evidence 全部阶段已完成。', 'info');
    return;
  }

  if (!config.newSessionPerPhase) {
    ctx.ui.setEditorText('/evidence-run');
    ctx.ui.notify(
      `已进入 ${transition.nextPhase}，运行 /evidence-run 继续。`,
      'info',
    );
    return;
  }

  const parentSession = ctx.sessionManager.getSessionFile();
  const result = await ctx.newSession({
    parentSession,
    withSession: async (replacementCtx) => {
      replacementCtx.ui.setEditorText('/evidence-run');
      replacementCtx.ui.notify(
        `已进入 ${transition.nextPhase}。提交 /evidence-run 开始。`,
        'info',
      );
    },
  });
  if (result.cancelled)
    ctx.ui.notify('新 Session 创建已取消；当前阶段状态已推进。', 'warning');
}
