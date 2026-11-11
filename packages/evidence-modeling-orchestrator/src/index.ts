export {
  CLOSURE_PREFIXES,
  calculateFrontier,
  type DependencyFrontier,
  type FrontierDependencyGap,
  type InterviewTraceDocument,
  type InterviewTraceRecord,
  type OpenQuestion,
  type TraceQuestion,
} from './discovery/frontierTracker.js';

export {
  compareSensorReports,
  type VerdictDiff,
  type VerdictSnapshot,
} from './diff/verdictDiff.js';

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
  SensorScriptError,
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
