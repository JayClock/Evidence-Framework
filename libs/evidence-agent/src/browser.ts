export {
  buildSensorReport,
  finalizeSensorReport,
  fmCheckIssues,
  keyDataSummaryOf,
  stageGateSummaryOf,
  type ApiCoverageSummary,
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

/**
 * The projected agent event stream the renderer draws from. Type-only: the
 * session harness behind it stays in the process entry (`.`).
 */
export type { AgentStreamEvent } from './session/streamEvents.js';

// Story DTOs are safe to consume without loading the Node agent runtime.
export type { StoryScene, WhatIfResult } from './story/types.js';
