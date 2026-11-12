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
  | { method: 'run_stage_gate'; target: 'api' | 'visualization' };

export type EvidenceMcpAppResult =
  | McpAppState
  | McpDomainModel
  | McpSelectedEntity
  | McpKeyDataAudit
  | McpScreenshot
  | McpPatchResult
  | McpStageGateResult;

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
}

export const MCP_SERVER_NAME = 'evidence-desktop';
export const MCP_SERVER_VERSION = '0.1.0';
