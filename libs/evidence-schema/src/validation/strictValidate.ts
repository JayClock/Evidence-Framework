import {
  ATTRIBUTE_NAME_PATTERN,
  DOMAIN_ID_PATTERN,
  MODEL_VERSION_PATTERN,
} from '../ast/id.js';
import {
  CONTEXT_KINDS,
  ENTITY_CATEGORIES,
  EVIDENCE_KINDS,
  EVIDENCE_TIME_ATTRIBUTE_NAMES,
  PARTICIPANT_KINDS,
  REQUIRED_EVIDENCE_TIME_ATTRIBUTES,
  ROLE_KINDS,
} from '../ast/entity.js';
import { isCardinality, RELATIONSHIP_KINDS } from '../ast/relationship.js';
import {
  BOOLEAN_RULE_KINDS,
  RULE_KINDS,
  isRuleBinding,
} from '../ast/rule.js';
import { FM_RULE_LANGUAGE, FM_SCHEMA_VERSION } from '../ast/document.js';
import { CEL_VARIABLE_PATTERN } from '../ast/id.js';
import { VALUE_TYPES } from '../ast/values.js';
import {
  createIssue,
  dedupeIssues,
  DomainModelValidationError,
  type ValidationIssue,
  type ValidationResult,
} from './errors.js';

type JsonObject = Record<string, unknown>;

interface ModelIndex {
  entities: Map<string, JsonObject>;
  relationships: Map<string, JsonObject>;
  rules: Map<string, JsonObject>;
}

interface RawDocument {
  manifest: JsonObject;
  entities: JsonObject[];
  relationships: JsonObject[];
  rules: JsonObject[];
}

const ENTITY_KEYS = new Set([
  'type',
  'id',
  'category',
  'kind',
  'label',
  'aliases',
  'contextRef',
  'parentContextRef',
  'rootRefs',
  'responsibleRoleRef',
  'roleRefs',
  'attributes',
  'notes',
  'sourceSnippet',
]);

const ATTRIBUTE_KEYS = new Set([
  'name',
  'label',
  'valueType',
  'required',
  'keyData',
  'meaning',
  'derivedByRuleRef',
  'notes',
]);

const RELATIONSHIP_KEYS = new Set([
  'type',
  'id',
  'kind',
  'sourceRef',
  'targetRef',
  'sourceCardinality',
  'targetCardinality',
  'label',
  'notes',
]);

const RULE_KEYS = new Set([
  'type',
  'id',
  'kind',
  'label',
  'description',
  'contextRef',
  'bindings',
  'expression',
  'resultType',
  'target',
  'notes',
]);

const MANIFEST_KEYS = new Set([
  'type',
  'schemaVersion',
  'id',
  'name',
  'version',
  'ruleLanguage',
  'entryContextRefs',
  'description',
]);

const KIND_BY_CATEGORY: Record<string, readonly string[]> = {
  evidence: EVIDENCE_KINDS,
  participant: PARTICIPANT_KINDS,
  role: ROLE_KINDS,
  context: CONTEXT_KINDS,
};

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const asString = (object: JsonObject, key: string): string | undefined => {
  const value = object[key];

  return typeof value === 'string' ? value : undefined;
};

const asStringList = (object: JsonObject, key: string): string[] | undefined => {
  const value = object[key];

  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.every((item): item is string => typeof item === 'string')
    ? [...value]
    : undefined;
};

const categoryOf = (object: JsonObject | undefined): string | undefined =>
  object === undefined ? undefined : asString(object, 'category');

const kindOf = (object: JsonObject | undefined): string | undefined =>
  object === undefined ? undefined : asString(object, 'kind');

const signatureOf = (
  object: JsonObject | undefined,
): [string | undefined, string | undefined] => [categoryOf(object), kindOf(object)];

const isContext = (object: JsonObject | undefined): boolean =>
  categoryOf(object) === 'context';

const isEntityRecord = (object: JsonObject | undefined): boolean =>
  object !== undefined && object['type'] === 'entity';

/**
 * Field a business object belongs to. Contexts own themselves; rules own their
 * `contextRef`. Used by cross-boundary relationship checks.
 */
const ownerContextOf = (object: JsonObject | undefined): string | undefined => {
  if (object === undefined) {
    return undefined;
  }

  if (isContext(object)) {
    return asString(object, 'id');
  }

  return asString(object, 'contextRef');
};

const attributeOf = (
  entity: JsonObject | undefined,
  name: string,
): JsonObject | undefined => {
  const attributes = entity?.['attributes'];

  if (!Array.isArray(attributes)) {
    return undefined;
  }

  return attributes.find(
    (attribute): attribute is JsonObject =>
      isObject(attribute) && attribute['name'] === name,
  );
};

const unknownFields = (
  object: JsonObject,
  allowed: Set<string>,
): string[] => Object.keys(object).filter((key) => !allowed.has(key));

const pushIssue = (
  issues: ValidationIssue[],
  code: Parameters<typeof createIssue>[0]['code'],
  path: string,
  message: string,
  objectId?: string,
): void => {
  issues.push(createIssue({ code, path, message, objectId }));
};

const readDocument = (
  input: unknown,
  issues: ValidationIssue[],
): RawDocument | undefined => {
  if (!isObject(input)) {
    pushIssue(issues, 'document.shape', '$', 'model source must be an object.');
    return undefined;
  }

  const manifest = input['manifest'];
  const entities = input['entities'];
  const relationships = input['relationships'];
  const rules = input['rules'];

  if (!isObject(manifest)) {
    pushIssue(
      issues,
      'document.shape',
      '$.manifest',
      'model source requires a manifest object.',
    );
  }

  for (const [key, value] of [
    ['entities', entities],
    ['relationships', relationships],
    ['rules', rules],
  ] as const) {
    if (!Array.isArray(value)) {
      pushIssue(
        issues,
        'document.shape',
        `$.${key}`,
        `${key} must be an array.`,
      );
    }
  }

  if (
    !isObject(manifest) ||
    !Array.isArray(entities) ||
    !Array.isArray(relationships) ||
    !Array.isArray(rules)
  ) {
    return undefined;
  }

  return {
    manifest,
    entities: entities.filter((item): item is JsonObject => isObject(item)),
    relationships: relationships.filter((item): item is JsonObject =>
      isObject(item),
    ),
    rules: rules.filter((item): item is JsonObject => isObject(item)),
  };
};

const validateManifest = (
  manifest: JsonObject,
  index: ModelIndex,
  issues: ValidationIssue[],
): void => {
  for (const field of unknownFields(manifest, MANIFEST_KEYS)) {
    pushIssue(
      issues,
      'manifest.field',
      `manifest.${field}`,
      `unsupported manifest field '${field}'.`,
    );
  }

  if (manifest['type'] !== 'fm_model') {
    pushIssue(
      issues,
      'manifest.field',
      'manifest.type',
      "manifest type must be 'fm_model'.",
    );
  }

  if (manifest['schemaVersion'] !== FM_SCHEMA_VERSION) {
    pushIssue(
      issues,
      'manifest.field',
      'manifest.schemaVersion',
      `manifest schemaVersion must be '${FM_SCHEMA_VERSION}'.`,
    );
  }

  const id = manifest['id'];
  if (typeof id !== 'string' || !DOMAIN_ID_PATTERN.test(id)) {
    pushIssue(
      issues,
      'manifest.field',
      'manifest.id',
      'manifest id must match the FM identifier grammar.',
    );
  }

  if (!isNonEmptyString(manifest['name'])) {
    pushIssue(
      issues,
      'manifest.field',
      'manifest.name',
      'manifest name must be a non-empty string.',
    );
  }

  const version = manifest['version'];
  if (typeof version !== 'string' || !MODEL_VERSION_PATTERN.test(version)) {
    pushIssue(
      issues,
      'manifest.field',
      'manifest.version',
      'manifest version must be semantic versioning.',
    );
  }

  if (manifest['ruleLanguage'] !== FM_RULE_LANGUAGE) {
    pushIssue(
      issues,
      'manifest.field',
      'manifest.ruleLanguage',
      `manifest ruleLanguage must be '${FM_RULE_LANGUAGE}'.`,
    );
  }

  if (
    manifest['description'] !== undefined &&
    !isNonEmptyString(manifest['description'])
  ) {
    pushIssue(
      issues,
      'manifest.field',
      'manifest.description',
      'manifest description must be a non-empty string when present.',
    );
  }

  const entryContextRefs = asStringList(manifest, 'entryContextRefs');

  if (entryContextRefs === undefined || entryContextRefs.length === 0) {
    pushIssue(
      issues,
      'manifest.field',
      'manifest.entryContextRefs',
      'manifest requires at least one entryContextRefs id.',
    );
    return;
  }

  if (new Set(entryContextRefs).size !== entryContextRefs.length) {
    pushIssue(
      issues,
      'manifest.field',
      'manifest.entryContextRefs',
      'manifest entryContextRefs must be unique.',
    );
  }

  for (const ref of entryContextRefs) {
    if (!isContext(index.entities.get(ref))) {
      pushIssue(
        issues,
        'manifest.entryContextRef',
        'manifest.entryContextRefs',
        `entryContextRef '${ref}' must reference a Context.`,
      );
    }
  }
};

const indexCollection = (
  items: readonly JsonObject[],
  collection: 'entities' | 'relationships' | 'rules',
  expectedType: string,
  allowed: Set<string>,
  index: ModelIndex,
  issues: ValidationIssue[],
): void => {
  items.forEach((item, position) => {
    const path = `${collection}[${position}]`;
    const id = item['id'];

    if (item['type'] !== expectedType) {
      pushIssue(
        issues,
        'collection.item',
        `${path}.type`,
        `${collection} entries must declare type '${expectedType}'.`,
      );
    }

    for (const field of unknownFields(item, allowed)) {
      pushIssue(
        issues,
        'entity.unknownField',
        `${path}.${field}`,
        `unsupported ${collection} field '${field}'.`,
        typeof id === 'string' ? id : undefined,
      );
    }

    if (typeof id !== 'string' || !DOMAIN_ID_PATTERN.test(id)) {
      pushIssue(
        issues,
        'id.invalid',
        `${path}.id`,
        `${collection} id must match the FM identifier grammar.`,
      );
      return;
    }

    const bucket =
      collection === 'entities'
        ? index.entities
        : collection === 'relationships'
          ? index.relationships
          : index.rules;

    if (
      index.entities.has(id) ||
      index.relationships.has(id) ||
      index.rules.has(id)
    ) {
      pushIssue(
        issues,
        'id.duplicate',
        `${path}.id`,
        `duplicate id '${id}' across model sources.`,
        id,
      );
      return;
    }

    bucket.set(id, item);
  });
};

const validateAttributes = (
  entity: JsonObject,
  entityId: string,
  path: string,
  index: ModelIndex,
  issues: ValidationIssue[],
): void => {
  const rawAttributes = entity['attributes'];

  if (rawAttributes === undefined) {
    return;
  }

  if (!Array.isArray(rawAttributes)) {
    pushIssue(
      issues,
      'attribute.shape',
      `${path}.attributes`,
      'attributes must be an array.',
      entityId,
    );
    return;
  }

  const seen = new Set<string>();

  rawAttributes.forEach((rawAttribute, position) => {
    const attributePath = `${path}.attributes[${position}]`;

    if (!isObject(rawAttribute)) {
      pushIssue(
        issues,
        'attribute.shape',
        attributePath,
        'attribute must be an object.',
        entityId,
      );
      return;
    }

    for (const field of unknownFields(rawAttribute, ATTRIBUTE_KEYS)) {
      pushIssue(
        issues,
        'attribute.shape',
        `${attributePath}.${field}`,
        `unsupported attribute field '${field}'.`,
        entityId,
      );
    }

    const name = rawAttribute['name'];

    if (typeof name !== 'string' || !ATTRIBUTE_NAME_PATTERN.test(name)) {
      pushIssue(
        issues,
        'attribute.name',
        `${attributePath}.name`,
        `attribute name ${JSON.stringify(name)} must use lower snake_case.`,
        entityId,
      );
    } else if (seen.has(name)) {
      pushIssue(
        issues,
        'attribute.duplicate',
        `${attributePath}.name`,
        `duplicate attribute name '${name}'.`,
        entityId,
      );
    } else {
      seen.add(name);
    }

    for (const required of ['label', 'meaning'] as const) {
      if (!isNonEmptyString(rawAttribute[required])) {
        pushIssue(
          issues,
          'attribute.shape',
          `${attributePath}.${required}`,
          `attribute ${required} must be a non-empty string.`,
          entityId,
        );
      }
    }

    const valueType = rawAttribute['valueType'];

    if (
      valueType !== undefined &&
      !(VALUE_TYPES as readonly string[]).includes(String(valueType))
    ) {
      pushIssue(
        issues,
        'attribute.shape',
        `${attributePath}.valueType`,
        `unsupported attribute valueType '${String(valueType)}'.`,
        entityId,
      );
    }

    for (const flag of ['required', 'keyData'] as const) {
      const value = rawAttribute[flag];

      if (value !== undefined && typeof value !== 'boolean') {
        pushIssue(
          issues,
          'attribute.shape',
          `${attributePath}.${flag}`,
          `attribute ${flag} must be a boolean.`,
          entityId,
        );
      }
    }

    const ruleRef = rawAttribute['derivedByRuleRef'];

    if (ruleRef !== undefined) {
      if (typeof ruleRef !== 'string') {
        pushIssue(
          issues,
          'attribute.derivedByRuleRef.unresolved',
          `${attributePath}.derivedByRuleRef`,
          'derivedByRuleRef must be a rule id.',
          entityId,
        );
      } else if (!index.rules.has(ruleRef)) {
        pushIssue(
          issues,
          'attribute.derivedByRuleRef.unresolved',
          `${attributePath}.derivedByRuleRef`,
          `unknown derivedByRuleRef '${ruleRef}'.`,
          entityId,
        );
      }
    }

    if (
      typeof name === 'string' &&
      (EVIDENCE_TIME_ATTRIBUTE_NAMES as readonly string[]).includes(name)
    ) {
      if (
        valueType !== 'timestamp' ||
        rawAttribute['required'] !== true ||
        rawAttribute['keyData'] !== true
      ) {
        pushIssue(
          issues,
          'attribute.time.notKeyTimestamp',
          attributePath,
          `attribute '${name}' must be a required keyData timestamp.`,
          entityId,
        );
      }
    }
  });

  const category = categoryOf(entity);
  const kind = kindOf(entity);

  if (category !== 'evidence' || typeof kind !== 'string') {
    return;
  }

  const requiredNames = (
    REQUIRED_EVIDENCE_TIME_ATTRIBUTES as Record<
      string,
      readonly string[] | undefined
    >
  )[kind];

  if (requiredNames === undefined) {
    return;
  }

  for (const requiredName of requiredNames) {
    if (!seen.has(requiredName)) {
      pushIssue(
        issues,
        'attribute.time.missing',
        `${path}.attributes`,
        `${kind} requires explicit time attribute '${requiredName}'.`,
        entityId,
      );
    }
  }
};

const validateContextEntity = (
  entity: JsonObject,
  entityId: string,
  path: string,
  index: ModelIndex,
  issues: ValidationIssue[],
): void => {
  if (entity['contextRef'] !== undefined) {
    pushIssue(
      issues,
      'entity.contextRef.forbidden',
      `${path}.contextRef`,
      'Context must not define contextRef.',
      entityId,
    );
  }

  const parentRef = entity['parentContextRef'];

  if (parentRef !== undefined) {
    if (typeof parentRef !== 'string') {
      pushIssue(
        issues,
        'entity.contextRef.unresolved',
        `${path}.parentContextRef`,
        'parentContextRef must be a context id.',
        entityId,
      );
    } else if (!isContext(index.entities.get(parentRef))) {
      pushIssue(
        issues,
        'entity.contextRef.unresolved',
        `${path}.parentContextRef`,
        `parentContextRef '${parentRef}' must reference a Context.`,
        entityId,
      );
    }
  }

  const kind = kindOf(entity);
  const roots = asStringList(entity, 'rootRefs');

  if (entity['rootRefs'] !== undefined && roots === undefined) {
    pushIssue(
      issues,
      'entity.contextRoots.missing',
      `${path}.rootRefs`,
      'rootRefs must be an array of ids.',
      entityId,
    );
  }

  if (kind === 'contract' || kind === 'domain') {
    if (roots === undefined || roots.length === 0) {
      pushIssue(
        issues,
        'entity.contextRoots.missing',
        `${path}.rootRefs`,
        `${kind} Context must declare rootRefs with real content.`,
        entityId,
      );
      return;
    }
  }

  if (roots === undefined) {
    return;
  }

  if (kind === 'contract') {
    const contractRoots = roots.filter(
      (ref) => signatureOf(index.entities.get(ref)).join('.') === 'evidence.contract',
    );

    if (roots.length !== 1 || contractRoots.length !== 1) {
      pushIssue(
        issues,
        'entity.contextRoots.contractCount',
        `${path}.rootRefs`,
        'Contract Context must have exactly one root Contract.',
        entityId,
      );
    }
  }

  for (const ref of roots) {
    const target = index.entities.get(ref);

    if (target === undefined) {
      pushIssue(
        issues,
        'relationship.endpoint.unresolved',
        `${path}.rootRefs`,
        `rootRefs contains unknown id '${ref}'.`,
        entityId,
      );
      continue;
    }

    if (ownerContextOf(target) !== entityId) {
      pushIssue(
        issues,
        'entity.contextRoots.foreign',
        `${path}.rootRefs`,
        `root '${ref}' must belong to this Context.`,
        entityId,
      );
    }
  }
};

const rootContractOf = (
  context: JsonObject | undefined,
  index: ModelIndex,
): JsonObject | undefined => {
  if (kindOf(context) !== 'contract') {
    return undefined;
  }

  const roots = asStringList(context ?? {}, 'rootRefs') ?? [];
  const contracts = roots
    .map((ref) => index.entities.get(ref))
    .filter((root): root is JsonObject => root !== undefined);

  return contracts.length === 1 &&
    signatureOf(contracts[0]).join('.') === 'evidence.contract'
    ? contracts[0]
    : undefined;
};

const validateEvidenceResponsibility = (
  entity: JsonObject,
  entityId: string,
  path: string,
  context: JsonObject | undefined,
  index: ModelIndex,
  issues: ValidationIssue[],
): void => {
  const roleRef = entity['responsibleRoleRef'];

  if (roleRef === undefined) {
    pushIssue(
      issues,
      'entity.responsibleRole.missing',
      `${path}.responsibleRoleRef`,
      'non-contract Evidence requires responsibleRoleRef.',
      entityId,
    );
    return;
  }

  if (typeof roleRef !== 'string') {
    pushIssue(
      issues,
      'entity.responsibleRole.unresolved',
      `${path}.responsibleRoleRef`,
      'responsibleRoleRef must be a role id.',
      entityId,
    );
    return;
  }

  const role = index.entities.get(roleRef);

  if (role === undefined) {
    pushIssue(
      issues,
      'entity.responsibleRole.unresolved',
      `${path}.responsibleRoleRef`,
      `unknown responsibleRoleRef '${roleRef}'.`,
      entityId,
    );
    return;
  }

  if (signatureOf(role).join('.') !== 'role.party') {
    pushIssue(
      issues,
      'entity.responsibleRole.notPartyRole',
      `${path}.responsibleRoleRef`,
      `responsibleRoleRef '${roleRef}' must reference a Party Role.`,
      entityId,
    );
    return;
  }

  // A pre-contract stage borrows the parties bound by its parent Contract.
  const parent = index.entities.get(asString(context ?? {}, 'parentContextRef') ?? '');
  const owner =
    kindOf(context) === 'pre_contract' && kindOf(parent) === 'contract'
      ? parent
      : context;
  const expectedContext = asString(owner ?? {}, 'id') ?? asString(entity, 'contextRef');

  if (ownerContextOf(role) !== expectedContext) {
    pushIssue(
      issues,
      'entity.responsibleRole.foreign',
      `${path}.responsibleRoleRef`,
      `responsible Role '${roleRef}' must belong to Context '${String(expectedContext)}'.`,
      entityId,
    );
    return;
  }

  const contract = rootContractOf(owner, index);
  const boundRoles = asStringList(contract ?? {}, 'roleRefs') ?? [];

  if (kindOf(owner) === 'contract' && contract !== undefined) {
    if (!boundRoles.includes(roleRef)) {
      pushIssue(
        issues,
        'entity.responsibleRole.foreign',
        `${path}.responsibleRoleRef`,
        `responsible Role '${roleRef}' must be bound by Contract '${String(contract['id'])}'.`,
        entityId,
      );
    }
  }
};

const validateContractEntity = (
  entity: JsonObject,
  entityId: string,
  path: string,
  context: JsonObject | undefined,
  index: ModelIndex,
  issues: ValidationIssue[],
): void => {
  if (kindOf(context) !== 'contract') {
    pushIssue(
      issues,
      'entity.evidenceContext.kind',
      `${path}.contextRef`,
      'Contract must belong to a Contract Context.',
      entityId,
    );
  }

  const roots = asStringList(context ?? {}, 'rootRefs') ?? [];

  if (!roots.includes(entityId)) {
    pushIssue(
      issues,
      'entity.contract.rootMissing',
      `${path}.contextRef`,
      'Contract must be listed in the rootRefs of its Context.',
      entityId,
    );
  }

  const roleRefs = asStringList(entity, 'roleRefs');

  if (roleRefs === undefined) {
    pushIssue(
      issues,
      'entity.roleRefs.missing',
      `${path}.roleRefs`,
      'Contract requires exactly two distinct contextual Party Roles.',
      entityId,
    );
    return;
  }

  if (new Set(roleRefs).size !== 2 || roleRefs.length !== 2) {
    pushIssue(
      issues,
      'entity.roleRefs.count',
      `${path}.roleRefs`,
      'Contract requires exactly two distinct Party Roles.',
      entityId,
    );
  }

  for (const ref of roleRefs) {
    const role = index.entities.get(ref);

    if (role === undefined) {
      pushIssue(
        issues,
        'entity.roleRefs.unresolved',
        `${path}.roleRefs`,
        `unknown roleRef '${ref}'.`,
        entityId,
      );
      continue;
    }

    if (signatureOf(role).join('.') !== 'role.party') {
      pushIssue(
        issues,
        'entity.roleRefs.notPartyRole',
        `${path}.roleRefs`,
        `roleRef '${ref}' must reference a Party Role.`,
        entityId,
      );
      continue;
    }

    if (ownerContextOf(role) !== asString(entity, 'contextRef')) {
      pushIssue(
        issues,
        'entity.roleRefs.foreign',
        `${path}.roleRefs`,
        `Party Role '${ref}' must belong to the Contract Context.`,
        entityId,
      );
    }
  }
};

const validateNonContextEntity = (
  entity: JsonObject,
  entityId: string,
  path: string,
  index: ModelIndex,
  issues: ValidationIssue[],
): void => {
  const category = categoryOf(entity);
  const kind = kindOf(entity);
  const contextRef = asString(entity, 'contextRef');
  const context =
    contextRef === undefined ? undefined : index.entities.get(contextRef);

  const needsContext =
    category === 'evidence' ||
    category === 'role' ||
    (category === 'participant' && kind === 'thing');

  if (needsContext) {
    if (contextRef === undefined) {
      pushIssue(
        issues,
        'entity.contextRef.missing',
        `${path}.contextRef`,
        `${String(category)} requires contextRef.`,
        entityId,
      );
    } else if (context === undefined) {
      pushIssue(
        issues,
        'entity.contextRef.unresolved',
        `${path}.contextRef`,
        `unknown contextRef '${contextRef}'.`,
        entityId,
      );
    } else if (!isContext(context)) {
      pushIssue(
        issues,
        'entity.contextRef.notContext',
        `${path}.contextRef`,
        `contextRef '${contextRef}' must reference a Context.`,
        entityId,
      );
    }
  }

  if (category === 'participant' && kind === 'party' && contextRef !== undefined) {
    pushIssue(
      issues,
      'entity.participantParty.contextRef',
      `${path}.contextRef`,
      'Participant Party must stay outside every Context.',
      entityId,
    );
  }

  if (
    category === 'role' &&
    (entity['responsibleRoleRef'] !== undefined ||
      entity['roleRefs'] !== undefined)
  ) {
    pushIssue(
      issues,
      'entity.roleResponsibility.forbidden',
      path,
      'Role must not declare Evidence responsibility fields.',
      entityId,
    );
  }

  if (category === 'evidence' && kind === 'contract') {
    validateContractEntity(entity, entityId, path, context, index, issues);
    return;
  }

  if (category === 'evidence') {
    validateEvidenceResponsibility(entity, entityId, path, context, index, issues);

    const contextKind = kindOf(context);

    if (
      (kind === 'fulfillment_request' ||
        kind === 'fulfillment_confirmation') &&
      contextKind !== 'contract'
    ) {
      pushIssue(
        issues,
        'entity.evidenceContext.kind',
        `${path}.contextRef`,
        `${String(kind)} must belong to a Contract Context.`,
        entityId,
      );
    }

    if (kind === 'other_evidence' && contextKind === undefined) {
      pushIssue(
        issues,
        'entity.evidenceContext.kind',
        `${path}.contextRef`,
        'other_evidence must belong to a Contract, Pre-contract or Domain Context.',
        entityId,
      );
    }

    if (
      (kind === 'rfp' || kind === 'proposal') &&
      contextKind !== 'pre_contract'
    ) {
      pushIssue(
        issues,
        'entity.evidenceContext.kind',
        `${path}.contextRef`,
        `${String(kind)} must belong to a Pre-contract Context.`,
        entityId,
      );
    }
  }

  if (
    category === 'participant' &&
    kind === 'thing' &&
    context !== undefined &&
    kindOf(context) !== 'domain'
  ) {
    pushIssue(
      issues,
      'entity.evidenceContext.kind',
      `${path}.contextRef`,
      'Participant Thing must belong to a Domain Context.',
      entityId,
    );
  }
};

const validateContextCycles = (
  index: ModelIndex,
  issues: ValidationIssue[],
): void => {
  for (const [entityId, entity] of index.entities) {
    if (!isContext(entity)) {
      continue;
    }

    const seen = new Set<string>();
    let current: string | undefined = entityId;

    while (current !== undefined) {
      if (seen.has(current)) {
        pushIssue(
          issues,
          'entity.parentContextRef.cycle',
          `entities.${entityId}.parentContextRef`,
          'Context parentContextRef chain cycles.',
          entityId,
        );
        break;
      }

      seen.add(current);
      current = asString(index.entities.get(current) ?? {}, 'parentContextRef');
    }
  }
};

const validateEntityKinds = (
  entity: JsonObject,
  entityId: string,
  path: string,
  issues: ValidationIssue[],
): void => {
  const category = categoryOf(entity);

  if (
    category === undefined ||
    !(ENTITY_CATEGORIES as readonly string[]).includes(category)
  ) {
    pushIssue(
      issues,
      'entity.category',
      `${path}.category`,
      `unsupported entity category '${String(category)}'.`,
      entityId,
    );
    return;
  }

  const kind = kindOf(entity);

  if (kind === undefined) {
    pushIssue(
      issues,
      'entity.kind',
      `${path}.kind`,
      'entity requires a kind.',
      entityId,
    );
    return;
  }

  if (!(KIND_BY_CATEGORY[category] ?? []).includes(kind)) {
    pushIssue(
      issues,
      'entity.kind',
      `${path}.kind`,
      `unsupported ${category} kind '${kind}'.`,
      entityId,
    );
  }

  const aliases = entity['aliases'];

  if (
    aliases !== undefined &&
    (!Array.isArray(aliases) ||
      aliases.some((alias) => !isNonEmptyString(alias)) ||
      new Set(aliases).size !== aliases.length)
  ) {
    pushIssue(
      issues,
      'entity.shape',
      `${path}.aliases`,
      'aliases must be unique non-empty strings.',
      entityId,
    );
  }
};

const validateEntityLabels = (
  entity: JsonObject,
  entityId: string,
  path: string,
  issues: ValidationIssue[],
): void => {
  if (!isNonEmptyString(entity['label'])) {
    pushIssue(
      issues,
      'label.missing',
      `${path}.label`,
      'entity label must be a non-empty string.',
      entityId,
    );
  }
};

const validateEntities = (
  raw: RawDocument,
  index: ModelIndex,
  issues: ValidationIssue[],
): void => {
  raw.entities.forEach((entity, position) => {
    const path = `entities[${position}]`;
    const entityId = asString(entity, 'id') ?? '';

    validateEntityLabels(entity, entityId, path, issues);
    validateEntityKinds(entity, entityId, path, issues);
  });

  validateContextCycles(index, issues);

  for (const [entityId, entity] of index.entities) {
    const path = `entities.${entityId}`;

    validateAttributes(entity, entityId, path, index, issues);

    if (isContext(entity)) {
      validateContextEntity(entity, entityId, path, index, issues);
    } else {
      validateNonContextEntity(entity, entityId, path, index, issues);
    }
  }
};

const validateRelationshipShape = (
  relationship: JsonObject,
  relationshipId: string,
  path: string,
  issues: ValidationIssue[],
): void => {
  if (!isNonEmptyString(relationship['label'])) {
    pushIssue(
      issues,
      'relationship.shape',
      `${path}.label`,
      'relationship label must be a non-empty string.',
      relationshipId,
    );
  }

  if (typeof relationship['kind'] !== 'string') {
    pushIssue(
      issues,
      'relationship.shape',
      `${path}.kind`,
      'relationship kind is required.',
      relationshipId,
    );
  } else if (
    !(RELATIONSHIP_KINDS as readonly string[]).includes(
      String(relationship['kind']),
    )
  ) {
    pushIssue(
      issues,
      'relationship.shape',
      `${path}.kind`,
      `unsupported relationship kind '${String(relationship['kind'])}'.`,
      relationshipId,
    );
  }

  for (const endpoint of ['source', 'target'] as const) {
    const ref = relationship[`${endpoint}Ref`];

    if (typeof ref !== 'string') {
      pushIssue(
        issues,
        'relationship.shape',
        `${path}.${endpoint}Ref`,
        `${endpoint}Ref must be an object id.`,
        relationshipId,
      );
    }

    const cardinality = relationship[`${endpoint}Cardinality`];

    if (cardinality !== undefined && !isCardinality(cardinality)) {
      pushIssue(
        issues,
        'relationship.cardinality',
        `${path}.${endpoint}Cardinality`,
        `${endpoint}Cardinality must declare a valid min and max.`,
        relationshipId,
      );
    }
  }
};

const PLAYS_ROLE_PAIRS: readonly string[] = [
  'participant.party>role.party',
  'participant.party>role.third_party',
  'participant.thing>role.domain',
];

const isPlaysRolePair = (
  source: JsonObject,
  target: JsonObject,
): boolean => {
  const pair = `${signatureOf(source).join('.')}>${signatureOf(target).join('.')}`;

  if (PLAYS_ROLE_PAIRS.includes(pair)) {
    return true;
  }

  // An external Context can play an Other Context Role.
  if (
    signatureOf(source)[0] === 'context' &&
    signatureOf(target).join('.') === 'role.context'
  ) {
    return true;
  }

  // A moment Evidence can play an Evidence Role owned by another Context.
  // Moment evidences are: fulfillment_confirmation, other_evidence, contract.
  return (
    signatureOf(source)[0] === 'evidence' &&
    (kindOf(source) === 'fulfillment_confirmation' ||
      kindOf(source) === 'other_evidence' ||
      kindOf(source) === 'contract') &&
    signatureOf(target).join('.') === 'role.evidence'
  );
};

const validateRelationships = (
  raw: RawDocument,
  index: ModelIndex,
  issues: ValidationIssue[],
): void => {
  raw.relationships.forEach((relationship, position) => {
    const path = `relationships[${position}]`;
    const relationshipId = asString(relationship, 'id') ?? '';

    validateRelationshipShape(relationship, relationshipId, path, issues);

    const sourceRef = asString(relationship, 'sourceRef');
    const targetRef = asString(relationship, 'targetRef');
    const source =
      sourceRef === undefined ? undefined : index.entities.get(sourceRef);
    const target =
      targetRef === undefined ? undefined : index.entities.get(targetRef);

    if (sourceRef !== undefined && source === undefined) {
      pushIssue(
        issues,
        'relationship.endpoint.unresolved',
        `${path}.sourceRef`,
        `unknown sourceRef '${sourceRef}'.`,
        relationshipId,
      );
    }

    if (targetRef !== undefined && target === undefined) {
      pushIssue(
        issues,
        'relationship.endpoint.unresolved',
        `${path}.targetRef`,
        `unknown targetRef '${targetRef}'.`,
        relationshipId,
      );
    }

    if (source === undefined || target === undefined) {
      return;
    }

    if (sourceRef === targetRef) {
      pushIssue(
        issues,
        'relationship.self',
        path,
        'self relationships are not allowed.',
        relationshipId,
      );
      return;
    }

    const sourceSignature = signatureOf(source).join('.');
    const targetSignature = signatureOf(target).join('.');

    if (
      sourceSignature === 'evidence.contract' &&
      targetSignature === 'evidence.contract'
    ) {
      pushIssue(
        issues,
        'relationship.contractPair',
        path,
        'Contract must not connect directly to Contract.',
        relationshipId,
      );
      return;
    }

    const kind = kindOf(relationship);
    const sourceContext = ownerContextOf(source);
    const targetContext = ownerContextOf(target);

    if (kind === 'plays_role') {
      if (!isPlaysRolePair(source, target)) {
        pushIssue(
          issues,
          'relationship.playsRole.endpoints',
          path,
          'invalid plays_role direction or endpoint types.',
          relationshipId,
        );
        return;
      }

      const momentPlaysEvidenceRole =
        signatureOf(source)[0] === 'evidence' &&
        targetSignature === 'role.evidence';

      if (momentPlaysEvidenceRole && sourceContext === targetContext) {
        pushIssue(
          issues,
          'relationship.playsRole.endpoints',
          path,
          'Evidence Role player must come from another Context.',
          relationshipId,
        );
      }

      return;
    }

    if (kind !== 'references') {
      return;
    }

    if (!isEntityRecord(source) || !isEntityRecord(target)) {
      pushIssue(
        issues,
        'relationship.references.endpoints',
        path,
        'references requires Entity endpoints.',
        relationshipId,
      );
      return;
    }

    const contractToProposal =
      sourceSignature === 'evidence.contract' &&
      targetSignature === 'evidence.proposal';
    const evidenceToThing =
      signatureOf(source)[0] === 'evidence' &&
      targetSignature === 'participant.thing';

    if (
      sourceContext !== targetContext &&
      !contractToProposal &&
      !evidenceToThing &&
      !(
        signatureOf(source)[0] === 'evidence' &&
        signatureOf(target)[0] === 'evidence' &&
        (kindOf(target) === 'fulfillment_confirmation' ||
          kindOf(target) === 'other_evidence')
      )
    ) {
      pushIssue(
        issues,
        'relationship.references.crossContext',
        path,
        'unsupported cross-context references relationship.',
        relationshipId,
      );
    }

    if (contractToProposal) {
      const proposalContext = index.entities.get(targetContext ?? '');

      if (asString(proposalContext ?? {}, 'parentContextRef') !== sourceContext) {
        pushIssue(
          issues,
          'relationship.references.crossContext',
          path,
          'Proposal Context must bind its parentContextRef to the referencing Contract Context.',
          relationshipId,
        );
      }
    }

    if (
      signatureOf(source)[0] === 'evidence' &&
      !evidenceToThing &&
      signatureOf(target)[0] !== 'evidence' &&
      targetSignature !== 'role.evidence'
    ) {
      pushIssue(
        issues,
        'relationship.references.endpoints',
        path,
        'Evidence references must target a Thing, Evidence or Evidence Role.',
        relationshipId,
      );
    }
  });
};

const validateRuleShape = (
  rule: JsonObject,
  ruleId: string,
  path: string,
  issues: ValidationIssue[],
): void => {
  for (const field of ['label', 'description', 'expression'] as const) {
    if (!isNonEmptyString(rule[field])) {
      pushIssue(
        issues,
        'rule.shape',
        `${path}.${field}`,
        `rule ${field} must be a non-empty string.`,
        ruleId,
      );
    }
  }

  const kind = kindOf(rule);

  if (kind === undefined) {
    pushIssue(issues, 'rule.shape', `${path}.kind`, 'rule kind is required.', ruleId);
  } else if (!(RULE_KINDS as readonly string[]).includes(kind)) {
    pushIssue(
      issues,
      'rule.shape',
      `${path}.kind`,
      `unsupported rule kind '${kind}'.`,
      ruleId,
    );
  }

  if (
    rule['resultType'] !== undefined &&
    !(VALUE_TYPES as readonly string[]).includes(String(rule['resultType']))
  ) {
    pushIssue(
      issues,
      'rule.resultType',
      `${path}.resultType`,
      `unsupported rule resultType '${String(rule['resultType'])}'.`,
      ruleId,
    );
  }

  if (
    typeof kind === 'string' &&
    (BOOLEAN_RULE_KINDS as readonly string[]).includes(kind) &&
    rule['resultType'] !== 'bool'
  ) {
    pushIssue(
      issues,
      'rule.resultType',
      `${path}.resultType`,
      `${kind} Rule resultType must be bool.`,
      ruleId,
    );
  }

  if (kind !== 'derivation' && rule['target'] !== undefined) {
    pushIssue(
      issues,
      'rule.target.forbidden',
      `${path}.target`,
      'only a derivation Rule may define target.',
      ruleId,
    );
  }

  if (kind === 'derivation' && rule['target'] === undefined) {
    pushIssue(
      issues,
      'rule.target.required',
      `${path}.target`,
      'a derivation Rule must declare the target attribute it writes.',
      ruleId,
    );
  }

  const target = rule['target'];

  if (target !== undefined) {
    if (
      !isObject(target) ||
      typeof target['entityRef'] !== 'string' ||
      typeof target['attribute'] !== 'string'
    ) {
      pushIssue(
        issues,
        'rule.target.unresolved',
        `${path}.target`,
        'rule target requires entityRef and attribute.',
        ruleId,
      );
    } else if (Object.keys(target).some((key) => !['entityRef', 'attribute'].includes(key))) {
      pushIssue(
        issues,
        'rule.target.unresolved',
        `${path}.target`,
        'rule target only supports entityRef and attribute.',
        ruleId,
      );
    }
  }

  const bindings = rule['bindings'];

  if (!isObject(bindings)) {
    pushIssue(
      issues,
      'rule.shape',
      `${path}.bindings`,
      'rule bindings must be an object.',
      ruleId,
    );
    return;
  }

  for (const [variable, binding] of Object.entries(bindings)) {
    if (!CEL_VARIABLE_PATTERN.test(variable)) {
      pushIssue(
        issues,
        'rule.shape',
        `${path}.bindings.${variable}`,
        `binding alias '${variable}' must be a CEL identifier.`,
        ruleId,
      );
    }

    if (!isRuleBinding(binding)) {
      pushIssue(
        issues,
        'rule.shape',
        `${path}.bindings.${variable}`,
        'binding must declare either a modeled ref or a runtime value type.',
        ruleId,
      );
    }
  }
};

const validateRules = (
  raw: RawDocument,
  index: ModelIndex,
  issues: ValidationIssue[],
): void => {
  raw.rules.forEach((rule, position) => {
    const path = `rules[${position}]`;
    const ruleId = asString(rule, 'id') ?? '';

    validateRuleShape(rule, ruleId, path, issues);

    const contextRef = asString(rule, 'contextRef');

    if (contextRef === undefined) {
      pushIssue(
        issues,
        'rule.contextRef.unresolved',
        `${path}.contextRef`,
        'rule requires contextRef.',
        ruleId,
      );
    } else if (!isContext(index.entities.get(contextRef))) {
      pushIssue(
        issues,
        'rule.contextRef.unresolved',
        `${path}.contextRef`,
        `rule contextRef '${contextRef}' must reference a Context.`,
        ruleId,
      );
    }

    const bindings = isObject(rule['bindings']) ? rule['bindings'] : {};

    for (const [variable, binding] of Object.entries(bindings)) {
      if (
        isObject(binding) &&
        typeof binding['ref'] === 'string' &&
        !index.entities.has(binding['ref'])
      ) {
        pushIssue(
          issues,
          'rule.binding.unresolved',
          `${path}.bindings.${variable}`,
          `binding references unknown id '${binding['ref']}'.`,
          ruleId,
        );
      }
    }

    const target = isObject(rule['target']) ? rule['target'] : undefined;
    const targetEntityRef =
      target === undefined ? undefined : asString(target, 'entityRef');
    const targetAttribute =
      target === undefined ? undefined : asString(target, 'attribute');

    if (kindOf(rule) !== 'derivation' || target === undefined) {
      return;
    }

    if (targetEntityRef === undefined || targetAttribute === undefined) {
      return;
    }

    const entity = index.entities.get(targetEntityRef);

    if (entity === undefined) {
      pushIssue(
        issues,
        'rule.target.unresolved',
        `${path}.target`,
        `unknown target entity '${targetEntityRef}'.`,
        ruleId,
      );
      return;
    }

    const attribute = attributeOf(entity, targetAttribute);

    if (attribute === undefined) {
      pushIssue(
        issues,
        'rule.target.unresolved',
        `${path}.target`,
        `target entity '${targetEntityRef}' has no attribute '${targetAttribute}'.`,
        ruleId,
      );
      return;
    }

    if (attribute['derivedByRuleRef'] !== ruleId) {
      pushIssue(
        issues,
        'rule.derivation.mismatch',
        `${path}.target`,
        `derivation Rule must be referenced by '${targetEntityRef}.${targetAttribute}'.`,
        ruleId,
      );
    }
  });
};

const validateDerivedAttributes = (
  index: ModelIndex,
  issues: ValidationIssue[],
): void => {
  for (const [entityId, entity] of index.entities) {
    const attributes = entity['attributes'];

    if (!Array.isArray(attributes)) {
      continue;
    }

    attributes.forEach((attribute, position) => {
      if (!isObject(attribute)) {
        return;
      }

      const ruleRef = attribute['derivedByRuleRef'];
      const attributeName = attribute['name'];

      if (typeof ruleRef !== 'string' || typeof attributeName !== 'string') {
        return;
      }

      const rule = index.rules.get(ruleRef);

      if (rule === undefined) {
        return;
      }

      const path = `entities.${entityId}.attributes[${position}]`;
      const target = isObject(rule['target']) ? rule['target'] : {};

      if (
        kindOf(rule) !== 'derivation' ||
        target['entityRef'] !== entityId ||
        target['attribute'] !== attributeName
      ) {
        pushIssue(
          issues,
          'rule.derivation.mismatch',
          path,
          `derivedByRuleRef '${ruleRef}' must target this exact attribute.`,
          entityId,
        );
      }

      if (asString(rule, 'contextRef') !== ownerContextOf(entity)) {
        pushIssue(
          issues,
          'rule.derivation.context',
          path,
          'derivation Rule must belong to the target Entity Context.',
          entityId,
        );
      }
    });
  }
};

/**
 * Static FM v5 checks.
 *
 * Scope: document shape, identifier grammar, category/kind contracts,
 * reference resolution, context ownership, relationship endpoint rules and
 * derivation symmetry. Traceability, key-data providers, scope completeness and
 * CEL evaluation are separate passes in `evidence-model-core`, not re-implemented
 * here.
 */
export function strictValidateDomainModel(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const raw = readDocument(input, issues);

  if (raw === undefined || raw.entities.length === 0) {
    if (raw !== undefined) {
      pushIssue(
        issues,
        'document.shape',
        '$.entities',
        'model must contain at least one entity.',
      );
    }

    return { valid: false, issues: dedupeIssues(issues) };
  }

  const index: ModelIndex = {
    entities: new Map(),
    relationships: new Map(),
    rules: new Map(),
  };

  indexCollection(
    raw.entities,
    'entities',
    'entity',
    ENTITY_KEYS,
    index,
    issues,
  );
  indexCollection(
    raw.relationships,
    'relationships',
    'relationship',
    RELATIONSHIP_KEYS,
    index,
    issues,
  );
  indexCollection(raw.rules, 'rules', 'rule', RULE_KEYS, index, issues);

  validateManifest(raw.manifest, index, issues);
  validateEntities(raw, index, issues);
  validateRelationships(raw, index, issues);
  validateRules(raw, index, issues);
  validateDerivedAttributes(index, issues);

  const deduped = dedupeIssues(issues);

  return { valid: deduped.length === 0, issues: deduped };
}

/** Throws {@link DomainModelValidationError} instead of returning issues. */
export function assertValidDomainModel(
  input: unknown,
): asserts input is Record<string, unknown> {
  const result = strictValidateDomainModel(input);

  if (!result.valid) {
    throw new DomainModelValidationError(result.issues);
  }
}
