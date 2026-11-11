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
