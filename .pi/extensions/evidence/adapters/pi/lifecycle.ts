import {
  isToolCallEventType,
  type ExtensionAPI,
} from '@earendil-works/pi-coding-agent';
import {
  buildCurrentPrompt,
  buildDiscoveryPolicy,
  buildPhaseGuard,
} from '../../prompts.ts';
import { withModelingLock } from '../../state/discovery/index.ts';
import {
  appendHistory,
  loadConfig,
  loadState,
  projectPath,
  relativeProjectPath,
  saveState,
} from '../../storage.ts';
import {
  ownsExecution,
  recoverInterruptedExecution,
} from './execution-owner.ts';
import { applyPhaseProfile } from './profile.ts';
import {
  isAllowedReadOnlyShell,
  isProtectedPath,
  PROTECTED_PATHS,
} from './protection.ts';
import {
  clearQueuedDiscoveryPrompt,
  DISCOVERY_CONTEXT_TYPE,
  projectDiscoveryMessages,
  takeDiscoveryStamp,
} from './session-context.ts';
import { registerDiscoveryTools } from './tools/discovery.ts';
import { clearStatusDisplay, subjectLabel } from './ui/status.ts';

type DiscoveryController = ReturnType<typeof registerDiscoveryTools>;

export function registerLifecycle(
  pi: ExtensionAPI,
  discovery: DiscoveryController,
): void {
  pi.on('session_start', async (event, ctx) => {
    clearQueuedDiscoveryPrompt(pi);
    clearStatusDisplay(ctx);
    await withModelingLock(ctx.cwd, async () => {
      const state = await loadState(ctx.cwd);
      if (!state) return;
      await recoverInterruptedExecution(
        state,
        ctx,
        `session_start:${event.reason}`,
      );
      if (state.status === 'running' && !state.execution && !state.paused) {
        ctx.ui.notify(
          '旧任务执行归属未知，未自动重置。确认其他执行者已停止后，运行 /evidence-run 恢复。',
          'warning',
        );
      }
      await applyPhaseProfile(pi, ctx, state, await loadConfig(ctx.cwd));
    });
  });

  pi.on('before_agent_start', async (event, ctx) => {
    const state = await loadState(ctx.cwd);
    if (!state || state.paused) return;
    const guard = buildPhaseGuard(state);
    if (!guard) return;
    if (state.phase === 'modeling' && state.discovery.stage === 'discovering') {
      const stamp = takeDiscoveryStamp(pi, state, event.prompt);
      const content = stamp.promptDigest
        ? '本轮发现上下文已载于相邻任务消息；旧建模轮次以已保存发现记录及本轮有界上下文承接，原始会话仍留存。'
        : await buildCurrentPrompt(ctx.cwd, state, await loadConfig(ctx.cwd));
      return {
        systemPrompt:
          event.systemPrompt + (await buildDiscoveryPolicy(ctx.cwd)) + guard,
        message: {
          customType: DISCOVERY_CONTEXT_TYPE,
          content,
          display: false,
          details: stamp,
        },
      };
    }
    return { systemPrompt: event.systemPrompt + guard };
  });

  pi.on('context', async (event, ctx) => {
    const state = await loadState(ctx.cwd);
    if (!state) return;
    // Non-discovery messages are untouched, including later formal phases.
    // Do not revive the old discovery transcript when the phase changes.
    return { messages: projectDiscoveryMessages(event.messages, state.runId) };
  });

  pi.on('agent_settled', async (_event, ctx) => {
    await withModelingLock(ctx.cwd, async () => {
      const state = await loadState(ctx.cwd);
      if (!state || state.paused || !ctx.isIdle()) return;
      if (state.status === 'running' && ownsExecution(state, ctx)) {
        state.status = 'ready';
        const discovering =
          state.phase === 'modeling' && state.discovery.stage === 'discovering';
        state.lastError = discovering
          ? null
          : 'Agent 已结束，但没有调用当前阶段要求的 evidence_* 提交工具。';
        appendHistory(
          state,
          discovering ? 'discovery_paused' : 'agent_stopped_without_submission',
          subjectLabel(state),
        );
        await saveState(ctx.cwd, state);
        ctx.ui.notify(
          discovering
            ? '发现进度已保留，可运行 /evidence-run 继续。'
            : `${state.lastError} 运行 /evidence-run 重试。`,
          discovering ? 'info' : 'warning',
        );
      }
    });
    // The answer UI may start work; do not hold the lifecycle lock across it.
    await discovery.offerQuestion(ctx);
  });

  pi.on('tool_call', async (event, ctx) => {
    const state = await loadState(ctx.cwd);
    if (!state || state.paused || state.phase === 'complete') return;

    if (
      isToolCallEventType('edit', event) ||
      isToolCallEventType('write', event)
    ) {
      let path: string;
      try {
        path = relativeProjectPath(ctx.cwd, event.input.path);
      } catch {
        return {
          block: true,
          reason: `Evidence blocks paths outside the project root: ${event.input.path}`,
        };
      }
      if (isProtectedPath(path)) {
        return {
          block: true,
          reason: `Evidence protects workflow control path: ${path}`,
        };
      }
      if (state.phase !== 'coding') {
        return {
          block: true,
          reason: `Direct ${event.toolName} is disabled in ${state.phase}; use evidence_submit_artifact.`,
        };
      }
    }

    if (isToolCallEventType('bash', event)) {
      const command = event.input.command;
      const referencesProtectedPath = PROTECTED_PATHS.some((value) => {
        const relativePath = value.replace(/\/$/, '');
        return (
          command.includes(relativePath) ||
          command.includes(projectPath(ctx.cwd, relativePath))
        );
      });
      if (referencesProtectedPath) {
        return {
          block: true,
          reason:
            'Evidence blocks shell access to workflow state, gates, reports, and extension files.',
        };
      }
      if (
        /\bgit\s+(?:add|commit|reset|checkout|restore|clean|switch|merge|rebase|cherry-pick|stash)\b/i.test(
          command,
        )
      ) {
        return {
          block: true,
          reason:
            'Git mutations are reserved for the optional extension-owned local checkpoint.',
        };
      }
      if (
        state.phase !== 'coding' &&
        !isAllowedReadOnlyShell(command, state.phase === 'review')
      ) {
        return {
          block: true,
          reason: `Only allowlisted inspection${state.phase === 'review' ? ' and quality' : ''} commands are enabled in read-only ${state.phase}.`,
        };
      }
    }
    return undefined;
  });
}
