import type {
  ClauseAnnotation,
  DomainModelDocument,
  IngestionDraft,
} from '@evidence-poc/evidence-schema';

import type {
  EvidenceProjectSummary,
  ProjectStorageKind,
} from './projects';

/**
 * Which reader produced a draft.
 *
 * The review panel says so out loud, because "a model read this" and "the
 * built-in vocabulary matched this" carry different promises about quality.
 */
export const INGESTION_READERS = [
  'blueprint',
  'contract',
  'text-rules',
  'text-model',
] as const;

export type IngestionReader = (typeof INGESTION_READERS)[number];

export const INGESTION_INPUT_KINDS = ['contract', 'text', 'blueprint'] as const;

export type IngestionInputKind = (typeof INGESTION_INPUT_KINDS)[number];

export interface IngestDraftInput {
  kind: IngestionInputKind;
  /** The business text or the blueprint table, verbatim. */
  content: string;
  /** Manifest name the caller already has; the reader may propose its own. */
  modelName?: string;
  /** Table dialect, only meaningful for `blueprint`. */
  format?: 'markdown' | 'csv' | 'auto';
}

export type IngestDraftResult =
  | {
      success: true;
      draft: IngestionDraft;
      reader: IngestionReader;
      /** Gaps the reader noticed; the review panel shows them as findings. */
      issues: readonly string[];
      /**
       * How a contract was split before it was read.
       *
       * Only the contract reader produces it: the panel shows which clauses
       * became evidence, which became domain components and which were filtered
       * out, because a clause silently dropped is the failure mode a reviewer
       * most needs to catch.
       */
      annotations?: readonly ClauseAnnotation[];
    }
  | { success: false; error: string; issues: readonly string[] };

export interface CompileDraftInput {
  draft: IngestionDraft;
  /** Folder of the new source tree, or the bundle file path. */
  targetPath: string;
  name: string;
  modelId?: string;
  kind: ProjectStorageKind;
}

export interface CompileDraftResult {
  success: true;
  project: EvidenceProjectSummary;
  document: DomainModelDocument;
  /** Canvas slot per entity id, so the first paint needs no layout pass. */
  layout: Readonly<Record<string, { x: number; y: number }>>;
  /** What the compiler refused to write, and why. */
  issues: readonly string[];
}

export type CompileDraftOutcome =
  | CompileDraftResult
  | { success: false; error: string; issues: readonly string[] };
