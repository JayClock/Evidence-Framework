import path from 'node:path';

import {
  createEvidenceAgentSession,
  createPythonEnvResolver,
  type AgentStreamEvent,
  type EvidenceAgentSession,
  type EvidenceAgentSessionOptions,
  type PythonEnvResolver,
} from '@evidence-poc/evidence-agent-core';
import {
  TOOL_NAMES,
  createEvidenceToolsExtension,
  createSensorsEngine,
  type CanvasContext,
  type ModelPatchRequest,
  type ModelPatchResult,
  type SensorOutcome,
  type SensorReport,
  type SensorsEngine,
} from '@evidence-poc/evidence-modeling-orchestrator';

import { createDebouncedSensorRuntime } from './sensorRuntime';

export const MODEL_DIRECTORY = path.join('.evidence', 'fm');
export const TRACE_RELATIVE_PATH = path.join(
  '.evidence',
  'traces',
  'interview-trace.json',
);

/** How the runtime reaches the renderer without importing Electron. */
export interface AgentRuntimeTransport {
  publishEvent: (event: AgentStreamEvent) => void;
  publishReport: (report: SensorReport) => void;
  /** Asks the renderer to apply a patch through its live `ModelSession`. */
  requestPatch: (patch: ModelPatchRequest) => Promise<ModelPatchResult>;
}

export interface AgentRuntimeOptions {
  /** Absolute project root that owns `.evidence/`. */
  rootPath: string;
  transport: AgentRuntimeTransport;
  /** Injected for tests; production builds one from the project root. */
  resolver?: PythonEnvResolver;
  sensors?: Pick<SensorsEngine, 'runFullSensors' | 'checkStageGate'>;
  sessionFactory?: (
    options: EvidenceAgentSessionOptions,
  ) => EvidenceAgentSession;
  skillsRoot?: string;
  sessionDirectory?: string;
  sensorDelayMs?: number;
}

export interface AgentRuntime {
  readonly rootPath: string;
  readonly modelRoot: string;
  prompt: (text: string) => Promise<void>;
  steer: (text: string) => Promise<'handled' | 'queued'>;
  abort: () => Promise<void>;
  /** Explicit sensor run, returning the verdict the caller awaits. */
  runSensors: (scopeRefs?: readonly string[]) => Promise<SensorOutcome>;
  latestReport: () => SensorReport | null;
  /** Re-arms the background sensor check after a model edit. */
  notifyModelChanged: () => void;
  /** Records what the canvas shows so tools can read the selection. */
  setCanvasContext: (context: CanvasContext) => void;
  getCanvasContext: () => CanvasContext;
  getSession: () => EvidenceAgentSession | null;
  dispose: () => void;
}

const emptySelection = { nodeId: null, attributeName: null };

/**
 * One Pi conversation, one sensor engine and one model source tree.
 *
 * Sessions start lazily on the first prompt so opening a project costs nothing,
 * and every patch travels back to the renderer's `ModelSession` so agent edits
 * land in the same undo history as human edits.
 */
export const createAgentRuntime = ({
  rootPath,
  transport,
  resolver,
  sensors,
  sessionFactory = createEvidenceAgentSession,
  skillsRoot,
  sessionDirectory,
  sensorDelayMs,
}: AgentRuntimeOptions): AgentRuntime => {
  const resolvedRoot = path.resolve(rootPath);
  const modelRoot = path.join(resolvedRoot, MODEL_DIRECTORY);
  const tracePath = path.join(resolvedRoot, TRACE_RELATIVE_PATH);
  const python =
    resolver ?? createPythonEnvResolver({ projectRoot: resolvedRoot });
  const engine =
    sensors ??
    createSensorsEngine({
      resolver: python,
      ...(skillsRoot === undefined ? {} : { skillsRoot }),
    });

  let session: EvidenceAgentSession | null = null;
  let latestReport: SensorReport | null = null;
  let canvasContext: CanvasContext = {
    projectRoot: resolvedRoot,
    selection: emptySelection,
  };

  const runSensors = async (
    scopeRefs?: readonly string[],
  ): Promise<SensorOutcome> => {
    const outcome = await engine.runFullSensors({
      modelRoot,
      tracePath,
      ...(scopeRefs === undefined ? {} : { scopeRefs }),
    });

    latestReport = outcome.report;
    transport.publishReport(outcome.report);

    return outcome;
  };

  const backgroundSensors = createDebouncedSensorRuntime({
    run: async () => {
      // A background run must not surface as an unhandled rejection.
      await runSensors().catch(() => undefined);
    },
    onError: () => undefined,
    ...(sensorDelayMs === undefined ? {} : { delayMs: sensorDelayMs }),
  });

  let starting: Promise<EvidenceAgentSession> | null = null;

  const ensureSession = async (): Promise<EvidenceAgentSession> => {
    if (session !== null) {
      return session;
    }

    starting ??= startSession();
    session = await starting;

    return session;
  };

  const startSession = async (): Promise<EvidenceAgentSession> => {
    const created = sessionFactory({
      projectRoot: resolvedRoot,
      ...(sessionDirectory === undefined ? {} : { sessionDirectory }),
      customTools: [],
      extensionFactories: [
        createEvidenceToolsExtension({
          modelRoot,
          runSensors: async ({ scope, signal }) => {
            const outcome = await engine.runFullSensors({
              modelRoot,
              tracePath,
              ...(scope === undefined ? {} : { scopeRefs: [scope] }),
              ...(signal === undefined ? {} : { signal }),
            });

            latestReport = outcome.report;
            transport.publishReport(outcome.report);

            return outcome.report;
          },
          applyModelPatch: (patch) => transport.requestPatch(patch),
          getCanvasContext: async () => canvasContext,
        }),
      ],
    });

    created.subscribe(transport.publishEvent);
    await created.start();

    return created;
  };

  return {
    rootPath: resolvedRoot,
    modelRoot,
    prompt: async (text) => {
      const active = await ensureSession();

      await active.prompt(text);
    },
    steer: async (text) => {
      if (session === null) {
        throw new Error('还没有正在进行的访谈，无法插话。');
      }

      return session.steer(text);
    },
    abort: async () => {
      if (session !== null) {
        await session.abort();
      }
    },
    runSensors,
    latestReport: () => latestReport,
    notifyModelChanged: () => backgroundSensors.schedule(),
    setCanvasContext: (context) => {
      canvasContext = context;
    },
    getCanvasContext: () => canvasContext,
    getSession: () => session,
    dispose: () => {
      backgroundSensors.cancel();
      session?.dispose();
      session = null;
      starting = null;
    },
  };
};

/** Tool names the desktop expects the extension to register. */
export const EXPECTED_TOOL_NAMES = Object.values(TOOL_NAMES);
