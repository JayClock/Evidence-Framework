// ─── Incremental business story projection ─────────────────────────────────
export {
  createFlowStoryProjector,
  type FlowStoryProjector,
  type FlowStoryProjectorOptions,
} from './story/flowStoryProjector.js';
export {
  createStoryAgent,
  type StoryAgentOptions,
} from './story/storyAgent.js';
export { StorySceneCache } from './story/storyCache.js';
export {
  simulateWhatIf,
  type WhatIfSimulatorOptions,
} from './story/whatIfSimulator.js';
export {
  STORY_SYSTEM_PROMPT,
  WHAT_IF_EXPLANATION_PROMPT,
  WHAT_IF_EXTRACTION_PROMPT,
} from './story/prompts.js';
export type {
  BusinessStoryProjection,
  DocumentCardField,
  StoryAgent,
  StoryScene,
  WhatIfHypothesis,
  WhatIfInput,
  WhatIfResult,
  WhatIfRuleOutcome,
} from './story/types.js';

// ─── Agent session and prompts ───────────────────────────────────────────
export {
  EVIDENCE_INSTRUCTIONS,
  EVIDENCE_SYSTEM_PROMPT,
  INGESTION_EXAMPLES,
  INGESTION_PROMPT,
  MODELING_PROMPT,
  ROLE_PROMPT,
  SOURCING_PROMPT,
  STORMING_PROMPT,
  WHAT_IF_PROMPT,
  WORKFLOW_PROMPT,
  buildIngestionPrompt,
} from './prompts/index.js';

export {
  createEvidenceAgentSession,
  loadPiSdkPort,
  type EvidenceAgentSession,
  type EvidenceAgentSessionOptions,
  type EvidenceModelOptions,
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

// ─── Sensors and stage gate ───────────────────────────────────────────────
export {
  checkNativeApiSensor,
  type ApiSensorInput,
  type ApiSensorOutcome,
} from './sensors/native/nativeApiSensor.js';

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

export {
  createSensorsEngine,
  type RunSensorsInput,
  type SensorOutcome,
  type SensorsEngine,
  type SensorsEngineOptions,
  type StageGateInput,
} from './sensors/sensorsEngine.js';

export {
  ModelSourceError,
  checkNativeStageGate,
  filterFmCheckErrors,
  isGateReadyReport,
  loadModelSources,
  runNativeFmCheck,
  runNativeKeyDataAudit,
  runNativeSensors,
  type ModelSources,
  type NativeFmCheckOptions,
  type NativeFmCheckOutcome,
  type NativeSensorsInput,
  type NativeSensorsOutcome,
  type StageGateInput as NativeStageGateInput,
} from './sensors/native/index.js';
