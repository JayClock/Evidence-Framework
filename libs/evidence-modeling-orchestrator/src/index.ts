export {
  buildSensorReport,
  driftIssues,
  finalizeSensorReport,
  fmCheckIssues,
  keyDataSummaryOf,
  stageGateSummaryOf,
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

export {
  TRACE_ATTRIBUTE_KEYS,
  readProductionTrace,
  type EvidenceCommit,
  type ProductionTrace,
} from './telemetry/index.js';
