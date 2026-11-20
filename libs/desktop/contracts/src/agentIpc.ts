import type { JsonPatchOperation } from '@evidence-poc/evidence-schema';
import type { LiveDeliveryInput } from './delivery.js';
import type {
  AgentStreamEvent,
  CanvasContext,
  ModelPatchRequest,
  ModelPatchResult,
  SensorReport,
} from '@evidence-poc/evidence-agent';

/**
 * IPC channels shared by the main process, the preload bridge and the renderer.
 *
 * The renderer never runs a model inference. The main process commits AI
 * edits and publishes history entries for the renderer to replay.
 */
export const EVIDENCE_AGENT_IPC_CHANNELS = {
  prompt: 'evidence:agent:prompt',
  steer: 'evidence:agent:steer',
  abort: 'evidence:agent:abort',
  events: 'evidence:agent:events',
  patchCommitted: 'evidence:agent:patch-committed',
  canvasContext: 'evidence:agent:canvas-context',
  triggerSensors: 'evidence:sensor:trigger',
  modelChanged: 'evidence:sensor:model-changed',
  latestReport: 'evidence:sensor:latest',
  report: 'evidence:sensor:report',
} as const;

export type EvidenceAgentIpcChannel =
  (typeof EVIDENCE_AGENT_IPC_CHANNELS)[keyof typeof EVIDENCE_AGENT_IPC_CHANNELS];

/** Every call carries the project root so the main process can key its runtimes. */
export interface AgentProjectInput {
  rootPath: string;
}

/** An explicit null node starts a canvas-wide turn without inheriting selection. */
export type AgentTurnFocus =
  | { nodeId: null; inquiry?: never }
  | {
      nodeId: string;
      /** Opening a sourcing or What-If question is a read-only turn. */
      inquiry?: 'trace' | 'what-if';
    };

export interface AgentSteerInput extends AgentProjectInput {
  text: string;
}

export interface AgentPromptInput extends AgentSteerInput {
  focus?: AgentTurnFocus;
  /** The editor's last published document revision. */
  revision?: number;
  editorId?: string;
}

export type LiveModelInput = LiveDeliveryInput & { editorId: string };

export type AgentActionResult =
  | { success: true }
  | { success: false; error: string };

export interface AgentSteerResult {
  success: true;
  disposition: 'handled' | 'queued';
}

export type AgentSteerOutcome =
  | AgentSteerResult
  | { success: false; error: string };

export interface PatchTransaction {
  readonly id: string;
  readonly baseRevision: number;
  readonly revision: number;
  readonly rationale: string;
  readonly commands: readonly string[];
  readonly patches: readonly JsonPatchOperation[];
  readonly inversePatches: readonly JsonPatchOperation[];
}

export interface PatchCommittedPayload {
  readonly rootPath: string;
  readonly editorId: string;
  readonly transaction: PatchTransaction;
}

/** On settlement, replay committed events if the renderer missed any live broadcasts. */
export type AgentPromptResult = AgentActionResult & {
  transactions?: readonly PatchTransaction[];
};

export interface AgentEventPayload {
  rootPath: string;
  event: AgentStreamEvent;
}

export interface SensorReportPayload {
  rootPath: string;
  report: SensorReport;
}

export interface SensorTriggerInput extends AgentProjectInput {
  /** Context IDs to completeness-check; omitted means consistency only. */
  scopeRefs?: readonly string[];
}

export interface CanvasContextRegistration {
  rootPath: string;
  context: CanvasContext;
}

/** The agent surface the renderer may reach. */
export interface EvidenceAgentApi {
  prompt: (input: AgentPromptInput) => Promise<AgentPromptResult>;
  steer: (input: AgentSteerInput) => Promise<AgentSteerOutcome>;
  abort: (input: AgentProjectInput) => Promise<AgentActionResult>;
  triggerSensors: (input: SensorTriggerInput) => Promise<SensorReport>;
  /** Fires on every model edit; the main process debounces the sensor run. */
  notifyModelChanged: (input: LiveModelInput) => Promise<void>;
  latestReport: (input: AgentProjectInput) => Promise<SensorReport | null>;
  /** Publishes the current selection so tools can read it. */
  publishCanvasContext: (input: CanvasContextRegistration) => Promise<void>;
  /** Subscribes to streamed agent activity; returns an unsubscribe. */
  onEvent: (listener: (payload: AgentEventPayload) => void) => () => void;
  /** Subscribes to sensor verdicts; returns an unsubscribe. */
  onReport: (listener: (payload: SensorReportPayload) => void) => () => void;
  onPatchCommitted: (
    listener: (payload: PatchCommittedPayload) => void,
  ) => () => void;
}

export type {
  AgentStreamEvent,
  CanvasContext,
  ModelPatchRequest,
  ModelPatchResult,
  SensorReport,
};
