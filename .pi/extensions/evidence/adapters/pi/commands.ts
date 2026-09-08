import { type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { basename } from 'node:path';
import { recordGateDecision } from '../../gates.ts';
import { getPhaseDefinition } from '../../phases.ts';
import { loadContractView } from '../../state/discovery/view.ts';
import {
  appendHistory,
  createInitialState,
  ensureWorkspace,
  loadConfig,
  loadState,
  readJson,
  readText,
  removeWorkflowState,
  REQUIREMENTS_PATH,
  saveState,
  writeTextAtomic,
} from '../../storage.ts';
import { moveBackOnePhase } from '../../workflow.ts';
import { runCurrentCheck } from './checks.ts';
import { applyPhaseProfile, NORMAL_TOOLS } from './profile.ts';
import {
  ensureCodingStories,
  loadRequiredState,
  startCurrentWork,
} from './runtime.ts';
import { registerDiscoveryTools } from './tools/discovery.ts';
import { requestChanges, reviewCurrentGate } from './ui/gates.ts';
import { statusMarkdown } from './ui/status.ts';

type DiscoveryController = ReturnType<typeof registerDiscoveryTools>;

export function registerCommands(
  pi: ExtensionAPI,
  discovery: DiscoveryController,
): void {
  pi.registerCommand('evidence-init', {
    description: '初始化本地 Evidence 工作流',
    handler: async (args, ctx) => {
      await ctx.waitForIdle();
      const existing = await loadState(ctx.cwd);
      if (existing && ctx.hasUI) {
        const confirmed = await ctx.ui.confirm(
          '重新初始化 Evidence？',
          '状态会重置，已有工件默认保留。使用 /evidence-reset 可删除工件。',
        );
        if (!confirmed) return;
      }

      const currentInput = await readText(ctx.cwd, REQUIREMENTS_PATH);
      const currentGoal = currentInput.replace(/^# 原始需求\s*/i, '').trim();
      const initialGoal = currentGoal.startsWith(
        '运行 Pi 后使用 `/evidence-init` 输入项目目标和原始需求',
      )
        ? ''
        : currentGoal;
      let goal = args.trim();
      if (!goal && ctx.hasUI) {
        goal =
          (
            await ctx.ui.editor('输入项目目标和原始需求', initialGoal)
          )?.trim() ?? '';
      }
      if (!goal) {
        ctx.ui.notify(
          '项目目标不能为空。也可以使用 /evidence-init <需求描述>。',
          'warning',
        );
        return;
      }

      await ensureWorkspace(ctx.cwd);
      const packageJson = await readJson<{ name?: string }>(
        ctx.cwd,
        'package.json',
      );
      const projectName = packageJson?.name ?? basename(ctx.cwd);
      await writeTextAtomic(
        ctx.cwd,
        REQUIREMENTS_PATH,
        `# 原始需求\n\n${goal}\n`,
      );
      const state = createInitialState(projectName, goal);
      await saveState(ctx.cwd, state);
      const config = await loadConfig(ctx.cwd);
      await applyPhaseProfile(pi, ctx, state, config);

      ctx.ui.notify(
        'Evidence 已初始化，直接开始问题定位与交互式建模。',
        'info',
      );
      await startCurrentWork(pi, ctx);
    },
  });

  pi.registerCommand('evidence-run', {
    description: '执行当前阶段的下一个工件或用户故事',
    handler: async (_args, ctx) => startCurrentWork(pi, ctx),
  });

  pi.registerCommand('evidence-status', {
    description: '显示 Evidence 当前状态',
    handler: async (_args, ctx) => {
      const state = await loadRequiredState(ctx);
      if (!state) return;
      pi.sendMessage({
        customType: 'evidence-status',
        content: statusMarkdown(
          state,
          await loadContractView(ctx.cwd, state, true),
        ),
        display: true,
      });
    },
  });

  pi.registerCommand('evidence-check', {
    description: '重新运行当前工件或代码的本地质量检查',
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      const state = await loadRequiredState(ctx);
      if (!state || state.phase === 'complete') return;
      if (
        state.phase === 'modeling' &&
        (state.discovery.stage !== 'finalizing' ||
          state.currentArtifactIndex <
            getPhaseDefinition('modeling').artifacts.length)
      ) {
        ctx.ui.notify(
          '请先完成发现与全部正式工件；草稿使用 evidence_check_model_draft，不以阶段重查跳过发现。',
          'warning',
        );
        return;
      }
      const config = await loadConfig(ctx.cwd);
      try {
        await ensureCodingStories(ctx.cwd, state);
        await runCurrentCheck(pi, ctx, state, config);
        const refreshed = await loadState(ctx.cwd);

        ctx.ui.notify(
          refreshed?.lastError ? '检查未通过，请查看报告。' : '检查通过。',
          refreshed?.lastError ? 'error' : 'info',
        );
      } catch (error) {
        ctx.ui.setStatus('evidence-check', undefined);
        ctx.ui.notify((error as Error).message, 'error');
      }
    },
  });

  pi.registerCommand('evidence-review', {
    description: '审核当前 Gate：批准、修改、编辑或重查',
    handler: async (_args, ctx) => reviewCurrentGate(pi, ctx),
  });

  pi.registerCommand('evidence-next', {
    description: '继续工作流；等待审核时打开 Gate，否则运行当前任务',
    handler: async (_args, ctx) => {
      const state = await loadRequiredState(ctx);
      if (!state) return;
      if (state.status === 'waiting_review') await reviewCurrentGate(pi, ctx);
      else if (state.status === 'waiting_answer')
        await discovery.collectAnswer(ctx);
      else await startCurrentWork(pi, ctx);
    },
  });

  pi.registerCommand('evidence-revise', {
    description: '记录人工修改意见并重新执行当前对象',
    handler: async (args, ctx) => {
      await ctx.waitForIdle();
      const state = await loadRequiredState(ctx);
      if (!state || state.phase === 'complete') return;
      const config = await loadConfig(ctx.cwd);
      await requestChanges(ctx, state, config, args);
    },
  });

  pi.registerCommand('evidence-back', {
    description: '回退到上一工程阶段，保留已有工件',
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      const state = await loadRequiredState(ctx);
      if (!state) return;
      const previous =
        state.phase === 'modeling'
          ? null
          : moveBackOnePhase(structuredClone(state));
      if (!previous) {
        ctx.ui.notify('已经位于第一个阶段，无法继续回退。', 'info');
        return;
      }
      const confirmed = await ctx.ui.confirm(
        '回退工程阶段？',
        `将从 ${state.phase} 回退到 ${previous}。已有工件不会删除。`,
      );
      if (!confirmed) return;
      if (state.pendingGate)
        await recordGateDecision(
          ctx.cwd,
          state.pendingGate,
          'cancelled',
          '人工回退阶段',
        );
      moveBackOnePhase(state);
      await saveState(ctx.cwd, state);
      await applyPhaseProfile(pi, ctx, state, await loadConfig(ctx.cwd));

      ctx.ui.setEditorText('/evidence-run');
      ctx.ui.notify(`已回退到 ${previous}。`, 'info');
    },
  });

  pi.registerCommand('evidence-pause', {
    description: '暂停 Evidence 约束并恢复 Pi 默认工具',
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      const state = await loadRequiredState(ctx);
      if (!state) return;
      state.paused = true;
      appendHistory(state, 'workflow_paused');
      await saveState(ctx.cwd, state);
      pi.setActiveTools(
        NORMAL_TOOLS.filter((name) =>
          pi.getAllTools().some((tool) => tool.name === name),
        ),
      );

      ctx.ui.notify(
        'Evidence 已暂停。运行 /evidence-resume 恢复阶段约束。',
        'info',
      );
    },
  });

  pi.registerCommand('evidence-resume', {
    description: '恢复 Evidence 阶段模型与工具约束',
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      const state = await loadRequiredState(ctx);
      if (!state) return;
      state.paused = false;
      appendHistory(state, 'workflow_resumed');
      await saveState(ctx.cwd, state);
      await applyPhaseProfile(pi, ctx, state, await loadConfig(ctx.cwd));

      ctx.ui.notify('Evidence 阶段约束已恢复。', 'info');
    },
  });

  pi.registerCommand('evidence-reset', {
    description: '重置 Evidence 状态，可选择删除生成工件',
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      const choice = await ctx.ui.select('重置 Evidence', [
        '仅重置状态，保留所有工件',
        '重置状态并删除生成的工件与报告',
        '取消',
      ]);
      if (!choice || choice === '取消') return;
      const removeArtifacts = choice.startsWith('重置状态并删除');
      const confirmed = await ctx.ui.confirm(
        '确认重置？',
        removeArtifacts
          ? '生成工件和报告将被删除，此操作不可撤销。'
          : '流程状态将被删除，已有工件保留。',
      );
      if (!confirmed) return;
      await removeWorkflowState(ctx.cwd, removeArtifacts);

      pi.setActiveTools(
        NORMAL_TOOLS.filter((name) =>
          pi.getAllTools().some((tool) => tool.name === name),
        ),
      );
      ctx.ui.notify('Evidence 已重置。运行 /evidence-init 重新开始。', 'info');
    },
  });
}
