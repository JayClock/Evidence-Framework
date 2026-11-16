import type { McpDriftAudit } from '@evidence-poc/evidence-mcp';

/** IPC channels for the production drift radar. */
export const EVIDENCE_DRIFT_IPC_CHANNELS = {
  drift: 'evidence:drift:drift',
  traceDialog: 'evidence:drift:trace-dialog',
} as const;

export type EvidenceDriftIpcChannel =
  (typeof EVIDENCE_DRIFT_IPC_CHANNELS)[keyof typeof EVIDENCE_DRIFT_IPC_CHANNELS];

export interface DriftRequest {
  rootPath: string;
  /** Exported OTLP/JSON file to compare with the saved model. */
  tracePath: string;
}

/** What the trace picker returned, so the radar can name the file it read. */
export type TraceDialogResult =
  | { canceled: true }
  | { canceled: false; path: string };

export type { McpDriftAudit };

/** The production drift surface the renderer may reach. */
export interface EvidenceDriftApi {
  /** Compares one exported trace with the saved model. */
  drift: (input: DriftRequest) => Promise<McpDriftAudit>;
  /** Picks the trace file to audit; the renderer never reads the filesystem. */
  pickTrace: () => Promise<TraceDialogResult>;
}
