import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

/** One local model source the desktop app can open. */
export interface EvidenceProjectSummary {
  /**
   * Absolute path of the repository or folder holding `.evidence/fm`, or of the
   * single `*.evidence.json` bundle when `kind` is `'file'`.
   */
  rootPath: string;
  /**
   * Absolute path of `.evidence/fm`, or of the bundle file itself.
   *
   * Scripts and MCP tools read this path, so a bundle and a tree are
   * interchangeable as long as the reader accepts both.
   */
  modelRoot: string;
  /** Which source form `rootPath` names; older entries default to a tree. */
  kind?: 'directory' | 'file';
  name: string;
  modelId: string;
  modelVersion: string;
  entityCount: number;
  relationshipCount: number;
  ruleCount: number;
  lastOpenedAt: string;
}

/** Parse or FM check finding surfaced next to the dashboard entry. */
export interface ProjectSourceIssue {
  path: string;
  message: string;
  code?: string;
}

export type OpenProjectResult =
  | {
      success: true;
      project: EvidenceProjectSummary;
      document: DomainModelDocument;
      issues: readonly ProjectSourceIssue[];
    }
  | { success: false; error: string };

export type SaveProjectResult =
  | {
      success: true;
      written: readonly string[];
      unchanged: readonly string[];
      removed: readonly string[];
      savedAt: string;
    }
  | { success: false; error: string };

export type RecentProjectsResult =
  | { success: true; projects: readonly EvidenceProjectSummary[] }
  | { success: false; error: string };

export type OpenProjectDialogResult =
  | { success: true; rootPath: string }
  | { success: false; canceled: true }
  | { success: false; canceled?: false; error: string };

/** Emitted when `.evidence/fm` changes outside the app (git, scripts, agent). */
export interface ProjectChangedEvent {
  rootPath: string;
  changedAt: string;
  paths: readonly string[];
}

export interface SaveProjectInput {
  rootPath: string;
  document: DomainModelDocument;
}

/** What the review page contained, echoed back so the app can confirm it. */
export interface ReviewPageCounts {
  contracts: number;
  entities: number;
  rules: number;
  scenarios: number;
  capabilities: number;
}

export type ExportReviewResult =
  | { status: 'saved'; path: string; counts: ReviewPageCounts }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

/**
 * Starter models a new project can be seeded with.
 *
 * Every id but `blank` ships a complete, statically valid `.evidence/fm` tree so
 * a first-time reader sees Contracts, Fulfillment pairs and Evidence instead of
 * an empty canvas.
 */
export type ProjectTemplateId =
  | 'blank'
  | 'procurement'
  | 'subscription'
  | 'service_blueprint';

/** What the dashboard shows on a template card. */
export interface ProjectTemplateMeta {
  id: ProjectTemplateId;
  name: string;
  description: string;
  /** Short provenance line, e.g. the lecture case the starter replays. */
  source: string;
  entityCount: number;
  relationshipCount: number;
  ruleCount: number;
}

/** Where the new model is written: a source tree or a single bundle file. */
export type ProjectStorageKind = 'directory' | 'file';

export interface CreateProjectInput {
  /** Absolute folder of the source tree, or the absolute bundle file path. */
  targetPath: string;
  /** Manifest name, used as the project label. */
  name: string;
  /** Manifest id; derived from the name when the caller omits it. */
  modelId?: string;
  templateId?: ProjectTemplateId;
  kind?: ProjectStorageKind;
}

export type CreateProjectResult =
  | {
      success: true;
      project: EvidenceProjectSummary;
      document: DomainModelDocument;
    }
  | { success: false; error: string };

/** What the create dialog needs to pick a destination. */
export interface CreateProjectDialogInput {
  kind: ProjectStorageKind;
  /** Baseline file name the save dialog starts from. */
  suggestedName?: string;
}

export type CreateProjectDialogResult =
  | { success: true; targetPath: string; kind: ProjectStorageKind }
  | { success: false; canceled: true }
  | { success: false; canceled?: false; error: string };

export type ProjectTemplatesResult =
  | { success: true; templates: readonly ProjectTemplateMeta[] }
  | { success: false; error: string };
