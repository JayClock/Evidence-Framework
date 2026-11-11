import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

/** One local `.evidence/fm` source tree the desktop app can open. */
export interface EvidenceProjectSummary {
  /** Absolute path of the repository or folder holding `.evidence/fm`. */
  rootPath: string;
  /** Absolute path of `.evidence/fm`. */
  modelRoot: string;
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
