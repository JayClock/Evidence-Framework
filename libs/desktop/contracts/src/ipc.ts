import type { EvidenceAiConfigApi } from './aiConfig.js';
import type {
  LiveDeliveryInput,
  LiveDeliveryResult,
  ExportLiveDeliveryInput,
} from './delivery.js';
import type { EvidenceAgentApi } from './agentIpc.js';
import type {
  DeliveryPreviewResult,
  ExportDeliveryResult,
} from './projects.js';
import type {
  CompileDraftInput,
  CompileDraftOutcome,
  IngestDraftInput,
  IngestDraftResult,
} from './ingestion.js';
import type { EvidenceMcpApi } from './mcpIpc.js';
import type { EvidenceStoryApi } from './story.js';
import type {
  CreateProjectDialogInput,
  CreateProjectDialogResult,
  CreateProjectInput,
  CreateProjectResult,
  EvidenceProjectSummary,
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
} from './projects.js';

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
  aiConfig: EvidenceAiConfigApi;
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
  /** Incremental business walkthrough and isolated What-If sandbox. */
  story: EvidenceStoryApi;
  /** Pi agent, sensors and patch application (phase 3). */
  agent: EvidenceAgentApi;
  /** MCP bridge status and the renderer side of external tool calls. */
  mcp: EvidenceMcpApi;
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
} from './ingestion.js';

export type {
  DeliveryPreview,
  DeliveryPreviewLink,
  DeliveryPreviewResult,
  DeliveryPreviewRoute,
  DeliveryPreviewService,
  ExportDeliveryResult,
} from './projects.js';

export type {
  CreateProjectDialogResult,
  CreateProjectInput,
  CreateProjectResult,
  EvidenceProjectSummary,
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
