import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

/** Stable failure reasons a bridge call can report. */
export type EvidenceMcpErrorCode =
  | 'APP_NOT_RUNNING'
  | 'NO_ACTIVE_PROJECT'
  | 'NO_SELECTION'
  | 'NODE_NOT_FOUND'
  | 'SCREENSHOT_FAILED'
  | 'RENDERER_UNAVAILABLE'
  | 'PATCH_REJECTED'
  | 'INTERNAL_ERROR';

export class EvidenceMcpError extends Error {
  readonly code: EvidenceMcpErrorCode;

  constructor(code: EvidenceMcpErrorCode, message: string) {
    super(message);
    this.name = 'EvidenceMcpError';
    this.code = code;
  }
}

/** One sensor finding, projected for external agents. */
export interface McpSensorIssue {
  severity: 'block' | 'warn' | 'info';
  code: string;
  message: string;
  targetNodeId?: string;
  contextRef?: string;
}

export interface McpAppState {
  isRunning: boolean;
  activeProject: {
    rootPath: string;
    modelRoot: string;
    modelId: string;
    modelVersion: string;
    documentRevision: number;
  } | null;
  selection: {
    nodeId: string | null;
    attributeName: string | null;
  } | null;
  sensorsSummary: {
    blockCount: number;
    warnCount: number;
    decisionOwedCount: number;
    isStageGateReady: boolean;
  } | null;
  mcp: {
    connections: number;
    calls: number;
  };
}

export interface McpDomainModel {
  document: DomainModelDocument;
  summary: {
    contracts: number;
    fulfillments: number;
    entities: number;
    rules: number;
  };
}

export interface McpSelectedEntity {
  entity: unknown;
  context: unknown | null;
  incomingRelations: readonly unknown[];
  outgoingRelations: readonly unknown[];
  derivationRules: readonly unknown[];
  fulfillmentPair: {
    request: unknown;
    confirmations: readonly unknown[];
    completionRules: readonly unknown[];
    breachRules: readonly unknown[];
  } | null;
}

export interface McpKeyDataAudit {
  producedBy: 'native' | 'unavailable';
  keyDataCount: number;
  counts: Readonly<Record<string, number>>;
  needsDecision: readonly unknown[];
  derived: readonly unknown[];
  note: string;
}

export interface McpScreenshot {
  nodeId: string | null;
  width: number;
  height: number;
  mimeType: 'image/png';
  /** Base64 PNG captured without editor chrome. */
  data: string;
}

export interface McpPatchInput {
  rationale: string;
  commands: readonly unknown[];
}

export interface McpPatchResult {
  success: boolean;
  appliedCommands: readonly string[];
  revision: number;
  undoable: boolean;
  diagnostics: readonly McpSensorIssue[];
  error?: string;
}

/** The services a model splits into, and what crosses their boundaries. */
export interface McpDeliveryTopology {
  modelId: string;
  modelName: string;
  modelVersion: string;
  services: readonly {
    id: string;
    name: string;
    kind: 'channel' | 'fulfillment' | 'domain' | 'capability';
    contextRef: string;
    supplies: readonly string[];
    consumes: readonly string[];
    routeCount: number;
  }[];
  links: readonly {
    from: string;
    to: string;
    kind: string;
    mode: string;
    label: string;
  }[];
  limitations: readonly string[];
}

/** The OpenAPI 3.1 document the model implies, plus where it came from. */
export interface McpOpenApiContract {
  modelId: string;
  modelVersion: string;
  pathCount: number;
  document: unknown;
  limitations: readonly string[];
}

/** One step of a scenario played back, reduced to what an agent reads. */
export interface McpReplayFrame {
  sequence: number;
  actingRoleRef: string;
  instanceRef: string;
  entityRef: string;
  /** Business time the issued Evidence carries, when it declares one. */
  at: string | null;
  derivations: readonly {
    ruleRef: string;
    target: string | null;
    result: unknown;
  }[];
  checkpoints: readonly {
    ruleRef: string;
    actual: unknown;
    passed: boolean;
  }[];
  fulfillmentStates: readonly {
    requestInstanceRef: string;
    status: string;
  }[];
}

/** A replay of the model's own scenarios, projected for external agents. */
export interface McpScenarioReplay {
  modelId: string;
  passed: boolean;
  scenarios: readonly {
    scenarioId: string;
    label: string;
    stepCount: number;
    checkpointCount: number;
    passed: boolean;
    errors: readonly string[];
  }[];
  /** Frames of the scenario that was asked for; empty when none was named. */
  frames: readonly McpReplayFrame[];
  errors: readonly string[];
}

/** One production/shape disagreement, projected for external agents. */
export interface McpDriftFinding {
  kind: string;
  severity: 'block' | 'warn';
  message: string;
  evidenceRef: string | null;
  contextRef: string | null;
  remediation: string;
}

/** The drift audit between one exported trace and the saved model. */
export interface McpDriftAudit {
  modelId: string;
  spanCount: number;
  commitCount: number;
  counts: Readonly<Record<string, number>>;
  findings: readonly McpDriftFinding[];
  passed: boolean;
  errors: readonly string[];
}

export interface McpStageGateResult {
  passed: boolean;
  exitCode: number;
  driftDetected: boolean;
  blockingReasons: readonly string[];
}

/** Requests the stdio server sends across the local bridge. */
export type EvidenceMcpAppRequest =
  | { method: 'get_app_state' }
  | {
      method: 'get_domain_model';
      contextRef?: string;
      includeRules?: boolean;
    }
  | { method: 'get_selected_entity' }
  | { method: 'get_key_data_audit' }
  | { method: 'get_canvas_screenshot'; targetNodeId?: string }
  | { method: 'apply_model_patch'; patch: McpPatchInput }
  | { method: 'run_stage_gate'; target: 'api' | 'visualization' }
  | { method: 'get_delivery_topology' }
  | { method: 'export_openapi_contract' }
  | { method: 'run_scenario_replay'; scenarioId?: string }
  | { method: 'audit_production_drift'; document: unknown };

export type EvidenceMcpAppResult =
  | McpAppState
  | McpDomainModel
  | McpSelectedEntity
  | McpKeyDataAudit
  | McpScreenshot
  | McpPatchResult
  | McpStageGateResult
  | McpDeliveryTopology
  | McpOpenApiContract
  | McpScenarioReplay
  | McpDriftAudit;

/**
 * What every MCP tool needs from the desktop.
 *
 * The stdio server talks to this through the local socket; the desktop main
 * process can also implement it in-process, which keeps the tools honest about
 * the data they expose.
 */
export interface EvidenceMcpAppClient {
  getAppState(): Promise<McpAppState>;
  getDomainModel(input: {
    contextRef?: string;
    includeRules?: boolean;
  }): Promise<McpDomainModel>;
  getSelectedEntity(): Promise<McpSelectedEntity>;
  getKeyDataAudit(): Promise<McpKeyDataAudit>;
  getScreenshot(input: { targetNodeId?: string }): Promise<McpScreenshot>;
  applyModelPatch(patch: McpPatchInput): Promise<McpPatchResult>;
  runStageGate(input: {
    target: 'api' | 'visualization';
  }): Promise<McpStageGateResult>;
  /** Services, boundary crossings and open questions, from the saved model. */
  getDeliveryTopology(): Promise<McpDeliveryTopology>;
  /** The OpenAPI 3.1 contract the saved model implies. */
  exportOpenApiContract(): Promise<McpOpenApiContract>;
  /** Plays the model's own scenarios back, step by step. */
  runScenarioReplay(input: { scenarioId?: string }): Promise<McpScenarioReplay>;
  /** Compares an exported production trace with the saved model. */
  auditProductionDrift(input: { document: unknown }): Promise<McpDriftAudit>;
}

export const MCP_SERVER_NAME = 'evidence-desktop';
export const MCP_SERVER_VERSION = '0.1.0';
