export {
  scenarioExamples,
  cloneScenarioExamples,
  replaceScenarioExamples,
  evaluateScenario,
  type ScenarioExample,
  type ScenarioEvaluation,
} from './scenario/scenarioStudio.js';
export * from './ingestion/index.js';
export {
  translateBusinessFormula,
  replaceBusinessFormulaToken,
  type BusinessFormula,
  type BusinessFormulaToken,
} from './cel/celFormulaTranslator.js';
export {
  evaluateRuleOnExample,
  type ExampleRuleInputs,
} from './cel/transientSandbox.js';

export { timeoutExpressionFor } from './model/fulfillmentTime.js';
export {
  createDomainGraph,
  type ClassifiedConfirmation,
  type DomainGraph,
  type FulfillmentPair,
} from './model/graph.js';

export * from './mutations/index.js';
export {
  applyModelPatches,
  createModelPatch,
  toJsonPatches,
} from './session/jsonPatches.js';
export type {
  HistoryEntry,
  ModelRecipe,
  ModelSelection,
  ModelSessionEvent,
} from './session/types.js';

export {
  diffDomainModels,
  type AttributeDiff,
  type DiffChangeType,
  type EntityDiff,
  type KeyDataDiff,
  type ModelDiff,
  type ModelDiffSummary,
  type RelationshipDiff,
  type RuleDiff,
} from './diff/modelDiff.js';

export {
  buildKeyDataLedger,
  keyDataEntryOf,
  type KeyDataEntry,
  type KeyDataLedger,
  type KeyDataProvider,
} from './keyData/keyDataLedger.js';

export {
  analyzeCelExpression,
  type CelAnalysis,
  type CelCandidate,
  type CelDiagnostic,
  type CelDiagnosticCode,
} from './cel/celAnalysis.js';

export {
  celValueToJson,
  compileCelExpression,
  evaluateCelExpression,
  type CompiledCel,
} from './cel/celEvaluator.js';

export {
  aliasFor,
  bindingsForAliases,
  collectCelCandidates,
  derivationRuleOf,
} from './cel/celCandidates.js';

export {
  ModelSessionValidationError,
  createModelSession,
  type ModelSession,
  type ModelSessionOptions,
} from './session/createModelSession.js';

export {
  MODEL_MANIFEST_PATH,
  MODEL_VERSION_ISSUE_CODE,
  MODEL_NON_SOURCE_TREES,
  MODEL_SOURCE_TREES,
  modelSourcePaths,
  parseModelSourceFiles,
  serializeDomainModel,
  stringifyModelJson,
  type ModelSourceFile,
  type ModelSourceIssue,
  type ModelSourceParseResult,
  type ParseOptions,
  type SerializeOptions,
} from './adapters/modelSourceFiles.js';

export {
  isTimestampText,
  jsonValuesEqual,
  normalizeJsonValue,
  validateTypedValue,
} from './validation/typedValues.js';

export { digestOf } from './validation/modelDigest.js';

export {
  collectFlowScenarios,
  computeStepHash,
  FlowScenarioError,
  type FlowScenarioErrorCode,
} from './trace/flowAggregator.js';
export type {
  FlowScenarioTrace,
  FlowStepTrace,
  StepFingerprintInput,
} from './trace/types.js';

export {
  compiledDocument,
  type CompiledModelDocument,
} from './model/compiledDocument.js';

export {
  ReadyScopeError,
  readyScope,
  type ReadyScopeReport,
  ScopeSelectionError,
  completenessGaps,
  completenessIssues,
  fulfillmentResults,
  pairingGaps,
  referencesOf,
  selectScope,
} from './validation/scope.js';

export {
  analyzeTraceability,
  attributePath,
  extractRuleAttributeAccesses,
  type AttributeAccess,
  type TraceabilityConstraint,
  type TraceabilityDocument,
  type TraceabilityEdge,
  type TraceabilityNode,
} from './validation/traceability.js';

export {
  FM_CHECK_VERSION,
  buildFmCheckReport,
  type FmCheckOutcome,
  type FmCheckReport,
  type FmCheckRequest,
} from './validation/fmCheck.js';

export {
  auditDomainComponentNaming,
  type ModelAdvisory,
  type ModelAdvisoryCode,
} from './validation/lintRules.js';

export { derivedTraceability } from './derive/derivedDocuments.js';

export {
  DEFAULT_MODEL_BUNDLE_FILE,
  MODEL_BUNDLE_EXTENSION,
  MODEL_BUNDLE_TYPE,
  MODEL_README_PATH,
  createEmptyModelBundle,
  isModelBundlePath,
  isModelBundleShape,
  modelBundleSourceFiles,
  packModelSourceFiles,
  parseModelBundleText,
  serializeModelBundle,
  type DomainModelBundle,
  type ModelBundleParseResult,
  type PackResult,
  type SerializeBundleOptions,
} from './adapters/modelBundle.js';
