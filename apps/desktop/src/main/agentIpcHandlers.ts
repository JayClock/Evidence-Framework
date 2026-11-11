import { randomUUID } from 'node:crypto';

import { ipcMain, type WebContents } from 'electron';

import type {
  ModelPatchRequest,
  ModelPatchResult,
  SensorReport,
} from '@evidence-poc/evidence-modeling-orchestrator';

import {
  EVIDENCE_AGENT_IPC_CHANNELS,
  type AgentActionResult,
  type AgentPromptInput,
  type AgentSteerInput,
  type AgentSteerOutcome,
  type ApplyPatchResponse,
  type CanvasContextRegistration,
  type SensorTriggerInput,
} from '../shared/agentIpc';

import { createAgentRuntime, type AgentRuntime } from './agentRuntime';
import { readInterviewTrace } from './traceReader';

export const PATCH_TIMEOUT_MS = 15_000;

export interface AgentIpcOptions {
  /** Test injection: production builds the default runtime. */
  createRuntime?: typeof createAgentRuntime;
  patchTimeoutMs?: number;
  /**
   * Transcript the runtime should resume.
   *
   * A branch owns its own lineage, so the session file is resolved per project
   * root when the runtime is first needed instead of being baked in at startup.
   */
  resolveSessionFile?: (rootPath: string) => Promise<string | null>;
  /** Observes every verdict so the active branch can remember its own. */
  onReport?: (rootPath: string, report: SensorReport) => void;
}

interface PendingPatch {
  resolve: (result: ModelPatchResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '未知错误。';

/**
 * Owns one runtime per project root and routes IPC to it.
 *
 * Patch application is a round trip: the main process asks the renderer to
 * dispatch the commands, because only the renderer holds the live
 * `ModelSession` that keeps undo working.
 */
export const registerAgentIpc = ({
  createRuntime = createAgentRuntime,
  patchTimeoutMs = PATCH_TIMEOUT_MS,
  resolveSessionFile,
  onReport,
}: AgentIpcOptions = {}): {
  dispose: () => void;
  /** Drops the runtime so the next prompt starts in the new branch's lineage. */
  disposeRuntime: (rootPath: string) => void;
} => {
  const runtimes = new Map<string, AgentRuntime>();
  const starting = new Map<string, Promise<AgentRuntime>>();
  const ownedBy = new Map<number, Set<string>>();
  const pending = new Map<string, PendingPatch>();

  const disposeRuntime = (rootPath: string): void => {
    runtimes.get(rootPath)?.dispose();
    runtimes.delete(rootPath);
    starting.delete(rootPath);
  };

  const runtimeFor = async (
    sender: WebContents,
    rootPath: string,
  ): Promise<AgentRuntime> => {
    const existing = runtimes.get(rootPath);

    if (existing !== undefined) {
      return existing;
    }

    const inFlight = starting.get(rootPath);

    if (inFlight !== undefined) {
      return inFlight;
    }

    const created = createRuntimeFor(sender, rootPath);

    starting.set(rootPath, created);

    try {
      return await created;
    } finally {
      starting.delete(rootPath);
    }
  };

  const createRuntimeFor = async (
    sender: WebContents,
    rootPath: string,
  ): Promise<AgentRuntime> => {
    const sessionFile =
      resolveSessionFile === undefined
        ? null
        : await resolveSessionFile(rootPath).catch(() => null);

    const ownsPatch = (patch: ModelPatchRequest): Promise<ModelPatchResult> =>
      new Promise((resolve) => {
        if (sender.isDestroyed()) {
          resolve({ success: false, error: '编辑器窗口已关闭。' });
          return;
        }

        const requestId = randomUUID();
        const timer = setTimeout(() => {
          pending.delete(requestId);
          resolve({
            success: false,
            error: '画布没有在时限内应用补丁，请重试或手动编辑。',
          });
        }, patchTimeoutMs);

        pending.set(requestId, { resolve, timer });
        sender.send(EVIDENCE_AGENT_IPC_CHANNELS.applyPatch, {
          requestId,
          patch,
        });
      });

    const runtime = createRuntime({
      rootPath,
      ...(sessionFile === null ? {} : { sessionFile }),
      transport: {
        publishEvent: (event) => {
          if (!sender.isDestroyed()) {
            sender.send(EVIDENCE_AGENT_IPC_CHANNELS.events, {
              rootPath,
              event,
            });
          }
        },
        publishReport: (report) => {
          onReport?.(rootPath, report);

          if (!sender.isDestroyed()) {
            sender.send(EVIDENCE_AGENT_IPC_CHANNELS.report, {
              rootPath,
              report,
            });
          }
        },
        requestPatch: ownsPatch,
      },
    });

    runtimes.set(rootPath, runtime);
    const owned = ownedBy.get(sender.id) ?? new Set<string>();

    owned.add(rootPath);
    ownedBy.set(sender.id, owned);
    sender.once('destroyed', () => {
      runtime.dispose();
      runtimes.delete(rootPath);
      ownedBy.delete(sender.id);
    });

    return runtime;
  };

  ipcMain.handle(
    EVIDENCE_AGENT_IPC_CHANNELS.prompt,
    async (event, input: AgentPromptInput): Promise<AgentActionResult> => {
      try {
        await (await runtimeFor(event.sender, input.rootPath)).prompt(input.text);

        return { success: true };
      } catch (error) {
        return { success: false, error: toMessage(error) };
      }
    },
  );

  ipcMain.handle(
    EVIDENCE_AGENT_IPC_CHANNELS.steer,
    async (event, input: AgentSteerInput): Promise<AgentSteerOutcome> => {
      try {
        return {
          success: true,
          disposition: await (
            await runtimeFor(event.sender, input.rootPath)
          ).steer(input.text),
        };
      } catch (error) {
        return { success: false, error: toMessage(error) };
      }
    },
  );

  ipcMain.handle(
    EVIDENCE_AGENT_IPC_CHANNELS.abort,
    async (event, input: { rootPath: string }): Promise<AgentActionResult> => {
      try {
        await runtimes.get(input.rootPath)?.abort();

        return { success: true };
      } catch (error) {
        return { success: false, error: toMessage(error) };
      }
    },
  );

  ipcMain.handle(
    EVIDENCE_AGENT_IPC_CHANNELS.triggerSensors,
    async (event, input: SensorTriggerInput): Promise<SensorReport> => {
      const outcome = await (
        await runtimeFor(event.sender, input.rootPath)
      ).runSensors(input.scopeRefs);

      return outcome.report;
    },
  );

  ipcMain.handle(
    EVIDENCE_AGENT_IPC_CHANNELS.latestReport,
    async (_event, input: { rootPath: string }): Promise<SensorReport | null> =>
      runtimes.get(input.rootPath)?.latestReport() ?? null,
  );

  ipcMain.handle(
    EVIDENCE_AGENT_IPC_CHANNELS.modelChanged,
    async (event, input: { rootPath: string }): Promise<void> => {
      (await runtimeFor(event.sender, input.rootPath)).notifyModelChanged();
    },
  );

  ipcMain.handle(
    EVIDENCE_AGENT_IPC_CHANNELS.interviewTrace,
    async (_event, input: { rootPath: string }) =>
      readInterviewTrace(input.rootPath),
  );

  ipcMain.handle(
    EVIDENCE_AGENT_IPC_CHANNELS.canvasContext,
    async (event, input: CanvasContextRegistration): Promise<void> => {
      (await runtimeFor(event.sender, input.rootPath)).setCanvasContext(
        input.context,
      );
    },
  );

  ipcMain.on(
    EVIDENCE_AGENT_IPC_CHANNELS.applyPatchResult,
    (_event, response: ApplyPatchResponse) => {
      const entry = pending.get(response.requestId);

      if (entry === undefined) {
        return;
      }

      clearTimeout(entry.timer);
      pending.delete(response.requestId);
      entry.resolve(response.result);
    },
  );

  return {
    disposeRuntime,
    dispose: () => {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
      }

      pending.clear();

      for (const runtime of runtimes.values()) {
        runtime.dispose();
      }

      runtimes.clear();
      starting.clear();
      ownedBy.clear();
    },
  };
};
