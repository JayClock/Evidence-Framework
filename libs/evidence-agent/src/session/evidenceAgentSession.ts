import path from 'node:path';
import type {
  AgentSession,
  AgentSessionRuntime,
  InlineExtension,
  ModelRuntime,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';

import { EVIDENCE_INSTRUCTIONS } from '../prompts/index.js';
import { type AgentStreamEvent, projectSessionEvent } from './streamEvents.js';

export interface EvidenceModelOptions {
  agentDir?: string;
  modelRuntime?: ModelRuntime;
  model?: Parameters<ModelRuntime['completeSimple']>[0];
  thinkingLevel?: 'off' | 'low' | 'medium' | 'high';
}

export interface EvidenceAgentSessionOptions extends EvidenceModelOptions {
  projectRoot: string;
  instructions?: readonly string[];
  extensionFactories?: readonly InlineExtension[];
  customTools?: readonly ToolDefinition[];
  sessionDirectory?: string;
  sessionFile?: string;
  inMemory?: boolean;
  tools?: readonly string[];
  noTools?: 'all' | 'builtin';
}

export interface EvidenceAgentSession {
  readonly projectRoot: string;
  start(): Promise<void>;
  getSession(): AgentSession | null;
  getSessionFile(): string | null;
  prompt(text: string): Promise<void>;
  steer(text: string): Promise<'handled' | 'queued'>;
  abort(): Promise<void>;
  subscribe(listener: (event: AgentStreamEvent) => void): () => void;
  dispose(): void | Promise<void>;
}

/** Pi owns history and replacement; the host owns project scope and tool access. */
export const openEvidenceSessionRuntime = async (
  options: EvidenceAgentSessionOptions,
): Promise<AgentSessionRuntime> => {
  const sdk = await import('@earendil-works/pi-coding-agent');
  const cwd = path.resolve(options.projectRoot);
  const agentDir = options.agentDir ?? sdk.getAgentDir();
  const sessionManager = options.sessionFile
    ? sdk.SessionManager.open(
        options.sessionFile,
        options.sessionDirectory,
        cwd,
      )
    : options.inMemory
      ? sdk.SessionManager.inMemory(cwd)
      : sdk.SessionManager.create(
          cwd,
          options.sessionDirectory ??
            (options.agentDir ? path.join(agentDir, 'sessions') : undefined),
        );
  return sdk.createAgentSessionRuntime(
    async (target) => {
      if (target.cwd !== cwd) throw new Error('会话不属于当前项目。');
      const services = await sdk.createAgentSessionServices({
        cwd,
        agentDir,
        modelRuntime: options.modelRuntime,
        settingsManager: sdk.SettingsManager.inMemory(),
        resourceLoaderOptions: {
          noSkills: true,
          noExtensions: true,
          noPromptTemplates: true,
          noThemes: true,
          noContextFiles: true,
          systemPromptOverride: () =>
            (options.instructions ?? EVIDENCE_INSTRUCTIONS).join('\n\n'),
          appendSystemPromptOverride: () => [],
          extensionFactories: [...(options.extensionFactories ?? [])],
        },
      });
      return {
        ...(await sdk.createAgentSessionFromServices({
          services,
          sessionManager: target.sessionManager,
          sessionStartEvent: target.sessionStartEvent,
          model: options.model,
          thinkingLevel: options.thinkingLevel,
          noTools: options.noTools ?? 'builtin',
          tools: options.tools ? [...options.tools] : undefined,
          customTools: options.customTools
            ? [...options.customTools]
            : undefined,
        })),
        services,
        diagnostics: services.diagnostics,
      };
    },
    { cwd, agentDir, sessionManager },
  );
};

export const createEvidenceAgentSession = (
  options: EvidenceAgentSessionOptions,
): EvidenceAgentSession => {
  const projectRoot = path.resolve(options.projectRoot);
  const listeners = new Set<(event: AgentStreamEvent) => void>();
  let runtime: AgentSessionRuntime | undefined;
  let starting: Promise<void> | undefined;
  let disposed = false;
  let unsubscribe: (() => void) | undefined;

  const start = async () => {
    if (disposed) throw new Error('会话已关闭。');
    if (runtime) return;
    const pending = (starting ??= (async () => {
      const next = await openEvidenceSessionRuntime(options);
      const bind = async (session: AgentSession) => {
        unsubscribe?.();
        unsubscribe = session.subscribe((event) => {
          for (const projected of projectSessionEvent(event)) {
            for (const listener of listeners) listener(projected);
          }
        });
        await session.bindExtensions({});
      };
      try {
        if (disposed) throw new Error('会话已关闭。');
        next.setRebindSession(bind);
        await bind(next.session);
        if (disposed) throw new Error('会话已关闭。');
        runtime = next;
      } catch (error) {
        unsubscribe?.();
        await next.dispose();
        throw error;
      }
    })());
    try {
      await pending;
    } finally {
      if (starting === pending) starting = undefined;
    }
  };

  const requireSession = async () => {
    await start();
    if (!runtime || disposed) throw new Error('会话已关闭。');
    return runtime.session;
  };

  return {
    projectRoot,
    start,
    getSession: () => runtime?.session ?? null,
    getSessionFile: () => runtime?.session.sessionFile ?? null,
    prompt: async (text) => (await requireSession()).prompt(text),
    steer: async (text) => (await requireSession()).steer(text),
    abort: async () => {
      await runtime?.session.abort();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: async () => {
      disposed = true;
      unsubscribe?.();
      listeners.clear();
      const previous = runtime;
      runtime = undefined;
      await previous?.dispose();
      await starting?.catch(() => undefined);
    },
  };
};
