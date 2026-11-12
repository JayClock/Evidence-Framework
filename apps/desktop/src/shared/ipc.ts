import type { EvidenceAgentApi } from './agentIpc';
import type {
  CompileDraftInput,
  CompileDraftOutcome,
  IngestDraftInput,
  IngestDraftResult,
} from './ingestion';
import type { EvidenceMcpApi } from './mcpIpc';
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
  exportReview: 'evidence:project:export-review',
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
    exportReview: (rootPath: string) => Promise<ExportReviewResult>;
  };
  /** Pi agent, sensors and patch application (phase 3). */
  agent: EvidenceAgentApi;
  /** MCP bridge status and the renderer side of external tool calls (phase 4). */
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
} from './ingestion';

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
