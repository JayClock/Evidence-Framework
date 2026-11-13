export {
  ATTRIBUTE_NAME_PATTERN,
  CEL_VARIABLE_PATTERN,
  DOMAIN_ID_PATTERN,
  MODEL_VERSION_PATTERN,
  isAttributeName,
  isCelVariableName,
  isDomainId,
  isModelVersion,
} from './ast/id.js';

export {
  VALUE_TYPES,
  isBindingCardinality,
  isValueType,
  type BindingCardinality,
  type ValueType,
} from './ast/values.js';

export {
  CLAUSE_CATEGORIES,
  CLAUSE_CATEGORY_DEFINITIONS,
  CLAUSE_CATEGORY_ENGLISH_LABELS,
  CLAUSE_CATEGORY_HINTS,
  CLAUSE_CATEGORY_LABELS,
  CLAUSE_DESTINATIONS,
  CLAUSE_DESTINATION_DEFINITIONS,
  CLAUSE_DESTINATION_LABELS,
  CLAUSE_DESTINATION_OF,
  countClausesByCategory,
  isClauseCategory,
  isClauseDestination,
  type ClauseAnnotation,
  type ClauseCategory,
  type ClauseCategoryDefinition,
  type ClauseDestination,
} from './ast/clause.js';

export {
  CONTEXT_KINDS,
  CONTEXT_KIND_DEFINITIONS,
  CONTEXT_KIND_LABELS,
  DOMAIN_COMPONENT_ROLES,
  DOMAIN_COMPONENT_ROLE_DEFINITIONS,
  DOMAIN_COMPONENT_ROLE_LABELS,
  ENTITY_CATEGORIES,
  ENTITY_CATEGORY_DEFINITIONS,
  ENTITY_CATEGORY_LABELS,
  EVIDENCE_KINDS,
  EVIDENCE_KIND_DEFINITIONS,
  EVIDENCE_KIND_LABELS,
  EVIDENCE_TIME_ATTRIBUTE_DEFINITIONS,
  EVIDENCE_TIME_ATTRIBUTE_LABELS,
  EVIDENCE_TIME_ATTRIBUTE_NAMES,
  PARTICIPANT_KINDS,
  PARTICIPANT_KIND_DEFINITIONS,
  PARTICIPANT_KIND_LABELS,
  REQUIRED_EVIDENCE_TIME_ATTRIBUTES,
  ROLE_KINDS,
  ROLE_KIND_DEFINITIONS,
  ROLE_KIND_LABELS,
  entitySignature,
  findAttribute,
  isContextEntity,
  isContractContext,
  isContractEntity,
  isDomainComponent,
  isDomainComponentRole,
  isEvidenceEntity,
  isEvidenceMoment,
  isFulfillmentConfirmation,
  isFulfillmentRequest,
  isParticipantEntity,
  isPartyRole,
  isRoleEntity,
  type AttributeAST,
  type ContextEntityAST,
  type ContextKind,
  type DomainComponentRole,
  type EntityAST,
  type EntityCategory,
  type EntitySignature,
  type EvidenceEntityAST,
  type EvidenceKind,
  type EvidenceKindDefinition,
  type ParticipantEntityAST,
  type ParticipantKind,
  type RoleEntityAST,
  type RoleKind,
} from './ast/entity.js';

export {
  LIFECYCLE_STAGES,
  LIFECYCLE_STAGE_CAPTIONS,
  LIFECYCLE_STAGE_DEFINITIONS,
  LIFECYCLE_STAGE_ENGLISH_LABELS,
  LIFECYCLE_STAGE_LABELS,
  LIFECYCLE_STAGE_ORDER,
  furthestLifecycleStage,
  isLifecycleStage,
  lifecycleStageOf,
  lifecycleStageOfContext,
  lifecycleStageRank,
  type LifecycleStage,
  type LifecycleStageDefinition,
} from './ast/lifecycle.js';

export {
  WORKSHOP_STEPS,
  WORKSHOP_STEP_IDS,
  isWorkshopStepId,
  workshopStepFocus,
  workshopStepRank,
  type WorkshopStep,
  type WorkshopStepId,
} from './ast/workshop.js';

export {
  KEY_DATA_PROVIDER_CHOICES,
  KEY_DATA_SOURCE_DEFINITIONS,
  KEY_DATA_SOURCE_KINDS,
  KEY_DATA_SOURCE_LABELS,
  REQUEST_FORMATION_FIELDS,
  RESOLVED_KEY_DATA_SOURCES,
  classifyKeyDataSource,
  isKeyDataDecisionOwed,
  isKeyDataResolved,
  isKeyDataSourceKind,
  type KeyDataProviderChoice,
  type KeyDataSourceDefinition,
  type KeyDataSourceKind,
} from './ast/keyData.js';

export {
  RELATIONSHIP_KINDS,
  RELATIONSHIP_KIND_DEFINITIONS,
  RELATIONSHIP_KIND_LABELS,
  isCardinality,
  isRelationshipKind,
  type CardinalityAST,
  type RelationshipAST,
  type RelationshipKind,
} from './ast/relationship.js';

export {
  BOOLEAN_RULE_KINDS,
  RULE_KINDS,
  RULE_KIND_DEFINITIONS,
  RULE_KIND_LABELS,
  isBooleanRuleKind,
  isDerivationRule,
  isRuleBinding,
  isRuleKind,
  ruleTargetsAttribute,
  type RuleAST,
  type RuleBinding,
  type RuleKind,
  type RuleKindDefinition,
  type RuleTarget,
} from './ast/rule.js';

export {
  EMPTY_MODEL_MANIFEST,
  FM_RULE_LANGUAGE,
  FM_SCHEMA_VERSION,
  createEmptyDomainModel,
  isDomainModelDocumentShape,
  isDomainModelManifest,
  type DomainModelDocument,
  type DomainModelManifest,
} from './ast/document.js';

export {
  INGESTION_SOURCE_KINDS,
  INGESTION_SOURCE_KIND_DEFINITIONS,
  INGESTION_SOURCE_KIND_LABELS,
  isIngestionSourceKind,
  type IngestionSourceKind,
  type ProvenanceSnippet,
} from './ast/provenance.js';

export {
  EVIDENCE_KIND_ALIASES,
  createEmptyIngestionDraft,
  draftEvidenceIsMoment,
  isIngestionDraftShape,
  normalizeDraftEvidenceKind,
  type DraftAttribute,
  type DraftBreachCompensation,
  type DraftContext,
  type DraftEvidence,
  type DraftFulfillmentPair,
  type DraftParticipant,
  type DraftRelationship,
  type DraftRole,
  type DraftThing,
  type IngestionDraft,
} from './ingestion/draft.js';

export {
  DomainModelValidationError,
  createIssue,
  dedupeIssues,
  formatIssue,
  issueKey,
  type ValidationCode,
  type ValidationIssue,
  type ValidationResult,
} from './validation/errors.js';

export {
  assertValidDomainModel,
  strictValidateDomainModel,
} from './validation/strictValidate.js';

export {
  INSPECTOR_GROUP_DEFINITIONS,
  INSPECTOR_GROUP_IDS,
  INSPECTOR_GROUP_LABELS,
  type InspectorGroupId,
} from './inspector/groups.js';

export {
  INSPECTOR_ATTRIBUTE_FIELDS,
  INSPECTOR_KEY_DATA_PROVENANCE_PROPERTY,
  INSPECTOR_RULE_FIELDS,
  getInspectorGroup,
  getInspectorGroups,
  getReferenceConstraint,
  type InspectorEditorKind,
  type InspectorGroupDefinition,
  type InspectorGroupDefinitionWithCategory,
  type InspectorOption,
  type InspectorPropertyDefinition,
  type InspectorReferenceConstraint,
} from './inspector/registry.js';
