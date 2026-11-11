export {
  createDomainGraph,
  type DomainGraph,
  type FulfillmentPair,
} from './model/graph.js';

export {
  ModelCommandError,
  type CommandErrorCode,
  type ModelCommand,
  type ModelCommandOutcome,
} from './commands/types.js';

export {
  CommandSequence,
  ReplaceDocumentCommand,
  sequenceInverse,
} from './commands/sequence.js';

export {
  CreateContractCommand,
  CreateEntityCommand,
  DeleteEntityCommand,
  ReplaceContextRootsCommand,
  UpdateEntityCommand,
  entityReferences,
  type DeleteEntityOptions,
  type EntityReference,
} from './commands/entityCommands.js';

export {
  CreateRelationshipCommand,
  DeleteRelationshipCommand,
} from './commands/relationshipCommands.js';

export {
  AddAttributeCommand,
  RemoveAttributeCommand,
  UpdateAttributeCommand,
  type RemoveAttributeOptions,
} from './commands/attributeCommands.js';

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
  CelDuration,
  CelEvaluationError,
  CelTimestamp,
  celEquals,
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
  CreateRuleCommand,
  DeleteRuleCommand,
  UpdateRuleCommand,
  type DeleteRuleOptions,
} from './commands/ruleCommands.js';

export {
  BindDerivedRuleCommand,
  MANDATORY_MOMENT_TIME,
  assertMandatoryTime,
  type BindDerivedRuleInput,
} from './commands/derivationCommands.js';

export {
  CreateFulfillmentPairCommand,
  type CreateFulfillmentPairInput,
  type FulfillmentMomentInput,
  type FulfillmentPairResult,
} from './commands/fulfillmentCommands.js';

export {
  BindBreachRuleCommand,
  PairFulfillmentCommand,
  breachRuleOf,
  completionRuleOf,
  type BindBreachRuleInput,
  type PairFulfillmentInput,
  type PairFulfillmentResult,
} from './commands/fulfillmentPairCommands.js';

export {
  ModelPatchError,
  decodeModelPatch,
  decodeModelPatchCommand,
  type ModelPatchCommand,
  type ModelPatchErrorCode,
} from './commands/patches.js';

export {
  ModelSessionValidationError,
  createModelSession,
  type ModelSelection,
  type ModelSession,
  type ModelSessionEvent,
  type ModelSessionOptions,
} from './session/createModelSession.js';

export {
  MODEL_MANIFEST_PATH,
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
  readModelDirectory,
  writeModelDirectory,
  type WriteModelResult,
} from './adapters/diskAdapter.js';

export {
  MODEL_CHECK_TREES,
  MODEL_GENERATED_TREE,
  isValidationPath,
  readModelRoot,
  readModelRootFiles,
} from './adapters/modelRoot.js';

export {
  comparableValue,
  indexSuite,
  loadValidationSuite,
  validateValidationSuite,
  validationSuiteFromBundle,
  validationSuiteFromFiles,
  type EvaluationBinding,
  type EvidenceInstance,
  type FulfillmentStatus,
  type FulfillmentStatusExpectation,
  type Scenario,
  type ScenarioEvaluation,
  type ScenarioExpectations,
  type ScenarioStep,
  type ValidationSuite,
} from './validation/validationSuite.js';

export {
  isTimestampText,
  normalizeJsonValue,
  validateTypedValue,
} from './validation/typedValues.js';

export {
  buildTimeline,
  digestOf,
  timelineSummary,
  type EvidenceTimeline,
  type TimelineDependency,
  type TimelineEvidenceType,
  type TimelineInstance,
  type TimelineSummary,
  type TimelineTime,
  type TimelineUnresolvedOrder,
} from './validation/timeline.js';

export {
  DEFAULT_MODEL_BUNDLE_FILE,
  MODEL_BUNDLE_EXTENSION,
  MODEL_BUNDLE_TYPE,
  MODEL_README_PATH,
  VALIDATION_INSTANCE_TREE,
  VALIDATION_SCENARIO_TREE,
  createEmptyModelBundle,
  isModelBundlePath,
  isModelBundleShape,
  modelBundleSourceFiles,
  packModelSourceFiles,
  parseModelBundleText,
  serializeModelBundle,
  type DomainModelBundle,
  type ModelBundleParseResult,
  type ModelBundleValidation,
  type PackResult,
  type SerializeBundleOptions,
} from './adapters/modelBundle.js';

export {
  MODEL_DIRECTORY,
  isModelBundleFile,
  packModelDirectory,
  readModelBundle,
  unpackModelBundle,
  writeModelBundle,
  type UnpackResult,
  type WriteModelBundleResult,
} from './adapters/modelFileAdapter.js';
