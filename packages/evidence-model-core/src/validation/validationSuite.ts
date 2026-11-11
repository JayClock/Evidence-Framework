import {
  DOMAIN_ID_PATTERN,
  type AttributeAST,
  type DomainModelDocument,
  type EntityAST,
  type RuleBinding,
  entitySignature,
  isEvidenceEntity,
} from '@evidence-poc/evidence-schema';

import {
  VALIDATION_INSTANCE_TREE,
  VALIDATION_SCENARIO_TREE,
  type DomainModelBundle,
} from '../adapters/modelBundle.js';
import type { ModelSourceFile } from '../adapters/modelSourceFiles.js';

import {
  isAttributeName,
  isTimestampText,
  normalizeJsonValue,
  validateTypedValue,
} from './typedValues.js';

/**
 * The `validation/` trees the FM checks execute.
 *
 * Loading mirrors `load_validation_suite` and validation mirrors
 * `validate_validation_suite` in `fm_simulation.py`, error message for error
 * message where the wording carries a rule.
 */

type JsonObject = Record<string, unknown>;

const FULFILLMENT_STATUSES = [
  'not_requested',
  'pending',
  'completed',
  'breached',
] as const;

export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

/** One asserted Evidence Instance the scenarios issue. */
export interface EvidenceInstance {
  type: 'evidence_instance';
  id: string;
  entityRef: string;
  values: Record<string, unknown>;
  basedOn?: readonly string[];
  notes?: string;
}

/** One issue step: which Role issued which instance with what it could see. */
export interface ScenarioStep {
  sequence: number;
  actingRoleRef: string;
  issueInstanceRef: string;
  availableInstanceRefs?: readonly string[];
  notes?: string;
}

/** One rule input: an instance, a list of instances, or a literal value. */
export type EvaluationBinding =
  | { instanceRef: string }
  | { instanceRefs: readonly string[] }
  | { value: unknown };

export interface ScenarioEvaluation {
  ruleRef: string;
  bindings: Record<string, EvaluationBinding>;
  expectedResult: unknown;
  targetInstanceRef?: string;
  notes?: string;
}

export interface FulfillmentStatusExpectation {
  requestInstanceRef: string;
  status: FulfillmentStatus;
  requestEntityRef?: string;
}

export interface ScenarioExpectations {
  fulfillmentStatuses: readonly FulfillmentStatusExpectation[];
}

/** One deterministic scenario over the asserted instances. */
export interface Scenario {
  type: 'fm_scenario';
  id: string;
  label: string;
  asOf: string;
  givenInstanceRefs?: readonly string[];
  steps: readonly ScenarioStep[];
  evaluations?: readonly ScenarioEvaluation[];
  expectations: ScenarioExpectations;
  /**
   * Requests a business decision closes outside the rules. It is read by the
   * simulator but no schema declares it, so it stays optional and unchecked.
   */
  manualCompletionRequestRefs?: readonly string[];
  notes?: string;
}

/** Everything `validation/` contributed, plus the problems found while reading it. */
export interface ValidationSuite {
  instances: readonly EvidenceInstance[];
  scenarios: readonly Scenario[];
  /** Shape problems; an empty list means every document parsed. */
  errors: readonly string[];
}

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isId = (value: unknown): value is string =>
  typeof value === 'string' && DOMAIN_ID_PATTERN.test(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

interface ShapeSpec {
  required: readonly string[];
  optional: readonly string[];
}

/**
 * Checks one object against a shape spec and returns it, or undefined.
 *
 * The messages name the offending property the way a validator's path would, so
 * a reader can jump from the report to the file.
 */
const readObject = (
  value: unknown,
  path: string,
  spec: ShapeSpec,
  errors: string[],
): JsonObject | undefined => {
  if (!isRecord(value)) {
    errors.push(`${path}: must be an object`);

    return undefined;
  }

  let ok = true;

  for (const key of spec.required) {
    if (!(key in value)) {
      errors.push(`${path}: must have required property '${key}'`);
      ok = false;
    }
  }

  for (const key of Object.keys(value)) {
    if (!spec.required.includes(key) && !spec.optional.includes(key)) {
      errors.push(`${path}: must NOT have additional property '${key}'`);
      ok = false;
    }
  }

  return ok ? value : undefined;
};

const readId = (
  value: unknown,
  path: string,
  errors: string[],
): string | undefined => {
  if (!isId(value)) {
    errors.push(`${path}: must be a stable FM id`);

    return undefined;
  }

  return value;
};

const readIdList = (
  value: unknown,
  path: string,
  errors: string[],
): string[] | undefined => {
  if (!isStringList(value)) {
    errors.push(`${path}: must be an array of ids`);

    return undefined;
  }

  if (new Set(value).size !== value.length) {
    errors.push(`${path}: must not contain duplicates`);
  }

  const invalid = value.find((item) => !isId(item));

  if (invalid !== undefined) {
    errors.push(`${path}: '${invalid}' is not a stable FM id`);
  }

  return value;
};

const readInstance = (value: unknown, path: string, errors: string[]): EvidenceInstance | undefined => {
  const object = readObject(
    value,
    path,
    { required: ['type', 'id', 'entityRef', 'values'], optional: ['basedOn', 'notes'] },
    errors,
  );

  if (object === undefined) {
    return undefined;
  }

  if (object['type'] !== 'evidence_instance') {
    errors.push(
      `${path}: type must be 'evidence_instance', found ${JSON.stringify(object['type'])}`,
    );
  }

  const id = readId(object['id'], `${path}/id`, errors);
  const entityRef = readId(object['entityRef'], `${path}/entityRef`, errors);
  const values = object['values'];

  if (!isRecord(values)) {
    errors.push(`${path}/values: must be an object`);
  } else {
    for (const name of Object.keys(values)) {
      if (!isAttributeName(name)) {
        errors.push(`${path}/values: '${name}' is not a lower snake_case name`);
      }
    }
  }

  const basedOn =
    object['basedOn'] === undefined
      ? undefined
      : readIdList(object['basedOn'], `${path}/basedOn`, errors);

  if (object['notes'] !== undefined && !isNonEmptyString(object['notes'])) {
    errors.push(`${path}/notes: must be a non-empty string`);
  }

  if (
    id === undefined ||
    entityRef === undefined ||
    !isRecord(values) ||
    object['type'] !== 'evidence_instance'
  ) {
    return undefined;
  }

  return {
    type: 'evidence_instance',
    id,
    entityRef,
    values: { ...values },
    ...(basedOn === undefined ? {} : { basedOn }),
    ...(typeof object['notes'] === 'string' ? { notes: object['notes'] } : {}),
  };
};

const readStep = (value: unknown, path: string, errors: string[]): ScenarioStep | undefined => {
  const object = readObject(
    value,
    path,
    {
      required: ['sequence', 'actingRoleRef', 'issueInstanceRef'],
      optional: ['availableInstanceRefs', 'notes'],
    },
    errors,
  );

  if (object === undefined) {
    return undefined;
  }

  const sequence = object['sequence'];

  if (typeof sequence !== 'number' || !Number.isInteger(sequence) || sequence < 1) {
    errors.push(`${path}/sequence: must be an integer >= 1`);
  }

  const actingRoleRef = readId(object['actingRoleRef'], `${path}/actingRoleRef`, errors);
  const issueInstanceRef = readId(
    object['issueInstanceRef'],
    `${path}/issueInstanceRef`,
    errors,
  );
  const available =
    object['availableInstanceRefs'] === undefined
      ? undefined
      : readIdList(object['availableInstanceRefs'], `${path}/availableInstanceRefs`, errors);

  if (typeof sequence !== 'number' || actingRoleRef === undefined || issueInstanceRef === undefined) {
    return undefined;
  }

  return {
    sequence,
    actingRoleRef,
    issueInstanceRef,
    ...(available === undefined ? {} : { availableInstanceRefs: available }),
    ...(typeof object['notes'] === 'string' ? { notes: object['notes'] } : {}),
  };
};

const readBinding = (
  value: unknown,
  path: string,
  errors: string[],
): EvaluationBinding | undefined => {
  if (!isRecord(value)) {
    errors.push(`${path}: must be an object`);

    return undefined;
  }

  const keys = Object.keys(value);

  if (keys.length !== 1) {
    errors.push(`${path}: must declare exactly one of instanceRef, instanceRefs or value`);

    return undefined;
  }

  if (keys[0] === 'instanceRef') {
    const instanceRef = readId(value['instanceRef'], `${path}/instanceRef`, errors);

    return instanceRef === undefined ? undefined : { instanceRef };
  }

  if (keys[0] === 'instanceRefs') {
    const instanceRefs = readIdList(value['instanceRefs'], `${path}/instanceRefs`, errors);

    return instanceRefs === undefined ? undefined : { instanceRefs };
  }

  if (keys[0] === 'value') {
    return { value: value['value'] };
  }

  errors.push(`${path}: must declare exactly one of instanceRef, instanceRefs or value`);

  return undefined;
};

const readEvaluation = (
  value: unknown,
  path: string,
  errors: string[],
): ScenarioEvaluation | undefined => {
  const object = readObject(
    value,
    path,
    {
      required: ['ruleRef', 'bindings', 'expectedResult'],
      optional: ['targetInstanceRef', 'notes'],
    },
    errors,
  );

  if (object === undefined) {
    return undefined;
  }

  const ruleRef = readId(object['ruleRef'], `${path}/ruleRef`, errors);
  const bindings: Record<string, EvaluationBinding> = {};

  if (!isRecord(object['bindings'])) {
    errors.push(`${path}/bindings: must be an object`);
  } else {
    for (const [variable, source] of Object.entries(object['bindings'])) {
      const binding = readBinding(source, `${path}/bindings/${variable}`, errors);

      if (binding !== undefined) {
        bindings[variable] = binding;
      }
    }
  }

  const targetInstanceRef =
    object['targetInstanceRef'] === undefined
      ? undefined
      : readId(object['targetInstanceRef'], `${path}/targetInstanceRef`, errors);

  if (ruleRef === undefined || !('expectedResult' in object)) {
    return undefined;
  }

  return {
    ruleRef,
    bindings,
    expectedResult: object['expectedResult'],
    ...(targetInstanceRef === undefined ? {} : { targetInstanceRef }),
    ...(typeof object['notes'] === 'string' ? { notes: object['notes'] } : {}),
  };
};

const readExpectations = (
  value: unknown,
  path: string,
  errors: string[],
): ScenarioExpectations | undefined => {
  const object = readObject(value, path, { required: ['fulfillmentStatuses'], optional: [] }, errors);

  if (object === undefined) {
    return undefined;
  }

  const statuses = object['fulfillmentStatuses'];

  if (!Array.isArray(statuses)) {
    errors.push(`${path}/fulfillmentStatuses: must be an array`);

    return undefined;
  }

  const fulfillmentStatuses: FulfillmentStatusExpectation[] = [];

  statuses.forEach((item, index) => {
    const itemPath = `${path}/fulfillmentStatuses[${index}]`;
    const entry = readObject(
      item,
      itemPath,
      { required: ['requestInstanceRef', 'status'], optional: ['requestEntityRef'] },
      errors,
    );

    if (entry === undefined) {
      return;
    }

    const requestInstanceRef = readId(
      entry['requestInstanceRef'],
      `${itemPath}/requestInstanceRef`,
      errors,
    );
    const status = entry['status'];

    if (!FULFILLMENT_STATUSES.includes(status as FulfillmentStatus)) {
      errors.push(
        `${itemPath}/status: must be one of ${FULFILLMENT_STATUSES.join(', ')}`,
      );
    }

    const requestEntityRef =
      entry['requestEntityRef'] === undefined
        ? undefined
        : readId(entry['requestEntityRef'], `${itemPath}/requestEntityRef`, errors);

    if (requestInstanceRef === undefined) {
      return;
    }

    fulfillmentStatuses.push({
      requestInstanceRef,
      status: status as FulfillmentStatus,
      ...(requestEntityRef === undefined ? {} : { requestEntityRef }),
    });
  });

  return { fulfillmentStatuses };
};

const readScenario = (value: unknown, path: string, errors: string[]): Scenario | undefined => {
  const object = readObject(
    value,
    path,
    {
      required: ['type', 'id', 'label', 'asOf', 'steps', 'expectations'],
      optional: ['givenInstanceRefs', 'evaluations', 'notes'],
    },
    errors,
  );

  if (object === undefined) {
    return undefined;
  }

  if (object['type'] !== 'fm_scenario') {
    errors.push(
      `${path}: type must be 'fm_scenario', found ${JSON.stringify(object['type'])}`,
    );
  }

  const id = readId(object['id'], `${path}/id`, errors);
  const asOf = isNonEmptyString(object['asOf']) ? object['asOf'] : undefined;

  if (!isNonEmptyString(object['label'])) {
    errors.push(`${path}/label: must be a non-empty string`);
  }

  if (!isNonEmptyString(object['asOf'])) {
    errors.push(`${path}/asOf: must be a non-empty string`);
  }

  if (!isTimestampText(object['asOf'])) {
    errors.push(`${path}/asOf: must be an RFC 3339 timestamp`);
  }

  const given =
    object['givenInstanceRefs'] === undefined
      ? undefined
      : readIdList(object['givenInstanceRefs'], `${path}/givenInstanceRefs`, errors);

  const steps: ScenarioStep[] = [];

  if (!Array.isArray(object['steps']) || object['steps'].length === 0) {
    errors.push(`${path}/steps: must be an array with at least one step`);
  } else {
    object['steps'].forEach((item, index) => {
      const step = readStep(item, `${path}/steps[${index}]`, errors);

      if (step !== undefined) {
        steps.push(step);
      }
    });
  }

  const evaluations: ScenarioEvaluation[] = [];

  if (object['evaluations'] !== undefined) {
    if (!Array.isArray(object['evaluations'])) {
      errors.push(`${path}/evaluations: must be an array`);
    } else {
      object['evaluations'].forEach((item, index) => {
        const evaluation = readEvaluation(item, `${path}/evaluations[${index}]`, errors);

        if (evaluation !== undefined) {
          evaluations.push(evaluation);
        }
      });
    }
  }

  const expectations = readExpectations(object['expectations'], `${path}/expectations`, errors);

  if (object['notes'] !== undefined && !isNonEmptyString(object['notes'])) {
    errors.push(`${path}/notes: must be a non-empty string`);
  }

  if (
    id === undefined ||
    asOf === undefined ||
    object['type'] !== 'fm_scenario' ||
    expectations === undefined ||
    !isNonEmptyString(object['label'])
  ) {
    return undefined;
  }

  return {
    type: 'fm_scenario',
    id,
    label: object['label'],
    asOf,
    ...(given === undefined ? {} : { givenInstanceRefs: given }),
    steps,
    evaluations,
    expectations,
    ...(Array.isArray(object['manualCompletionRequestRefs'])
      ? {
          manualCompletionRequestRefs: object['manualCompletionRequestRefs'].filter(
            (item): item is string => typeof item === 'string',
          ),
        }
      : {}),
    ...(typeof object['notes'] === 'string' ? { notes: object['notes'] } : {}),
  };
};

/** `scenario.successful-payment` → `scenario--successful-payment.json`. */
const expectedFileName = (id: string): string => `${id.split('.').join('--')}.json`;

interface ValidationDocument {
  path: string;
  content: unknown;
}

/**
 * Turns raw documents into a suite, reporting every problem it found.
 *
 * Duplicate ids across files are errors, as is a filename that does not match
 * the id inside it: both make a scenario silently shadow another.
 */
const buildSuite = (
  documents: readonly ValidationDocument[],
  naming: 'file' | 'inline',
): ValidationSuite => {
  const errors: string[] = [];
  const instances: EvidenceInstance[] = [];
  const scenarios: Scenario[] = [];
  const seenIds = new Map<string, string>();
  let sawValidationTree = false;

  for (const document of documents) {
    const { path, content } = document;
    const isInstance = path.startsWith(`${VALIDATION_INSTANCE_TREE}/`);
    const isScenario = path.startsWith(`${VALIDATION_SCENARIO_TREE}/`);

    if (!isInstance && !isScenario) {
      continue;
    }

    sawValidationTree = true;

    if (isInstance) {
      const nested = path.slice(VALIDATION_INSTANCE_TREE.length + 1);
      if (nested.includes('/')) {
        errors.push(`${path}: nested directories are not allowed`);
        continue;
      }
    }

    if (isScenario) {
      const nested = path.slice(VALIDATION_SCENARIO_TREE.length + 1);
      if (nested.includes('/')) {
        errors.push(`${path}: nested directories are not allowed`);
        continue;
      }
    }

    if (!path.endsWith('.json')) {
      errors.push(`${path}: only .json files are allowed`);
      continue;
    }

    let parsed: unknown = content;

    if (typeof content === 'string') {
      try {
        parsed = JSON.parse(content);
      } catch (error) {
        errors.push(
          `${path}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }
    }

    const record = isInstance
      ? readInstance(parsed, path, errors)
      : readScenario(parsed, path, errors);

    if (record === undefined) {
      continue;
    }

    const previous = seenIds.get(record.id);

    if (previous !== undefined) {
      errors.push(`${path}: duplicate validation id '${record.id}' already defined in ${previous}`);
      continue;
    }

    seenIds.set(record.id, path);

    if (naming === 'file' && !path.endsWith(`/${expectedFileName(record.id)}`)) {
      errors.push(`${path}: filename must be '${expectedFileName(record.id)}' for id '${record.id}'`);
    }

    if (isInstance) {
      instances.push(record as EvidenceInstance);
    } else {
      scenarios.push(record as Scenario);
    }
  }

  if (!sawValidationTree) {
    // A tree without `validation/` has nothing to run and nothing to report.
    return { instances, scenarios, errors };
  }

  if (instances.length === 0) {
    errors.push(
      `${VALIDATION_INSTANCE_TREE}/ must contain at least one Evidence Instance`,
    );
  }

  if (scenarios.length === 0) {
    errors.push(`${VALIDATION_SCENARIO_TREE}/ must contain at least one Scenario`);
  }

  return { instances, scenarios, errors };
};

/** Reads the suite a `validation/` tree contributes to a set of source files. */
export const validationSuiteFromFiles = (
  files: readonly ModelSourceFile[],
): ValidationSuite =>
  buildSuite(
    files
      .map((file) => ({ path: file.path.replaceAll('\\', '/'), content: file.content }))
      .filter((file) => file.path.startsWith('validation/'))
      .sort((left, right) => left.path.localeCompare(right.path)),
    'file',
  );

/** Reads the suite a single-file bundle carries, if any. */
export const validationSuiteFromBundle = (
  bundle: DomainModelBundle,
): ValidationSuite => {
  const validation = bundle.validation;

  if (validation === undefined) {
    return { instances: [], scenarios: [], errors: [] };
  }

  return buildSuite(
    [
      ...validation.instances.map((item, index) => ({
        path: `${VALIDATION_INSTANCE_TREE}#${index}`,
        content: item,
      })),
      ...validation.scenarios.map((item, index) => ({
        path: `${VALIDATION_SCENARIO_TREE}#${index}`,
        content: item,
      })),
    ],
    'inline',
  );
};

/** Accepts either a source tree or a bundle and returns its suite. */
export const loadValidationSuite = (
  source: readonly ModelSourceFile[] | DomainModelBundle,
): ValidationSuite =>
  Array.isArray(source)
    ? validationSuiteFromFiles(source)
    : validationSuiteFromBundle(source as DomainModelBundle);

const attributesOf = (entity: EntityAST | undefined): Map<string, AttributeAST> =>
  new Map(
    (entity?.attributes ?? []).map((attribute) => [attribute.name, attribute]),
  );

const entityOf = (
  document: DomainModelDocument,
  entityId: string | undefined,
): EntityAST | undefined =>
  entityId === undefined
    ? undefined
    : document.entities.find((entity) => entity.id === entityId);

const playsRoleSources = (
  document: DomainModelDocument,
  roleRef: string,
): string[] =>
  document.relationships
    .filter(
      (relationship) =>
        relationship.kind === 'plays_role' && relationship.targetRef === roleRef,
    )
    .map((relationship) => relationship.sourceRef);

const dedupe = (messages: readonly string[]): string[] => [...new Set(messages)];

const bindingReferences = (evaluation: ScenarioEvaluation): string[] => {
  const refs = new Set<string>();

  if (evaluation.targetInstanceRef !== undefined) {
    refs.add(evaluation.targetInstanceRef);
  }

  for (const binding of Object.values(evaluation.bindings)) {
    if ('instanceRef' in binding) {
      refs.add(binding.instanceRef);
    } else if ('instanceRefs' in binding) {
      binding.instanceRefs.forEach((ref) => refs.add(ref));
    }
  }

  return [...refs];
};

const validateBinding = (
  model: DomainModelDocument,
  instances: ReadonlyMap<string, EvidenceInstance>,
  issued: ReadonlySet<string>,
  scenarioId: string,
  evaluationIndex: number,
  variable: string,
  refs: readonly string[],
  suppliedCardinality: 'one' | 'many',
  binding: RuleBinding,
  errors: string[],
): void => {
  const expectedCardinality =
    'ref' in binding ? (binding.cardinality ?? 'one') : 'one';

  if (!('ref' in binding)) {
    errors.push(
      `${scenarioId}.evaluations[${evaluationIndex}]: binding '${variable}' expects a scalar value`,
    );

    return;
  }

  if (suppliedCardinality !== expectedCardinality) {
    errors.push(
      `${scenarioId}.evaluations[${evaluationIndex}]: binding '${variable}' expects cardinality '${expectedCardinality}', found '${suppliedCardinality}'`,
    );
  }

  const targetRef = binding.ref;
  const target = entityOf(model, targetRef);
  const acceptedTypes =
    target !== undefined && entitySignature(target) === 'role.evidence'
      ? new Set(playsRoleSources(model, targetRef))
      : new Set([targetRef]);

  for (const instanceRef of refs) {
    const instance = instances.get(instanceRef);

    if (instance === undefined || !issued.has(instanceRef)) {
      errors.push(
        `${scenarioId}.evaluations[${evaluationIndex}]: binding '${variable}' references unknown or unissued instance '${instanceRef}'`,
      );
      continue;
    }

    if (!acceptedTypes.has(instance.entityRef)) {
      errors.push(
        `${scenarioId}.evaluations[${evaluationIndex}]: instance '${instanceRef}' must match binding '${binding.ref}' via its Evidence type or explicit plays_role`,
      );
    }
  }
};

/**
 * Checks the suite against the model, returning every problem found.
 *
 * The checks are the ones `fm_simulation.py` performs before a scenario may run:
 * an instance must instantiate a modeled Evidence Entity with completed required
 * values, and a scenario may only evaluate rules and use instances that the
 * model and its own steps actually make available.
 */
export const validateValidationSuite = (
  model: DomainModelDocument,
  suite: ValidationSuite,
): string[] => {
  const errors: string[] = [...suite.errors];
  const instances = new Map(suite.instances.map((item) => [item.id, item]));
  const rules = new Map(model.rules.map((rule) => [rule.id, rule]));

  for (const instance of suite.instances) {
    const entity = entityOf(model, instance.entityRef);

    if (entity === undefined || !isEvidenceEntity(entity)) {
      errors.push(
        `${instance.id}: entityRef must reference an Evidence Entity, found '${instance.entityRef}'`,
      );
      continue;
    }

    const attributes = attributesOf(entity);

    for (const name of Object.keys(instance.values)) {
      if (!attributes.has(name)) {
        errors.push(`${instance.id}: unknown value '${instance.entityRef}#${name}'`);
      }
    }

    for (const [name, attribute] of attributes) {
      if (attribute.required === true && attribute.derivedByRuleRef === undefined && !(name in instance.values)) {
        errors.push(
          `${instance.id}: required asserted value '${instance.entityRef}#${name}' is missing`,
        );
      }

      if (name in instance.values) {
        const reason = validateTypedValue(
          instance.values[name],
          attribute.valueType ?? 'dynamic',
        );

        if (reason !== null) {
          errors.push(`${instance.id}.${name}: ${reason}`);
        }
      }
    }

    for (const basedOn of instance.basedOn ?? []) {
      if (basedOn === instance.id) {
        errors.push(`${instance.id}: basedOn must not reference itself`);
      } else if (!instances.has(basedOn)) {
        errors.push(`${instance.id}: basedOn references unknown instance '${basedOn}'`);
      }
    }
  }

  for (const scenario of suite.scenarios) {
    const scenarioId = scenario.id;

    if (!isTimestampText(scenario.asOf)) {
      errors.push(`${scenarioId}: asOf must be an RFC 3339 timestamp`);
    }

    const given = [...(scenario.givenInstanceRefs ?? [])];
    const givenSet = new Set(given);
    const issued = new Set<string>();
    /** Instances each issued instance's acting Role could see. */
    const visibility = new Map<string, Set<string>>();

    for (const instanceRef of given) {
      visibility.set(instanceRef, new Set(givenSet));
    }

    for (const instanceRef of given) {
      const givenInstance = instances.get(instanceRef);

      if (givenInstance === undefined) {
        errors.push(`${scenarioId}: givenInstanceRefs contains unknown '${instanceRef}'`);
      } else if (issued.has(instanceRef)) {
        errors.push(`${scenarioId}: instance '${instanceRef}' is issued more than once`);
      } else {
        const missingBasis = (givenInstance?.basedOn ?? []).filter(
          (basis) => !givenSet.has(basis),
        );

        if (missingBasis.length > 0) {
          errors.push(
            `${scenarioId}: given instance '${instanceRef}' has unavailable basedOn instances ${JSON.stringify([...missingBasis].sort())}`,
          );
        }

        const entity = entityOf(model, givenInstance?.entityRef);

        for (const [name, attribute] of attributesOf(entity)) {
          if (attribute.required === true && !(name in (givenInstance?.values ?? {}))) {
            errors.push(
              `${scenarioId}: given instance '${instanceRef}' lacks completed required value '${givenInstance?.entityRef}#${name}'`,
            );
          }
        }
      }

      issued.add(instanceRef);
    }

    const sequences = new Set<number>();
    let previousSequence = 0;

    for (const step of scenario.steps) {
      if (sequences.has(step.sequence)) {
        errors.push(`${scenarioId}: duplicate step sequence ${step.sequence}`);
      }
      if (step.sequence <= previousSequence) {
        errors.push(`${scenarioId}: steps must be ordered by increasing sequence`);
      }

      sequences.add(step.sequence);
      previousSequence = step.sequence;

      const role = entityOf(model, step.actingRoleRef);

      if (role === undefined || !entitySignature(role).startsWith('role.')) {
        errors.push(
          `${scenarioId}.steps[${step.sequence}]: actingRoleRef references unknown Role '${step.actingRoleRef}'`,
        );
      }

      const instance = instances.get(step.issueInstanceRef);

      if (instance === undefined) {
        errors.push(
          `${scenarioId}.steps[${step.sequence}]: issueInstanceRef references unknown instance '${step.issueInstanceRef}'`,
        );
        continue;
      }

      if (issued.has(step.issueInstanceRef)) {
        errors.push(
          `${scenarioId}: instance '${step.issueInstanceRef}' is issued more than once`,
        );
      }

      const entity = entityOf(model, instance.entityRef);
      const expectedRole =
        entity !== undefined && 'responsibleRoleRef' in entity
          ? entity.responsibleRoleRef
          : undefined;

      if (expectedRole !== undefined && step.actingRoleRef !== expectedRole) {
        errors.push(
          `${scenarioId}.steps[${step.sequence}]: acting Role '${step.actingRoleRef}' must equal Evidence responsibleRoleRef '${expectedRole}'`,
        );
      }

      if (
        entity !== undefined &&
        entitySignature(entity) === 'evidence.contract' &&
        'roleRefs' in entity &&
        !(entity.roleRefs ?? []).includes(step.actingRoleRef)
      ) {
        errors.push(
          `${scenarioId}.steps[${step.sequence}]: Contract may only be issued by one of its roleRefs`,
        );
      }

      for (const dependency of instance.basedOn ?? []) {
        if (!issued.has(dependency)) {
          errors.push(
            `${scenarioId}.steps[${step.sequence}]: basedOn instance '${dependency}' must already be available`,
          );
        }
      }

      const visibleRefs =
        step.availableInstanceRefs === undefined
          ? (instance.basedOn ?? [])
          : step.availableInstanceRefs;
      const visible = new Set(visibleRefs);

      for (const available of [...visible].sort()) {
        if (!issued.has(available)) {
          errors.push(
            `${scenarioId}.steps[${step.sequence}]: available instance '${available}' has not been issued`,
          );
        }
      }

      const hiddenBasis = (instance.basedOn ?? []).filter(
        (basis) => !visible.has(basis),
      );

      if (hiddenBasis.length > 0) {
        errors.push(
          `${scenarioId}.steps[${step.sequence}]: acting Role cannot see required basedOn instances ${JSON.stringify([...hiddenBasis].sort())}`,
        );
      }

      visibility.set(step.issueInstanceRef, visible);
      issued.add(step.issueInstanceRef);
    }

    (scenario.evaluations ?? []).forEach((evaluation, index) => {
      const rule = rules.get(evaluation.ruleRef);

      if (rule === undefined) {
        errors.push(
          `${scenarioId}.evaluations[${index}]: unknown Rule '${evaluation.ruleRef}'`,
        );

        return;
      }

      const expectedError = validateTypedValue(
        evaluation.expectedResult,
        rule.resultType,
      );

      if (expectedError !== null) {
        errors.push(`${scenarioId}.evaluations[${index}].expectedResult: ${expectedError}`);
      }

      const declared = rule.bindings;
      const supplied = evaluation.bindings;
      const implicitAsOf = new Set(
        Object.entries(declared)
          .filter(
            ([variable, binding]) =>
              'type' in binding &&
              binding.type === 'timestamp' &&
              (variable === 'asOf' || variable === 'now'),
          )
          .map(([variable]) => variable),
      );
      const missing = Object.keys(declared).filter(
        (variable) => !(variable in supplied) && !implicitAsOf.has(variable),
      );
      const extra = Object.keys(supplied).filter(
        (variable) => !(variable in declared),
      );

      if (missing.length > 0) {
        errors.push(
          `${scenarioId}.evaluations[${index}]: missing bindings ${JSON.stringify(missing.sort())} for '${evaluation.ruleRef}'`,
        );
      }

      if (extra.length > 0) {
        errors.push(
          `${scenarioId}.evaluations[${index}]: unknown bindings ${JSON.stringify(extra.sort())} for '${evaluation.ruleRef}'`,
        );
      }

      for (const [variable, source] of Object.entries(supplied)) {
        const binding = declared[variable];

        if (binding === undefined) {
          continue;
        }

        if ('instanceRef' in source) {
          validateBinding(
            model,
            instances,
            issued,
            scenarioId,
            index,
            variable,
            [source.instanceRef],
            'one',
            binding,
            errors,
          );
        } else if ('instanceRefs' in source) {
          validateBinding(
            model,
            instances,
            issued,
            scenarioId,
            index,
            variable,
            source.instanceRefs,
            'many',
            binding,
            errors,
          );
        } else {
          if (implicitAsOf.has(variable) && source.value !== scenario.asOf) {
            errors.push(
              `${scenarioId}.evaluations[${index}]: binding '${variable}' must equal the Scenario asOf timestamp`,
            );
          }

          if (!('type' in binding)) {
            errors.push(
              `${scenarioId}.evaluations[${index}]: binding '${variable}' expects Evidence instance input`,
            );
          } else {
            const reason = validateTypedValue(source.value, binding.type ?? 'dynamic');

            if (reason !== null) {
              errors.push(
                `${scenarioId}.evaluations[${index}].bindings.${variable}: ${reason}`,
              );
            }
          }
        }
      }

      if (rule.kind === 'derivation') {
        if (evaluation.targetInstanceRef === undefined) {
          errors.push(
            `${scenarioId}.evaluations[${index}]: derivation '${evaluation.ruleRef}' requires targetInstanceRef`,
          );

          return;
        }

        const target = instances.get(evaluation.targetInstanceRef);

        if (target === undefined || !issued.has(evaluation.targetInstanceRef)) {
          errors.push(
            `${scenarioId}.evaluations[${index}]: target instance '${evaluation.targetInstanceRef}' is unknown or unissued`,
          );

          return;
        }

        if (target.entityRef !== rule.target?.entityRef) {
          errors.push(
            `${scenarioId}.evaluations[${index}]: target instance Entity must be '${rule.target?.entityRef}'`,
          );
        }

        const sourceRefs = bindingReferences(evaluation).filter(
          (ref) => ref !== evaluation.targetInstanceRef,
        );
        const visible =
          visibility.get(evaluation.targetInstanceRef) ?? new Set<string>();
        const hidden = sourceRefs.filter((ref) => !visible.has(ref));

        if (hidden.length > 0) {
          errors.push(
            `${scenarioId}.evaluations[${index}]: derivation target '${evaluation.targetInstanceRef}' uses Evidence unavailable to its acting Role: ${JSON.stringify(hidden.sort())}`,
          );
        }
      } else if (evaluation.targetInstanceRef !== undefined) {
        errors.push(
          `${scenarioId}.evaluations[${index}]: only derivation evaluation may define targetInstanceRef`,
        );
      }
    });

    for (const expectation of scenario.expectations.fulfillmentStatuses) {
      const requestInstance = instances.get(expectation.requestInstanceRef);

      if (requestInstance === undefined) {
        errors.push(`${scenarioId}: unknown request instance '${expectation.requestInstanceRef}'`);
        continue;
      }

      const entity = entityOf(model, requestInstance.entityRef);

      if (entity === undefined || entitySignature(entity) !== 'evidence.fulfillment_request') {
        errors.push(
          `${scenarioId}: request instance '${expectation.requestInstanceRef}' does not instantiate a Fulfillment Request`,
        );
      }
    }
  }

  return dedupe(errors);
};

/** Id-indexed view of a suite, rebuilt per call so mutation is impossible. */
export const indexSuite = (
  suite: ValidationSuite,
): {
  instances: ReadonlyMap<string, EvidenceInstance>;
  scenarios: ReadonlyMap<string, Scenario>;
} => ({
  instances: new Map(suite.instances.map((item) => [item.id, item])),
  scenarios: new Map(suite.scenarios.map((item) => [item.id, item])),
});

/**
 * Normalized comparison value, so an expected result and an evaluated one are
 * compared the way the reports print them.
 */
export const comparableValue = (value: unknown): unknown => normalizeJsonValue(value);
