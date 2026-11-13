import type {
  LiveDeliveryInput,
  LiveDeliveryResult,
  ExportLiveDeliveryInput,
} from './delivery';
import type { PreviewReviewInput, PreviewReviewResult } from './review';
import type { EvidenceAgentApi } from './agentIpc';
import type { DeliveryPreviewResult, ExportDeliveryResult } from './projects';
import type {
  CompileDraftInput,
  CompileDraftOutcome,
  IngestDraftInput,
  IngestDraftResult,
} from './ingestion';
import type { EvidenceMcpApi } from './mcpIpc';
import type { EvidenceSimulationApi } from './simulation';
import type {
  CreateProjectDialogInput,
  CreateProjectDialogResult,
  CreateProjectInput,
  CreateProjectResult,
  EvidenceProjectSummary,
  ExportReviewResult,
  OpenProjectDialogResult,
  OpenProjectResult,
  ProjectChangedEvent,
  ProjectStorageKind,
  ProjectTemplateId,
  ProjectTemplateMeta,
  ProjectTemplatesResult,
  RecentProjectsResult,
  SaveProjectInput,
  SaveProjectResult,
} from './projects';

/** IPC channels shared by the main process and the preload bridge. */
export const EVIDENCE_IPC_CHANNELS = {
  showOpenDialog: 'evidence:project:show-open-dialog',
  open: 'evidence:project:open',
  create: 'evidence:project:create',
  showCreateDialog: 'evidence:project:show-create-dialog',
  templates: 'evidence:project:templates',
  save: 'evidence:project:save',
  recent: 'evidence:project:recent',
  openEditorWindow: 'evidence:project:open-editor-window',
  changed: 'evidence:project:changed',
  previewReview: 'evidence:project:preview-review',
  exportDiffReview: 'evidence:project:export-diff-review',
  exportReview: 'evidence:project:export-review',
  deliveryLivePreview: 'evidence:project:delivery-live-preview',
  exportLiveDelivery: 'evidence:project:export-live-delivery',
  deliveryPreview: 'evidence:project:delivery-preview',
  exportDelivery: 'evidence:project:export-delivery',
} as const;

export type EvidenceIpcChannel =
  (typeof EVIDENCE_IPC_CHANNELS)[keyof typeof EVIDENCE_IPC_CHANNELS];

/** Channels that read business prose into a draft, and compile that draft. */
export const EVIDENCE_INGESTION_IPC_CHANNELS = {
  draft: 'evidence:ingestion:draft',
  compile: 'evidence:ingestion:compile',
} as const;

export type EvidenceIngestionIpcChannel =
  (typeof EVIDENCE_INGESTION_IPC_CHANNELS)[keyof typeof EVIDENCE_INGESTION_IPC_CHANNELS];

/** The only surface the renderer can reach: no `ipcRenderer`, no `fs`. */
export interface EvidenceDesktopApi {
  projects: {
    showOpenDialog: () => Promise<OpenProjectDialogResult>;
    /** Picks the folder or bundle path a new project is written to. */
    showCreateDialog: (
      input: CreateProjectDialogInput,
    ) => Promise<CreateProjectDialogResult>;
    /** Writes a starter model to `targetPath` and remembers the project. */
    create: (input: CreateProjectInput) => Promise<CreateProjectResult>;
    /** Starter templates the dashboard offers, with their real counts. */
    listTemplates: () => Promise<ProjectTemplatesResult>;
    open: (rootPath: string) => Promise<OpenProjectResult>;
    save: (input: SaveProjectInput) => Promise<SaveProjectResult>;
    listRecent: () => Promise<RecentProjectsResult>;
    /** Opens (or focuses) the model workspace window for a project root. */
    openEditorWindow: (rootPath: string) => Promise<void>;
    /** Subscribes to external `.evidence/fm` changes; returns an unsubscribe. */
    onChanged: (listener: (event: ProjectChangedEvent) => void) => () => void;
    /**
     * Writes the offline review page for one project.
     *
     * The page is generated in the main process from the sources on disk, so a
     * review always describes what was saved, not what the canvas shows.
     */
    previewReview: (input: PreviewReviewInput) => Promise<PreviewReviewResult>;
    exportDiffReview: (rootPath: string) => Promise<ExportReviewResult>;
    exportReview: (rootPath: string) => Promise<ExportReviewResult>;
    /**
     * What the model becomes when it is deployed.
     *
     * Projected in the main process from the saved sources, so the hub describes
     * the delivery the export would actually write.
     */
    deliveryLivePreview: (
      input: LiveDeliveryInput,
    ) => Promise<LiveDeliveryResult>;
    exportLiveDelivery: (
      input: ExportLiveDeliveryInput,
    ) => Promise<ExportDeliveryResult>;
    deliveryPreview: (rootPath: string) => Promise<DeliveryPreviewResult>;
    /** Writes the contract, topology, routes and deployment sketch to a folder. */
    exportDelivery: (rootPath: string) => Promise<ExportDeliveryResult>;
  };
  /** Pi agent, sensors and patch application (phase 3). */
  agent: EvidenceAgentApi;
  /** MCP bridge status and the renderer side of external tool calls. */
  mcp: EvidenceMcpApi;
  /**
   * The simulation sandbox and the drift radar.
   *
   * Both read the saved model in the main process: a replay or an audit that
   * described unsaved canvas edits would answer a question nobody asked.
   */
  simulation: EvidenceSimulationApi;
  /**
   * Business text and blueprint tables in, a model out.
   *
   * Both calls run in the main process: reading uses the project's model
   * configuration, and compiling writes a source tree, so neither belongs in a
   * renderer that has no filesystem.
   */
  ingestion: {
    /** Reads business text or a blueprint table into a draft. */
    draft: (input: IngestDraftInput) => Promise<IngestDraftResult>;
    /** Compiles a reviewed draft into a saved project. */
    compile: (input: CompileDraftInput) => Promise<CompileDraftOutcome>;
  };
  system: {
    platform: NodeJS.Platform;
  };
}

export type {
  CompileDraftInput,
  CompileDraftOutcome,
  CompileDraftResult,
  IngestDraftInput,
  IngestDraftResult,
  IngestionInputKind,
  IngestionReader,
} from './ingestion';

export type {
  DriftRequest,
  ReplayRequest,
  TraceDialogResult,
} from './simulation';

export type {
  DeliveryPreview,
  DeliveryPreviewLink,
  DeliveryPreviewResult,
  DeliveryPreviewRoute,
  DeliveryPreviewService,
  ExportDeliveryResult,
} from './projects';

export type {
  CreateProjectDialogResult,
  CreateProjectInput,
  CreateProjectResult,
  EvidenceProjectSummary,
  ExportReviewResult,
  OpenProjectDialogResult,
  OpenProjectResult,
  ProjectChangedEvent,
  ProjectStorageKind,
  ProjectTemplateId,
  ProjectTemplateMeta,
  ProjectTemplatesResult,
  RecentProjectsResult,
  SaveProjectInput,
  SaveProjectResult,
};
