import path from 'node:path';

import type {
  AgentSession,
  InlineExtension,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';

import { type AgentStreamEvent, projectSessionEvent } from './streamEvents.js';

/** Project-local skill tree; the only skill source `AGENTS.md` allows. */
export const PROJECT_SKILL_DIRECTORY = path.join('.agents', 'skills');

/** The few Pi SDK entry points the desktop needs, narrowed for injection. */
export interface PiSdkPort {
  getAgentDir(): string;
  createResourceLoader(options: {
    cwd: string;
    agentDir: string;
    skillDirectories?: readonly string[];
    extensionFactories?: readonly InlineExtension[];
  }): { reload(): Promise<void> };
  createSessionManager(cwd: string, sessionDirectory?: string): unknown;
  /** Opens one persisted transcript so a branch resumes its own lineage. */
  openSessionManager(sessionFile: string): unknown;
  createAgentSession(options: {
    cwd: string;
    resourceLoader: unknown;
    sessionManager: unknown;
    customTools?: readonly ToolDefinition[];
    tools?: readonly string[];
    noTools?: 'all' | 'builtin';
  }): Promise<{ session: AgentSession }>;
}

export interface EvidenceAgentSessionOptions {
  /** Project root whose `.evidence/`, `.agents/` and instructions are discovered. */
  projectRoot: string;
  /** Defaults to `~/.pi/agent` through Pi's own resolver. */
  agentDir?: string;
  /** Defaults to `<projectRoot>/.agents/skills`. */
  skillDirectories?: readonly string[];
  extensionFactories?: readonly InlineExtension[];
  customTools?: readonly ToolDefinition[];
  /** Where Pi persists the JSONL audit trail; defaults to Pi's session directory. */
  sessionDirectory?: string;
  /**
   * Persisted transcript this session continues.
   *
   * A branch owns its own forked transcript, so resuming it must not read the
   * main conversation; when set, `sessionDirectory` is ignored.
   */
  sessionFile?: string;
  /** Tool allowlist; omit to keep Pi's defaults plus the custom tools. */
  tools?: readonly string[];
  noTools?: 'all' | 'builtin';
  /** Injected SDK boundary; tests pass a fake. */
  sdk?: PiSdkPort;
}

export interface EvidenceAgentSession {
  readonly projectRoot: string;
  /** Creates the SDK session once; later calls are a no-op. */
  start(): Promise<void>;
  /** Live Pi session, or null before `start()`. */
  getSession(): AgentSession | null;
  /** Transcript file Pi writes for this session, or null before it persists one. */
  getSessionFile(): string | null;
  prompt(text: string): Promise<void>;
  /** Queues a correction while a run streams; never restarts the run. */
  steer(text: string): Promise<'handled' | 'queued'>;
  abort(): Promise<void>;
  subscribe(listener: (event: AgentStreamEvent) => void): () => void;
  dispose(): void;
}

/**
 * Adapts the Pi SDK to the narrow port above.
 *
 * The import stays dynamic so the package loads in unit tests without a
 * configured model, credentials or terminal.
 */
export const loadPiSdkPort = async (): Promise<PiSdkPort> => {
  const sdk = await import('@earendil-works/pi-coding-agent');

  return {
    getAgentDir: () => sdk.getAgentDir(),
    createResourceLoader: ({
      cwd,
      agentDir,
      skillDirectories = [],
      extensionFactories = [],
    }) =>
      new sdk.DefaultResourceLoader({
        cwd,
        agentDir,
        additionalSkillPaths: [...skillDirectories],
        extensionFactories: [...extensionFactories],
      }),
    createSessionManager: (cwd, sessionDirectory) =>
      sessionDirectory === undefined
        ? sdk.SessionManager.create(cwd)
        : sdk.SessionManager.create(cwd, sessionDirectory),
    openSessionManager: (sessionFile) => sdk.SessionManager.open(sessionFile),
    createAgentSession: async (options) =>
      sdk.createAgentSession({
        cwd: options.cwd,
        resourceLoader: options.resourceLoader as never,
        sessionManager: options.sessionManager as never,
        ...(options.customTools === undefined
          ? {}
          : { customTools: [...options.customTools] }),
        ...(options.tools === undefined ? {} : { tools: [...options.tools] }),
        ...(options.noTools === undefined ? {} : { noTools: options.noTools }),
      }),
  };
};

/**
 * One in-process evidence modeling conversation.
 *
 * Sessions are created lazily because the factory reads credentials and project
 * trust; the desktop should only pay that cost when the user actually asks a
 * question.
 */
export const createEvidenceAgentSession = (
  options: EvidenceAgentSessionOptions,
): EvidenceAgentSession => {
  const projectRoot = path.resolve(options.projectRoot);
  const listeners = new Set<(event: AgentStreamEvent) => void>();
  let session: AgentSession | null = null;
  let unsubscribePi: (() => void) | null = null;
  let starting: Promise<void> | null = null;

  const emit = (events: readonly AgentStreamEvent[]): void => {
    for (const streamEvent of events) {
      for (const listener of listeners) {
        listener(streamEvent);
      }
    }
  };

  const start = async (): Promise<void> => {
    if (session !== null) {
      return;
    }

    starting ??= (async () => {
      const sdk = options.sdk ?? (await loadPiSdkPort());
      const agentDir = options.agentDir ?? sdk.getAgentDir();
      const skillDirectories = options.skillDirectories ?? [
        path.join(projectRoot, PROJECT_SKILL_DIRECTORY),
      ];
      const resourceLoader = sdk.createResourceLoader({
        cwd: projectRoot,
        agentDir,
        skillDirectories,
        ...(options.extensionFactories === undefined
          ? {}
          : { extensionFactories: options.extensionFactories }),
      });

      await resourceLoader.reload();

      const created = await sdk.createAgentSession({
        cwd: projectRoot,
        resourceLoader,
        sessionManager:
          options.sessionFile === undefined
            ? sdk.createSessionManager(projectRoot, options.sessionDirectory)
            : sdk.openSessionManager(options.sessionFile),
        ...(options.customTools === undefined
          ? {}
          : { customTools: options.customTools }),
        ...(options.tools === undefined ? {} : { tools: options.tools }),
        ...(options.noTools === undefined ? {} : { noTools: options.noTools }),
      });

      session = created.session;
      unsubscribePi = session.subscribe((event) => {
        emit(projectSessionEvent(event));
      });
    })();

    try {
      await starting;
    } catch (error) {
      starting = null;
      throw error;
    }
  };

  const requireSession = async (): Promise<AgentSession> => {
    await start();

    if (session === null) {
      throw new Error('Pi agent session failed to start.');
    }

    return session;
  };

  return {
    projectRoot,
    start,
    getSession: () => session,
    getSessionFile: () => session?.sessionManager.getSessionFile() ?? null,
    prompt: async (text) => {
      const active = await requireSession();

      await active.prompt(text);
    },
    steer: async (text) => (await requireSession()).steer(text),
    abort: async () => {
      if (session !== null) {
        await session.abort();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      unsubscribePi?.();
      unsubscribePi = null;
      session?.dispose();
      session = null;
      starting = null;
      listeners.clear();
    },
  };
};
