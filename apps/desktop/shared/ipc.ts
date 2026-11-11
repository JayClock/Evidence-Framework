import type { EvidenceAgentApi } from './agentIpc';
import type { EvidenceMcpApi } from './mcpIpc';
import type {
  EvidenceProjectSummary,
  OpenProjectDialogResult,
  OpenProjectResult,
  ProjectChangedEvent,
  RecentProjectsResult,
  SaveProjectInput,
  SaveProjectResult,
} from './projects';

/** IPC channels shared by the main process and the preload bridge. */
export const EVIDENCE_IPC_CHANNELS = {
  showOpenDialog: 'evidence:project:show-open-dialog',
  open: 'evidence:project:open',
  save: 'evidence:project:save',
  recent: 'evidence:project:recent',
  openEditorWindow: 'evidence:project:open-editor-window',
  changed: 'evidence:project:changed',
} as const;

export type EvidenceIpcChannel =
  (typeof EVIDENCE_IPC_CHANNELS)[keyof typeof EVIDENCE_IPC_CHANNELS];

/** The only surface the renderer can reach: no `ipcRenderer`, no `fs`. */
export interface EvidenceDesktopApi {
  projects: {
    showOpenDialog: () => Promise<OpenProjectDialogResult>;
    open: (rootPath: string) => Promise<OpenProjectResult>;
    save: (input: SaveProjectInput) => Promise<SaveProjectResult>;
    listRecent: () => Promise<RecentProjectsResult>;
    /** Opens (or focuses) the model workspace window for a project root. */
    openEditorWindow: (rootPath: string) => Promise<void>;
    /** Subscribes to external `.evidence/fm` changes; returns an unsubscribe. */
    onChanged: (listener: (event: ProjectChangedEvent) => void) => () => void;
  };
  /** Pi agent, sensors and patch application (phase 3). */
  agent: EvidenceAgentApi;
  /** MCP bridge status and the renderer side of external tool calls (phase 4). */
  mcp: EvidenceMcpApi;
  system: {
    platform: NodeJS.Platform;
  };
}

export type {
  EvidenceProjectSummary,
  OpenProjectDialogResult,
  OpenProjectResult,
  ProjectChangedEvent,
  RecentProjectsResult,
  SaveProjectInput,
  SaveProjectResult,
};
