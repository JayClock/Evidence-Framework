import type {
  AgentEventPayload,
  AgentPromptInput,
  AgentSteerInput,
  ApplyPatchRequest,
  CanvasContextRegistration,
  SensorReport,
  SensorReportPayload,
} from '../../shared/agentIpc';
import type { EvidenceDesktopApi } from '../../shared/ipc';
import type {
  McpRendererRequest,
  McpRendererResponse,
  McpStatus,
} from '../../shared/mcpIpc';
import type {
  EvidenceProjectSummary,
  OpenProjectResult,
} from '../../shared/projects';

export const projectSummary = (
  overrides: Partial<EvidenceProjectSummary> = {},
): EvidenceProjectSummary => ({
  rootPath: '/models/procurement',
  modelRoot: '/models/procurement/.evidence/fm',
  name: '商品采购（Product Procurement）',
  modelId: 'product-procurement',
  modelVersion: '1.1.0',
  entityCount: 12,
  relationshipCount: 8,
  ruleCount: 3,
  lastOpenedAt: '2026-11-11T08:00:00.000Z',
  ...overrides,
});

export const healthyReport = (
  overrides: Partial<SensorReport> = {},
): SensorReport => ({
  timestamp: '2026-11-11T08:00:00.000Z',
  passed: true,
  blockCount: 0,
  warnCount: 0,
  infoCount: 0,
  issues: [],
  keyDataSummary: {
    totalItems: 12,
    resolvedCount: 12,
    decisionOwedCount: 0,
    unresolvedItems: [],
  },
  isStageGateReady: false,
  unavailableSensors: [],
  ...overrides,
});

/** Test hooks for the agent surface; nothing here touches real IPC. */
export interface AgentMockController {
  /** Streams one agent event to every renderer subscriber. */
  emitEvent: (event: AgentEventPayload['event']) => void;
  /** Streams one sensor verdict to every renderer subscriber. */
  emitReport: (report: SensorReport) => void;
  /** Asks the renderer to apply a patch, as the main process would. */
  requestPatch: (request: ApplyPatchRequest) => void;
  /** Patch results the renderer answered, in order. */
  patchResponses: unknown[];
  /** Canvas selections the renderer published. */
  canvasContexts: CanvasContextRegistration[];
}

/** Test hooks for the MCP bridge; nothing here touches a real socket. */
export interface McpMockController {
  /** Main asks the renderer to answer one tool call. */
  request: (request: McpRendererRequest) => void;
  /** Answers the renderer sent back, in order. */
  responses: McpRendererResponse[];
  /** Broadcasts a bridge status to the renderer. */
  emitStatus: (status: McpStatus) => void;
  /** Toggles screenshot mode the way the main process does. */
  setCaptureMode: (active: boolean) => void;
  captureModes: boolean[];
  setStatus: (status: McpStatus) => void;
}

export interface DesktopApiMock extends EvidenceDesktopApi {
  calls: {
    open: string[];
    save: string[];
    openEditorWindow: string[];
    showOpenDialog: number;
    prompt: AgentPromptInput[];
    steer: AgentSteerInput[];
    abort: string[];
    triggerSensors: string[];
    modelChanged: string[];
  };
  agentMock: AgentMockController;
  mcpMock: McpMockController;
}

/**
 * Installs a scripted `window.evidenceAPI` for renderer tests and returns the
 * call log, so component tests never touch Electron IPC.
 */
export const installDesktopApi = ({
  projects = [],
  openResult = {
    success: true,
    project: projectSummary(),
    document: { manifest: {} } as never,
    issues: [],
  },
  saveResult = {
    success: true,
    written: [],
    unchanged: [],
    removed: [],
    savedAt: '2026-11-11T08:00:00.000Z',
  },
  dialogResult = { success: false, canceled: true } as const,
  sensorReport = healthyReport(),
}: {
  projects?: readonly EvidenceProjectSummary[];
  openResult?: OpenProjectResult;
  saveResult?: Awaited<ReturnType<EvidenceDesktopApi['projects']['save']>>;
  dialogResult?: Awaited<
    ReturnType<EvidenceDesktopApi['projects']['showOpenDialog']>
  >;
  sensorReport?: SensorReport;
} = {}): DesktopApiMock => {
  const calls: DesktopApiMock['calls'] = {
    open: [],
    save: [],
    openEditorWindow: [],
    showOpenDialog: 0,
    prompt: [],
    steer: [],
    abort: [],
    triggerSensors: [],
    modelChanged: [],
  };

  const rootPath =
    openResult.success === true
      ? openResult.project.rootPath
      : '/models/procurement';

  const eventListeners = new Set<(payload: AgentEventPayload) => void>();
  const reportListeners = new Set<(payload: SensorReportPayload) => void>();
  const patchListeners = new Set<(request: ApplyPatchRequest) => void>();
  const patchResponses: unknown[] = [];
  const canvasContexts: CanvasContextRegistration[] = [];
  let latest: SensorReport | null = null;

  const mcpRequestListeners = new Set<(request: McpRendererRequest) => void>();
  const mcpStatusListeners = new Set<(status: McpStatus) => void>();
  const mcpCaptureListeners = new Set<(active: boolean) => void>();
  const mcpResponses: McpRendererResponse[] = [];
  const captureModes: boolean[] = [];
  let mcpStatus: McpStatus = {
    listening: true,
    endpoint: '/tmp/evidence-mcp-test.sock',
    connections: 0,
    calls: 0,
    registeredClients: [],
    error: null,
  };

  const mcpMock: McpMockController = {
    request: (request) => {
      for (const listener of mcpRequestListeners) {
        listener(request);
      }
    },
    responses: mcpResponses,
    emitStatus: (next) => {
      mcpStatus = next;

      for (const listener of mcpStatusListeners) {
        listener(next);
      }
    },
    setCaptureMode: (active) => {
      captureModes.push(active);

      for (const listener of mcpCaptureListeners) {
        listener(active);
      }
    },
    captureModes,
    setStatus: (next) => {
      mcpStatus = next;
    },
  };

  const agentMock: AgentMockController = {
    emitEvent: (event) => {
      for (const listener of eventListeners) {
        listener({ rootPath, event });
      }
    },
    emitReport: (report) => {
      latest = report;

      for (const listener of reportListeners) {
        listener({ rootPath, report });
      }
    },
    requestPatch: (request) => {
      for (const listener of patchListeners) {
        listener(request);
      }
    },
    patchResponses,
    canvasContexts,
  };

  const api: DesktopApiMock = {
    calls,
    agentMock,
    mcpMock,
    projects: {
      showOpenDialog: async () => {
        calls.showOpenDialog += 1;

        return dialogResult;
      },
      open: async (rootPath) => {
        calls.open.push(rootPath);

        return openResult;
      },
      save: async (input) => {
        calls.save.push(input.rootPath);

        return saveResult;
      },
      listRecent: async () => ({ success: true, projects }),
      openEditorWindow: async (rootPath) => {
        calls.openEditorWindow.push(rootPath);
      },
      onChanged: () => () => undefined,
    },
    agent: {
      prompt: async (input) => {
        calls.prompt.push(input);

        return { success: true };
      },
      steer: async (input) => {
        calls.steer.push(input);

        return { success: true, disposition: 'queued' };
      },
      abort: async ({ rootPath }) => {
        calls.abort.push(rootPath);

        return { success: true };
      },
      triggerSensors: async ({ rootPath }) => {
        calls.triggerSensors.push(rootPath);
        latest = sensorReport;

        return sensorReport;
      },
      notifyModelChanged: async ({ rootPath }) => {
        calls.modelChanged.push(rootPath);
      },
      latestReport: async () => latest,
      readInterviewTrace: async () => ({ success: true, trace: null }),
      publishCanvasContext: async (input) => {
        canvasContexts.push(input);
      },
      onEvent: (listener) => {
        eventListeners.add(listener);

        return () => eventListeners.delete(listener);
      },
      onReport: (listener) => {
        reportListeners.add(listener);

        return () => reportListeners.delete(listener);
      },
      onApplyPatch: (listener) => {
        patchListeners.add(listener);

        return () => patchListeners.delete(listener);
      },
      respondPatch: (response) => {
        patchResponses.push(response);
      },
    },
    mcp: {
      getStatus: async () => mcpStatus,
      onStatus: (listener) => {
        mcpStatusListeners.add(listener);

        return () => mcpStatusListeners.delete(listener);
      },
      onRequest: (listener) => {
        mcpRequestListeners.add(listener);

        return () => mcpRequestListeners.delete(listener);
      },
      respond: (response) => {
        mcpResponses.push(response);
      },
      onCaptureMode: (listener) => {
        mcpCaptureListeners.add(listener);

        return () => mcpCaptureListeners.delete(listener);
      },
    },
    system: { platform: 'darwin' },
  };

  Object.defineProperty(window, 'evidenceAPI', {
    value: api,
    configurable: true,
    writable: true,
  });

  return api;
};
