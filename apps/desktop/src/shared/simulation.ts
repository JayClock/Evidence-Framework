import type {
  McpDriftAudit,
  McpReplayFrame,
  McpScenarioReplay,
} from '@evidence-poc/evidence-mcp';

/** IPC channels for the simulation sandbox and the drift radar. */
export const EVIDENCE_SIMULATION_IPC_CHANNELS = {
  replay: 'evidence:simulation:replay',
  drift: 'evidence:simulation:drift',
  traceDialog: 'evidence:simulation:trace-dialog',
} as const;

export type EvidenceSimulationIpcChannel =
  (typeof EVIDENCE_SIMULATION_IPC_CHANNELS)[keyof typeof EVIDENCE_SIMULATION_IPC_CHANNELS];

export interface ReplayRequest {
  rootPath: string;
  /** Replay this scenario and return its frames; omit for summaries only. */
  scenarioId?: string;
}

export interface DriftRequest {
  rootPath: string;
  /** Exported OTLP/JSON file to compare with the saved model. */
  tracePath: string;
}

/** What the trace picker returned, so the radar can name the file it read. */
export type TraceDialogResult =
  | { canceled: true }
  | { canceled: false; path: string };

export type { McpDriftAudit, McpReplayFrame, McpScenarioReplay };

/** The simulation surface the renderer may reach. */
export interface EvidenceSimulationApi {
  /** Plays the model's own scenarios back from the saved sources. */
  replay: (input: ReplayRequest) => Promise<McpScenarioReplay>;
  /** Compares one exported trace with the saved model. */
  drift: (input: DriftRequest) => Promise<McpDriftAudit>;
  /** Picks the trace file to audit; the renderer never reads the filesystem. */
  pickTrace: () => Promise<TraceDialogResult>;
}
