import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type {
  ApiModelDiffResult,
  DeliveryContract,
  DeliveryField,
} from '@evidence-poc/evidence-api';
import type {
  ApiCoverageSummary,
  SensorIssue,
} from '@evidence-poc/evidence-agent/browser';
import type { DeliveryPreview } from './projects';

/** The baseline is the document at editor open; save does not silently accept changes. */
export interface LiveDeliveryInput {
  rootPath: string;
  revision: number;
  document: DomainModelDocument;
  baseDocument: DomainModelDocument;
}

export interface LiveRouteBinding {
  id: string;
  entityRef: string;
  method: string;
  path: string;
  roleRefs: readonly string[];
  exposure: 'internal' | 'external';
  fields: readonly DeliveryField[];
}

export interface LiveDeliveryPreview {
  revision: number;
  modelDigest: string;
  baseModelDigest: string;
  preview: DeliveryPreview;
  /**
   * The same document the export writes, so the contract rail reads the exact
   * revision the diff beside it describes instead of re-projecting locally.
   */
  openapi: DeliveryContract;
  diff: ApiModelDiffResult;
  changeLog: string;
  apiSummary: ApiCoverageSummary;
  issues: readonly SensorIssue[];
  bindings: readonly LiveRouteBinding[];
  canExportDraft: boolean;
}

export type LiveDeliveryResult =
  | { success: true; analysis: LiveDeliveryPreview }
  | { success: false; revision: number; error: string };

export interface ExportLiveDeliveryInput extends LiveDeliveryInput {
  /** Ensures export is the exact document previewed, not a fresh disk read. */
  expectedModelDigest: string;
}
