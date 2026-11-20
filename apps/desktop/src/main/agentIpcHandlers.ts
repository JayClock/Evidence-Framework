import { createHash } from 'node:crypto';
import path from 'node:path';
import { ipcMain, type WebContents } from 'electron';
import {
  EVIDENCE_AGENT_IPC_CHANNELS as channels,
  type AgentActionResult,
  type AgentPromptInput,
  type AgentPromptResult,
  type AgentSteerInput,
  type AgentSteerOutcome,
  type CanvasContextRegistration,
  type LiveModelInput,
  type PatchTransaction,
  type SensorTriggerInput,
} from '@evidence-poc/desktop-contracts/agentIpc';
import {
  createAgentRuntime,
  type AgentRuntime,
  type AgentRuntimeOptions,
} from './agentRuntime';

export interface AgentIpcOptions {
  createRuntime?: typeof createAgentRuntime;
  getModelOptions?: AgentRuntimeOptions['getModelOptions'];
  sessionsRoot?: string;
}

type Owner = {
  sender: WebContents;
  runtime: AgentRuntime;
  editorId?: string;
  detach: () => void;
};

const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '未知错误。';

/** A project's write stream belongs to the editor that published its live model. */
export const registerAgentIpc = ({
  createRuntime = createAgentRuntime,
  getModelOptions,
  sessionsRoot,
}: AgentIpcOptions = {}) => {
  const owners = new Map<string, Owner>();
  const canonicalRoot = (rootPath: string) => {
    if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath))
      throw new Error('无效的项目路径。');
    return path.resolve(rootPath);
  };
  const existingOwner = (sender: WebContents, root: string) => {
    const owner = owners.get(root);
    if (owner && owner.sender !== sender)
      throw new Error('该项目已由另一个编辑窗口打开。');
    return owner;
  };
  const ownerFor = (sender: WebContents, rootPath: string): Owner => {
    const root = canonicalRoot(rootPath);
    const existing = existingOwner(sender, root);
    if (existing) return existing;
    const send = (channel: string, payload: object) => {
      if (!sender.isDestroyed()) sender.send(channel, { rootPath, ...payload });
    };
    const sessionDirectory = sessionsRoot
      ? path.join(sessionsRoot, createHash('sha256').update(root).digest('hex'))
      : undefined;
    const runtime = createRuntime({
      rootPath,
      getModelOptions,
      sessionDirectory,
      transport: {
        publishEvent: (event) => send(channels.events, { event }),
        publishReport: (report) => send(channels.report, { report }),
        publishPatch: (transaction) =>
          send(channels.patchCommitted, {
            editorId: owner.editorId,
            transaction,
          }),
      },
    });
    const detach = () => {
      sender.removeListener('destroyed', detach);
      runtime.dispose();
      owners.delete(root);
    };
    const owner: Owner = { sender, runtime, detach };
    owners.set(root, owner);
    sender.once('destroyed', detach);
    return owner;
  };

  ipcMain.handle(
    channels.prompt,
    async (event, input: AgentPromptInput): Promise<AgentPromptResult> => {
      const transactions: PatchTransaction[] = [];
      try {
        const owner = existingOwner(
          event.sender,
          canonicalRoot(input.rootPath),
        );
        if (
          !owner ||
          !owner.editorId ||
          input.editorId !== owner.editorId ||
          !Number.isSafeInteger(input.revision)
        )
          throw new Error('当前画布尚未同步。');
        await owner.runtime.prompt(
          input.text,
          input.focus,
          input.revision,
          transactions,
        );
        return { success: true, transactions };
      } catch (error) {
        return {
          success: false,
          error: toMessage(error),
          transactions,
        };
      }
    },
  );

  ipcMain.handle(
    channels.steer,
    async (event, input: AgentSteerInput): Promise<AgentSteerOutcome> => {
      try {
        const owner = existingOwner(
          event.sender,
          canonicalRoot(input.rootPath),
        );
        if (!owner) throw new Error('还没有正在进行的访谈，无法插话。');
        return {
          success: true,
          disposition: await owner.runtime.steer(input.text),
        };
      } catch (error) {
        return { success: false, error: toMessage(error) };
      }
    },
  );
  ipcMain.handle(
    channels.abort,
    async (event, input: { rootPath: string }): Promise<AgentActionResult> => {
      try {
        await existingOwner(
          event.sender,
          canonicalRoot(input.rootPath),
        )?.runtime.abort();
        return { success: true };
      } catch (error) {
        return { success: false, error: toMessage(error) };
      }
    },
  );
  ipcMain.handle(
    channels.triggerSensors,
    async (event, input: SensorTriggerInput) =>
      (
        await ownerFor(event.sender, input.rootPath).runtime.runSensors(
          input.scopeRefs,
        )
      ).report,
  );
  ipcMain.handle(
    channels.latestReport,
    (event, input: { rootPath: string }) =>
      existingOwner(
        event.sender,
        canonicalRoot(input.rootPath),
      )?.runtime.latestReport() ?? null,
  );
  ipcMain.handle(channels.modelChanged, (event, input: LiveModelInput) => {
    if (
      typeof input.editorId !== 'string' ||
      input.editorId.length === 0 ||
      input.editorId.length > 100
    )
      throw new Error('无效的编辑会话。');
    const root = canonicalRoot(input.rootPath);
    const previous = existingOwner(event.sender, root);
    if (previous?.editorId !== input.editorId) {
      if (input.revision !== 1) throw new Error('编辑会话已关闭。');
      if (previous?.editorId !== undefined) previous.detach();
    }
    const owner = ownerFor(event.sender, input.rootPath);
    owner.runtime.notifyModelChanged(input);
    owner.editorId = input.editorId;
  });
  ipcMain.handle(
    channels.canvasContext,
    (event, input: CanvasContextRegistration) => {
      ownerFor(event.sender, input.rootPath).runtime.setCanvasContext(
        input.context,
      );
    },
  );

  return {
    resetModels: async () => {
      await Promise.all(
        [...owners.values()].map(({ runtime }) => runtime.resetModel()),
      );
    },
    dispose: () => {
      for (const owner of owners.values()) owner.detach();
      for (const channel of Object.values(channels))
        ipcMain.removeHandler(channel);
    },
  };
};
