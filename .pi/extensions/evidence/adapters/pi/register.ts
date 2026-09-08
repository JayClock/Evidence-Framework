import {
  type ExtensionAPI,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { withModelingLock } from '../../discovery.ts';
import { loadConfig, loadState } from '../../storage.ts';
import type { EvidenceState } from '../../types.ts';
import { registerCommands } from './commands.ts';
import { registerLifecycle } from './lifecycle.ts';
import { applyPhaseProfile } from './profile.ts';
import { startIdleWork } from './runtime.ts';
import { registerDiscoveryTools } from './tools/discovery.ts';
import { registerDocumentTool } from './tools/documents.ts';
import { registerFmTool } from './tools/fm.ts';
import { registerStoryTool } from './tools/story.ts';
import { registerTddTools } from './tools/tdd.ts';

export function registerEvidence(pi: ExtensionAPI): void {
  const refreshDiscovery = async (
    ctx: ExtensionContext,
    state: EvidenceState,
  ) => {
    await applyPhaseProfile(pi, ctx, state, await loadConfig(ctx.cwd));
  };

  const startDiscoveryWork = async (
    ctx: ExtensionContext,
    expected?: EvidenceState,
  ) => {
    if (!ctx.isIdle()) return;
    await withModelingLock(ctx.cwd, async () => {
      const current = await loadState(ctx.cwd);
      if (
        !current ||
        !ctx.isIdle() ||
        current.phase !== 'modeling' ||
        current.paused ||
        current.status !== 'ready' ||
        (expected &&
          (current.runId !== expected.runId ||
            current.discovery.revision !== expected.discovery.revision))
      )
        return;
      // Event contexts cannot waitForIdle; settled handlers recheck idle without holding up the agent loop.
      await startIdleWork(pi, ctx);
    });
  };

  const discovery = registerDiscoveryTools(
    pi,
    refreshDiscovery,
    startDiscoveryWork,
  );
  registerDocumentTool(pi);
  registerFmTool(pi);
  registerTddTools(pi);
  registerStoryTool(pi);
  registerCommands(pi, discovery);
  registerLifecycle(pi, discovery);
}
