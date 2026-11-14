import type { LiveDeliveryInput } from '../shared/delivery';
import { validateLiveDeliveryInput } from './deliveryProjection';
import path from 'node:path';

import {
  TOOL_NAMES,
  createEvidenceAgentSession,
  createEvidenceToolsExtension,
  createSensorsEngine,
  type AgentStreamEvent,
  type CanvasContext,
  type EvidenceAgentSession,
  type EvidenceAgentSessionOptions,
  type ModelPatchRequest,
  type ModelPatchResult,
  type SensorOutcome,
  type SensorReport,
  type SensorsEngine,
} from '@evidence-poc/evidence-agent';
import {
  readModelBundle,
  readModelDirectory,
} from '@evidence-poc/evidence-model-core';

import {
  isBundleProject,
  modelSourceOf,
  projectDirectoryOf,
} from './modelSource';
import { createDebouncedSensorRuntime } from './sensorRuntime';

export const MODEL_DIRECTORY = path.join('.evidence', 'fm');

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
  sensors?: Pick<SensorsEngine, 'runFullSensors' | 'checkStageGate'>;
  sessionFactory?: (
    options: EvidenceAgentSessionOptions,
  ) => EvidenceAgentSession;
  sessionDirectory?: string;
  /** Transcript the session continues, when the project already has one. */
  sessionFile?: string | null;
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
  notifyModelChanged: (input?: LiveDeliveryInput) => void;
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
  sensors,
  sessionFactory = createEvidenceAgentSession,
  sessionDirectory,
  sessionFile,
  sensorDelayMs,
}: AgentRuntimeOptions): AgentRuntime => {
  const resolvedRoot = path.resolve(rootPath);
  // A bundle project keeps the model and `.evidence/` next to the file, so every
  // path below is resolved from the source form rather than assumed.
  const modelRoot = modelSourceOf(resolvedRoot);
  const projectDirectory = projectDirectoryOf(resolvedRoot);
  // The sensors carry their checks and schemas, so one engine per project needs
  // no install directory: it reads the model and decides.
  const engine = sensors ?? createSensorsEngine();

  let live: LiveDeliveryInput | undefined;
  let runSequence = 0;
  let disposed = false;
  let session: EvidenceAgentSession | null = null;
  let latestReport: SensorReport | null = null;
  let canvasContext: CanvasContext = {
    projectRoot: projectDirectory,
    selection: emptySelection,
  };

  const runSensors = async (
    scopeRefs?: readonly string[],
    signal?: AbortSignal,
  ): Promise<SensorOutcome> => {
    const sequence = ++runSequence;
    const captured = live;
    const outcome = await engine.runFullSensors({
      modelRoot,
      ...(captured === undefined
        ? {}
        : { document: captured.document, baseDocument: captured.baseDocument }),
      ...(signal === undefined ? {} : { signal }),
      ...(scopeRefs === undefined ? {} : { scopeRefs }),
    });
    const report =
      captured === undefined
        ? outcome.report
        : { ...outcome.report, documentRevision: captured.revision };
    if (!disposed && sequence === runSequence && captured === live) {
      latestReport = report;
      transport.publishReport(report);
    }
    return { ...outcome, report };
  };

  const backgroundSensors = createDebouncedSensorRuntime({
    run: async () => {
      // A background run must not surface as an unhandled rejection.
      await runSensors().catch(() => undefined);
    },
    onError: () => undefined,
    ...(sensorDelayMs === undefined ? {} : { delayMs: sensorDelayMs }),
  });

  /**
   * Reads the latest mirrored canvas document, including unsaved patches.
   * Headless callers without a live registration fall back to the saved model.
   */
  const loadDocument = async () =>
    live?.document ??
    (isBundleProject(resolvedRoot)
      ? (await readModelBundle(modelRoot)).document
      : (await readModelDirectory(modelRoot)).document);

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
      projectRoot: projectDirectory,
      ...(sessionDirectory === undefined ? {} : { sessionDirectory }),
      ...(sessionFile === undefined || sessionFile === null
        ? {}
        : { sessionFile }),
      customTools: [],
      extensionFactories: [
        createEvidenceToolsExtension({
          modelRoot,
          runSensors: async ({ scope, signal }) =>
            (
              await runSensors(
                scope === undefined ? undefined : [scope],
                signal,
              )
            ).report,
          loadBaseDocument: async () => live?.baseDocument,
          refreshApi: async () => {
            await runSensors();
          },
          applyModelPatch: (patch) => transport.requestPatch(patch),
          getCanvasContext: async () => canvasContext,
          loadDocument,
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
    notifyModelChanged: (input) => {
      if (input !== undefined) {
        validateLiveDeliveryInput(input);
        if (path.resolve(input.rootPath) !== resolvedRoot)
          throw new Error('模型不属于当前项目。');
        if (live !== undefined && input.revision <= live.revision) return;
        live = structuredClone({
          ...input,
          baseDocument: live?.baseDocument ?? input.baseDocument,
        });
        latestReport = null;
      }
      backgroundSensors.schedule();
    },
    setCanvasContext: (context) => {
      canvasContext = context;
    },
    getCanvasContext: () => canvasContext,
    getSession: () => session,
    dispose: () => {
      disposed = true;
      ++runSequence;
      live = undefined;
      backgroundSensors.cancel();
      session?.dispose();
      session = null;
      starting = null;
    },
  };
};

/** Tool names the desktop expects the extension to register. */
export const EXPECTED_TOOL_NAMES = Object.values(TOOL_NAMES);
