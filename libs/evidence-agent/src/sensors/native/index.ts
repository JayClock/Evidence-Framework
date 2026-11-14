export {
  ModelSourceError,
  loadModelSources,
  runNativeFmCheck,
  type ModelSources,
  type NativeFmCheckOptions,
  type NativeFmCheckOutcome,
} from './modelSources.js';

export { runNativeKeyDataAudit } from './nativeKeyDataAudit.js';

export {
  DRIFT_KIND_LABELS,
  auditProductionDrift,
  type ArchitectureDriftFinding,
  type ArchitectureDriftKind,
  type DriftAudit,
} from './driftSensor.js';

export {
  runNativeDriftAudit,
  type NativeDriftInput,
} from './nativeDriftAudit.js';

export {
  checkNativeStageGate,
  filterFmCheckErrors,
  isGateReadyReport,
  type StageGateInput,
} from './nativeStageGate.js';

export {
  runNativeSensors,
  scenarioResultsOf,
  type NativeSensorsInput,
  type NativeSensorsOutcome,
} from './nativeSensors.js';
