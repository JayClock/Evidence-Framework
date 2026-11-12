import type { EvidenceAgentApi } from './agentIpc';
import type { EvidenceBranchesApi } from './branchApi';
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
  /** Interview lineages: fork, switch and merge model snapshots. */
  branches: EvidenceBranchesApi;
  system: {
    platform: NodeJS.Platform;
  };
}

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
