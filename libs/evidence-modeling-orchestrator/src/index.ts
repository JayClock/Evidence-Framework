export {
  buildSensorReport,
  finalizeSensorReport,
  fmCheckIssues,
  keyDataSummaryOf,
  stageGateSummaryOf,
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
