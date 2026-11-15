export * from './ingestion/index.js';
export {
  evaluateRuleOnExample,
  type ExampleRuleInputs,
} from './cel/transientSandbox.js';

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
  addBreachCompensation,
  introduceFulfillmentPair,
  isolateDomainCalculator,
  roleifyAndInvertDependency,
  type BreachCompensationIntent,
  type DomainCalculatorIntent,
  type FulfillmentPairIntent,
  type OperatorPatch,
  type RoleInversionIntent,
} from './commands/operators.js';

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
  EMPTY_MODEL_ISSUE_CODE,
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
