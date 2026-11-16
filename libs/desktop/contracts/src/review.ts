import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type { SensorIssue } from '@evidence-poc/evidence-agent/browser';
import type { WorkbenchData } from '@evidence-poc/evidence-visualization';

export interface PreviewReviewInput {
  rootPath: string;
  /** Immutable copy of the live session; never implicitly saved by a preview. */
  document: DomainModelDocument;
  revision: number;
}
export type PreviewReviewResult =
  | {
      success: true;
      revision: number;
      data: WorkbenchData;
      html: string;
      issues: readonly SensorIssue[];
      notice: string;
    }
  | { success: false; error: string };
