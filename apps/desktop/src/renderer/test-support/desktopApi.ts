import type {
  AgentEventPayload,
  AgentPromptInput,
  AgentSteerInput,
  ApplyPatchRequest,
  CanvasContextRegistration,
  SensorReport,
  SensorReportPayload,
} from '../../shared/agentIpc';
import type {
  CompileDraftInput,
  CompileDraftOutcome,
  IngestDraftInput,
  IngestDraftResult,
} from '../../shared/ingestion';
import type { EvidenceDesktopApi } from '../../shared/ipc';
import type {
  McpRendererRequest,
  McpRendererResponse,
  McpStatus,
} from '../../shared/mcpIpc';
import type {
  CreateProjectDialogInput,
  CreateProjectDialogResult,
  CreateProjectInput,
  CreateProjectResult,
  EvidenceProjectSummary,
  OpenProjectResult,
  ProjectTemplateMeta,
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

/** Starter cards the dashboard fetches; the counts mirror the main process. */
export const defaultTemplates = (): readonly ProjectTemplateMeta[] => [
  {
    id: 'blank',
    name: '空白模型',
    description:
      '只有 model.json 的空源树，适合已经想清楚业务边界的建模者从零开始。',
    source: '履约建模法元模型',
    entityCount: 0,
    relationshipCount: 0,
    ruleCount: 0,
  },
  {
    id: 'procurement',
    name: '公对公商品采购履约',
    description: '询价与报价、采购协议，加上发货、支付、开票三组履约项与对应凭证。',
    source: '直播案例：商品采购协议履约',
    entityCount: 22,
    relationshipCount: 15,
    ruleCount: 3,
  },
];

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
    showCreateDialog: CreateProjectDialogInput[];
    create: CreateProjectInput[];
    prompt: AgentPromptInput[];
    steer: AgentSteerInput[];
    abort: string[];
    triggerSensors: string[];
    modelChanged: string[];
    exportReview: string[];
    deliveryPreview: string[];
    exportDelivery: string[];
    ingestDraft: IngestDraftInput[];
    compileDraft: CompileDraftInput[];
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
  createDialogResult = { success: false, canceled: true } as const,
  createResult = {
    success: true,
    project: projectSummary(),
    document: { manifest: {} } as never,
  },
  templates = defaultTemplates(),
  sensorReport = healthyReport(),
  exportReviewResult = { status: 'cancelled' } as const,
  deliveryPreviewResult = {
    success: false,
    error: '测试没有配置交付预览。',
  } as const,
  exportDeliveryResult = { status: 'cancelled' } as const,
  ingestResult = {
    success: false,
    error: '测试没有配置导入结果。',
    issues: [],
  } as IngestDraftResult,
  compileResult = {
    success: false,
    error: '测试没有配置编译结果。',
    issues: [],
  } as CompileDraftOutcome,
}: {
  projects?: readonly EvidenceProjectSummary[];
  openResult?: OpenProjectResult;
  saveResult?: Awaited<ReturnType<EvidenceDesktopApi['projects']['save']>>;
  dialogResult?: Awaited<
    ReturnType<EvidenceDesktopApi['projects']['showOpenDialog']>
  >;
  createDialogResult?: CreateProjectDialogResult;
  createResult?: CreateProjectResult;
  templates?: readonly ProjectTemplateMeta[];
  sensorReport?: SensorReport;
  exportReviewResult?: Awaited<
    ReturnType<EvidenceDesktopApi['projects']['exportReview']>
  >;
  deliveryPreviewResult?: Awaited<
    ReturnType<EvidenceDesktopApi['projects']['deliveryPreview']>
  >;
  exportDeliveryResult?: Awaited<
    ReturnType<EvidenceDesktopApi['projects']['exportDelivery']>
  >;
  ingestResult?: IngestDraftResult;
  compileResult?: CompileDraftOutcome;
} = {}): DesktopApiMock => {
  const calls: DesktopApiMock['calls'] = {
    open: [],
    save: [],
    openEditorWindow: [],
    showOpenDialog: 0,
    showCreateDialog: [],
    create: [],
    prompt: [],
    steer: [],
    abort: [],
    triggerSensors: [],
    modelChanged: [],
    exportReview: [],
    deliveryPreview: [],
    exportDelivery: [],
    ingestDraft: [],
    compileDraft: [],
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
      showCreateDialog: async (input) => {
        calls.showCreateDialog.push(input);

        return createDialogResult;
      },
      create: async (input) => {
        calls.create.push(input);

        return createResult;
      },
      listTemplates: async () => ({ success: true, templates }),
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
      exportReview: async (rootPath) => {
        calls.exportReview.push(rootPath);

        return exportReviewResult;
      },
      deliveryPreview: async (rootPath) => {
        calls.deliveryPreview.push(rootPath);

        return deliveryPreviewResult;
      },
      exportDelivery: async (rootPath) => {
        calls.exportDelivery.push(rootPath);

        return exportDeliveryResult;
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
    ingestion: {
    draft: async (input) => {
      calls.ingestDraft.push(input);

      return ingestResult;
    },
    compile: async (input) => {
      calls.compileDraft.push(input);

      return compileResult;
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
