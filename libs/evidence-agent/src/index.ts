// ─── Agent session, prompts and governance ────────────────────────────────
export { GOVERNANCE_PROMPT } from './prompts/governance.js';

export {
  GOVERNANCE_INSTRUCTIONS,
  GOVERNANCE_SYSTEM_PROMPT,
} from './prompts/index.js';

export {
  decideGovernance,
  type GovernanceAction,
  type GovernanceActionKind,
  type GovernanceDecision,
  type GovernanceDrift,
  type GovernanceSimulation,
  type GovernanceVerdict,
} from './governance/governanceLoop.js';

export {
  EVIDENCE_INSTRUCTIONS,
  EVIDENCE_SYSTEM_PROMPT,
  INGESTION_EXAMPLES,
  INGESTION_PROMPT,
  MODELING_PROMPT,
  OPERATOR_PROMPT,
  ROLE_PROMPT,
  WORKFLOW_PROMPT,
  buildIngestionPrompt,
} from './prompts/index.js';

export {
  createEvidenceAgentSession,
  loadPiSdkPort,
  type EvidenceAgentSession,
  type EvidenceAgentSessionOptions,
  type PiSdkPort,
} from './session/evidenceAgentSession.js';

export {
  SessionForkError,
  forkSessionLines,
  type SessionForkErrorCode,
  type SessionForkOptions,
  type SessionForkResult,
} from './session/sessionFork.js';

export {
  projectSessionEvent,
  type AgentStreamEvent,
} from './session/streamEvents.js';

// ─── Tools the agent calls back into ──────────────────────────────────────
export {
  TOOL_NAMES,
  createEvidenceToolsExtension,
  evidenceToolNames,
  type CanvasContext,
  type EvidenceToolDefinition,
  type EvidenceToolsHandlers,
  type ModelPatchRequest,
  type ModelPatchResult,
} from './tools/evidenceTools.js';

export {
  TRACE_ATTRIBUTE_KEYS,
  readProductionTrace,
  type EvidenceCommit,
  type ProductionTrace,
} from './telemetry/index.js';

// ─── Sensors, stage gate and drift audits ─────────────────────────────────
export {
  checkNativeApiSensor,
  type ApiSensorInput,
  type ApiSensorOutcome,
} from './sensors/native/nativeApiSensor.js';

export {
  buildSensorReport,
  driftIssues,
  finalizeSensorReport,
  fmCheckIssues,
  keyDataSummaryOf,
  stageGateSummaryOf,
  type ApiCoverageSummary,
  type DriftAuditReport,
  type FmCheckReport,
  type KeyDataAuditReport,
  type KeyDataDecision,
  type KeyDataSummary,
  type SensorIssue,
  type SensorReport,
  type SensorSeverity,
  type SensorSource,
  type StageGateReport,
  type StageGateSummary,
} from './sensors/sensorReport.js';

export {
  createSensorsEngine,
  type RunSensorsInput,
  type SensorOutcome,
  type SensorsEngine,
  type SensorsEngineOptions,
  type StageGateInput,
} from './sensors/sensorsEngine.js';

export {
  DRIFT_KIND_LABELS,
  auditProductionDrift,
  type ArchitectureDriftFinding,
  type ArchitectureDriftKind,
  type DriftAudit,
} from './sensors/native/driftSensor.js';

export {
  runNativeDriftAudit,
  type NativeDriftInput,
} from './sensors/native/nativeDriftAudit.js';

export {
  ModelSourceError,
  checkNativeStageGate,
  filterFmCheckErrors,
  isGateReadyReport,
  loadModelSources,
  runNativeFmCheck,
  runNativeKeyDataAudit,
  runNativeSensors,
  scenarioResultsOf,
  type ModelSources,
  type NativeFmCheckOptions,
  type NativeFmCheckOutcome,
  type NativeSensorsInput,
  type NativeSensorsOutcome,
  type StageGateInput as NativeStageGateInput,
} from './sensors/native/index.js';
