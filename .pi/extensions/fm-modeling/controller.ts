import { readdir } from 'node:fs/promises';

import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';

import { fmPaths } from './paths.js';
import { modelingPrompt } from './prompts.js';
import { StateStore, type ModelState } from './state.js';

async function nextRunId(root: string, now = new Date()): Promise<string> {
  const prefix = `FM-${now.getUTCFullYear()}-`;
  let names: string[] = [];
  try {
    names = await readdir(fmPaths(root).runs);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const highest = names.reduce((max, name) => {
    const match = name.match(new RegExp(`^${prefix}(\\d{3})$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, '0')}`;
}

function foreignNamespaceConflict(pi: ExtensionAPI): string | null {
  const conflictingTool = pi
    .getAllTools()
    .find(
      (tool) =>
        (tool.name === 'fm_model_submit' || tool.name === 'fm_model_ask') &&
        !tool.sourceInfo.path.includes('/fm-modeling/'),
    );
  if (conflictingTool) return `工具 ${conflictingTool.name} 已由其他扩展注册`;

  const conflictingCommand = pi
    .getCommands()
    .find(
      (command) =>
        command.name.startsWith('evidence-model:') ||
        (command.name === 'evidence-model' && !command.sourceInfo.path.includes('/fm-modeling/')),
    );
  return conflictingCommand ? `命令 /${conflictingCommand.name} 存在命名空间冲突` : null;
}

export class ModelingController {
  constructor(
    private readonly pi: ExtensionAPI,
    private readonly store: StateStore,
  ) {}

  async handle(args: string, ctx: ExtensionCommandContext): Promise<void> {
    const text = args.trim();
    if (!text) {
      await this.showCurrent(ctx);
      return;
    }
    if (text === 'stop') {
      ctx.ui.notify('停止流程将在问答功能启用后可用。', 'warning');
      return;
    }
    await ctx.waitForIdle();
    const conflict = foreignNamespaceConflict(this.pi);
    if (conflict) {
      ctx.ui.notify(`无法启动 FM Modeling：${conflict}`, 'error');
      return;
    }
    const existing = await this.store.loadState();
    if (existing && !existing.stoppedAt) {
      ctx.ui.notify(`已有活动 Run ${existing.runId}；请继续或先停止，未覆盖现有输入。`, 'warning');
      return;
    }
    const state = await this.store.createRun(await nextRunId(ctx.cwd), args);
    const execution = {
      id: `EXEC-${state.runId}-${state.revision}`,
      sessionId: ctx.sessionManager.getSessionId(),
      inputRevision: state.revision,
      startedAt: new Date().toISOString(),
    };
    const running: ModelState = { ...state, execution };
    await this.store.saveState(running);
    this.pi.setActiveTools([...new Set([...this.pi.getActiveTools(), 'read', 'fm_model_submit'])]);
    this.pi.sendUserMessage(modelingPrompt(ctx.cwd, running));
  }

  async showCurrent(ctx: ExtensionCommandContext): Promise<void> {
    const state = await this.store.loadState();
    if (!state) {
      ctx.ui.notify('用法：/evidence-model <需求描述>', 'info');
      return;
    }
    if (state.execution) {
      ctx.ui.notify(`Run ${state.runId} 正在处理 revision ${state.execution.inputRevision}，请等待。`, 'info');
      return;
    }
    if (state.modelRevision > 0) {
      ctx.ui.notify(
        `当前模型：${fmPaths(ctx.cwd).model}（modelRevision ${state.modelRevision}）`,
        'info',
      );
      return;
    }
    ctx.ui.notify(`Run ${state.runId} 当前没有有效 FM 模型。`, 'warning');
  }
}
