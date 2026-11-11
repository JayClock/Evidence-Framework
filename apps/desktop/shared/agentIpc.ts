import type { AgentStreamEvent } from '@evidence-poc/evidence-agent-core';
import type {
  CanvasContext,
  ModelPatchRequest,
  ModelPatchResult,
  SensorReport,
} from '@evidence-poc/evidence-modeling-orchestrator';

/**
 * IPC channels shared by the main process, the preload bridge and the renderer.
 *
 * The renderer never runs Python or a model: it asks, the main process works, and
 * patches come back for `ModelSession` to apply so undo keeps covering agent edits.
 */
export const EVIDENCE_AGENT_IPC_CHANNELS = {
  prompt: 'evidence:agent:prompt',
  steer: 'evidence:agent:steer',
  abort: 'evidence:agent:abort',
  events: 'evidence:agent:events',
  applyPatch: 'evidence:agent:apply-patch',
  applyPatchResult: 'evidence:agent:apply-patch-result',
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

export interface AgentPromptInput extends AgentProjectInput {
  text: string;
}

export type AgentSteerInput = AgentPromptInput;

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

/** Main asks the renderer to apply a patch through its live `ModelSession`. */
export interface ApplyPatchRequest {
  requestId: string;
  patch: ModelPatchRequest;
}

export interface ApplyPatchResponse {
  requestId: string;
  result: ModelPatchResult;
}

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
  prompt: (input: AgentPromptInput) => Promise<AgentActionResult>;
  steer: (input: AgentSteerInput) => Promise<AgentSteerOutcome>;
  abort: (input: AgentProjectInput) => Promise<AgentActionResult>;
  triggerSensors: (input: SensorTriggerInput) => Promise<SensorReport>;
  /** Fires on every model edit; the main process debounces the sensor run. */
  notifyModelChanged: (input: AgentProjectInput) => Promise<void>;
  latestReport: (input: AgentProjectInput) => Promise<SensorReport | null>;
  /** Publishes the current selection so tools can read it. */
  publishCanvasContext: (input: CanvasContextRegistration) => Promise<void>;
  /** Subscribes to streamed agent activity; returns an unsubscribe. */
  onEvent: (listener: (payload: AgentEventPayload) => void) => () => void;
  /** Subscribes to sensor verdicts; returns an unsubscribe. */
  onReport: (listener: (payload: SensorReportPayload) => void) => () => void;
  /** Applies agent patches to the live session; returns an unsubscribe. */
  onApplyPatch: (listener: (request: ApplyPatchRequest) => void) => () => void;
  /** Answers one `onApplyPatch` request. */
  respondPatch: (response: ApplyPatchResponse) => void;
}

export type {
  AgentStreamEvent,
  CanvasContext,
  ModelPatchRequest,
  ModelPatchResult,
  SensorReport,
};
