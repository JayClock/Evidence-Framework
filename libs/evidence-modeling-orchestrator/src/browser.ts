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
  TRACE_ATTRIBUTE_KEYS,
  readProductionTrace,
  type EvidenceCommit,
  type ProductionTrace,
} from './telemetry/index.js';

export {
  DRIFT_KIND_LABELS,
  auditProductionDrift,
  type ArchitectureDriftFinding,
  type ArchitectureDriftKind,
  type DriftAudit,
} from './sensors/native/driftSensor.js';
