import {
  isFulfillmentRequest,
  type AttributeAST,
  type DomainModelDocument,
  type EntityAST,
  type RuleAST,
  type RuleBinding,
} from '@evidence-poc/evidence-schema';

import {
  CelDuration,
  CelTimestamp,
  CelEvaluationError,
  celValueToJson,
  compileCelExpression,
} from '../cel/celEvaluator.js';
import { fulfillmentResults } from './scope.js';
import { normalizeJsonValue, validateTypedValue } from './typedValues.js';
import {
  indexSuite,
  validateValidationSuite,
  type FulfillmentStatus,
  type Scenario,
  type ScenarioEvaluation,
  type ValidationSuite,
} from './validationSuite.js';

/**
 * Deterministic Evidence-instance simulation.
 *
 * A scenario issues instances in order and asks what the rules say about them.
 * Nothing here reads a clock: `asOf` and `now` are scenario inputs, so a report
 * can be replayed byte for byte.
 */

export interface SimulationEvaluationResult {
  ruleRef: string;
  result: unknown;
  passed: boolean;
}

export interface SimulationStatusResult {
  requestInstanceRef: string;
  requestEntityRef?: string;
  status: FulfillmentStatus;
  expectedStatus: FulfillmentStatus;
  passed: boolean;
}

export interface SimulationInstanceValues {
  instanceRef: string;
  entityRef: unknown;
  values: unknown;
}

export interface ScenarioResult {
  scenarioId: string;
  asOf: unknown;
  machineValidated: true;
  simulationPassed: boolean;
  issuedInstanceRefs: readonly string[];
  instanceValues: readonly SimulationInstanceValues[];
  evaluations: readonly SimulationEvaluationResult[];
  fulfillmentStatuses: readonly SimulationStatusResult[];
  errors: readonly string[];
}

export interface SimulationReport {
  schemaVersion: '5.0';
  modelId: unknown;
  machineValidated: boolean;
  simulationPassed: boolean;
  scenarioResults: readonly ScenarioResult[];
  errors: readonly string[];
}

/** One scenario instance while the simulation mutates it with derivations. */
interface WorkingInstance {
  id: string;
  entityRef: string;
  values: Record<string, unknown>;
  basedOn: readonly string[];
}

const attributesOf = (entity: EntityAST | undefined): Map<string, AttributeAST> =>
  new Map(
    (entity?.attributes ?? []).map((attribute) => [attribute.name, attribute] as const),
  );

const entityOf = (
  model: DomainModelDocument,
  entityId: string | undefined,
): EntityAST | undefined =>
  entityId === undefined
    ? undefined
    : model.entities.find((entity) => entity.id === entityId);

const dedupe = (messages: readonly string[]): string[] => [...new Set(messages)];

/** Converts a JSON value into the CEL value its declared type implies. */
const typedToCel = (value: unknown, valueType: string): unknown => {
  switch (valueType) {
    case 'timestamp': {
      const parsed = CelTimestamp.parse(String(value));

      return parsed ?? value;
    }
    case 'duration': {
      const parsed = CelDuration.parse(String(value));

      return parsed ?? value;
    }
    case 'int':
    case 'uint':
    case 'double':
    case 'decimal':
      return typeof value === 'number' ? value : Number(value);
    case 'bool':
      return value;
    default:
      return value;
  }
};

/** One instance as the rule sees it: typed values plus its own identity. */
const instanceToCel = (
  instance: WorkingInstance,
  attributes: ReadonlyMap<string, AttributeAST>,
): Record<string, unknown> => {
  const converted: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(instance.values)) {
    converted[name] = typedToCel(value, attributes.get(name)?.valueType ?? 'dynamic');
  }

  converted['id'] = instance.id;
  converted['entityRef'] = instance.entityRef;

  return converted;
};

interface Activation {
  [variable: string]: unknown;
}

/**
 * The variables a rule reads, from the scenario's bindings and its clock.
 *
 * `asOf` and `now` are never asserted by hand: the static checks compare them
 * with the scenario timestamp, so they come from `asOf` here.
 */
const buildActivation = (
  rule: RuleAST,
  evaluation: ScenarioEvaluation,
  instances: ReadonlyMap<string, WorkingInstance>,
  model: DomainModelDocument,
  asOf: string,
): Activation => {
  const activation: Activation = {};

  const instanceAsCel = (ref: string): unknown => {
    const instance = instances.get(ref);

    if (instance === undefined) {
      throw new CelEvaluationError(
        `cannot evaluate Rule '${rule.id}': unknown instance '${ref}'`,
      );
    }

    return instanceToCel(
      instance,
      attributesOf(entityOf(model, instance.entityRef)),
    );
  };

  for (const [variable, source] of Object.entries(evaluation.bindings)) {
    const binding: RuleBinding | undefined = rule.bindings[variable];

    if ('instanceRef' in source) {
      activation[variable] = instanceAsCel(source.instanceRef);
    } else if ('instanceRefs' in source) {
      activation[variable] = source.instanceRefs.map(instanceAsCel);
    } else {
      activation[variable] = typedToCel(
        source.value,
        binding !== undefined && 'type' in binding ? binding.type : 'dynamic',
      );
    }
  }

  for (const [variable, binding] of Object.entries(rule.bindings)) {
    if (
      variable in activation ||
      !('type' in binding) ||
      binding.type !== 'timestamp' ||
      (variable !== 'asOf' && variable !== 'now')
    ) {
      continue;
    }

    const parsed = CelTimestamp.parse(asOf);

    if (parsed !== null) {
      activation[variable] = parsed;
    }
  }

  return activation;
};

const instanceReferences = (evaluation: ScenarioEvaluation): readonly string[] => {
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

const descendsFrom = (
  instanceRef: string,
  ancestorRef: string,
  instances: ReadonlyMap<string, WorkingInstance>,
  seen: ReadonlySet<string> = new Set<string>(),
): boolean => {
  if (instanceRef === ancestorRef) {
    return true;
  }

  const visited = new Set(seen);

  if (visited.has(instanceRef)) {
    return false;
  }

  visited.add(instanceRef);

  return (instances.get(instanceRef)?.basedOn ?? []).some((parent) =>
    descendsFrom(parent, ancestorRef, instances, visited),
  );
};

interface RuleResultRecord {
  result: unknown;
  instanceRefs: readonly string[];
}

const scopedResults = (
  records: readonly RuleResultRecord[],
  requestInstanceRef: string,
  instances: ReadonlyMap<string, WorkingInstance>,
): readonly unknown[] =>
  records
    .filter(
      (record) =>
        record.instanceRefs.length === 0 ||
        record.instanceRefs.some((ref) =>
          descendsFrom(ref, requestInstanceRef, instances),
        ),
    )
    .map((record) => record.result);

/**
 * What one request's Fulfillment status is, using only the issued graph.
 *
 * A breach wins over a completion, and a completion only counts when a related
 * confirmation was actually issued: a rule that evaluates true on a graph with
 * no result cannot complete anything.
 */
const fulfillmentStatusOf = (
  model: DomainModelDocument,
  instances: ReadonlyMap<string, WorkingInstance>,
  issued: ReadonlySet<string>,
  requestInstanceRef: string,
  ruleResults: ReadonlyMap<string, readonly RuleResultRecord[]>,
  manualCompletions: ReadonlySet<string>,
): FulfillmentStatus => {
  const requestInstance = instances.get(requestInstanceRef);

  if (requestInstance === undefined || !issued.has(requestInstanceRef)) {
    return 'not_requested';
  }

  const requestEntity = entityOf(model, requestInstance.entityRef);

  if (requestEntity === undefined || !isFulfillmentRequest(requestEntity)) {
    return 'not_requested';
  }

  const results = fulfillmentResults(model, requestEntity.id);
  const confirmationTypes = new Set(results.confirmations.map((item) => item.id));

  for (const role of results.roles) {
    for (const relationship of model.relationships) {
      if (
        relationship.kind === 'plays_role' &&
        relationship.targetRef === role.id
      ) {
        confirmationTypes.add(relationship.sourceRef);
      }
    }
  }

  const relatedConfirmations = [...issued].filter((instanceRef) => {
    const instance = instances.get(instanceRef);

    return (
      instance !== undefined &&
      confirmationTypes.has(instance.entityRef) &&
      descendsFrom(instanceRef, requestInstanceRef, instances)
    );
  });

  if (manualCompletions.has(requestInstanceRef)) {
    return 'completed';
  }

  const contextRef = 'contextRef' in requestEntity ? requestEntity.contextRef : undefined;
  const rules = model.rules.filter(
    (rule) =>
      rule.contextRef === contextRef &&
      (rule.kind === 'completion' || rule.kind === 'breach') &&
      Object.values(rule.bindings).some(
        (binding) =>
          'ref' in binding &&
          binding.ref === requestEntity.id,
      ),
  );

  for (const rule of rules) {
    if (rule.kind !== 'breach') {
      continue;
    }

    const scoped = scopedResults(
      ruleResults.get(rule.id) ?? [],
      requestInstanceRef,
      instances,
    );

    if (scoped.some((result) => Boolean(result))) {
      return 'breached';
    }
  }

  const completionRules = rules.filter((rule) => rule.kind === 'completion');

  if (completionRules.length > 0) {
    if (relatedConfirmations.length === 0) {
      return 'pending';
    }

    for (const rule of completionRules) {
      const scoped = scopedResults(
        ruleResults.get(rule.id) ?? [],
        requestInstanceRef,
        instances,
      );

      if (scoped.some((result) => Boolean(result))) {
        return 'completed';
      }
    }

    return 'pending';
  }

  return relatedConfirmations.length > 0 ? 'completed' : 'pending';
};

/** Structural equality over normalized JSON, independent of key order. */
const jsonEqual = (left: unknown, right: unknown): boolean => {
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => jsonEqual(item, right[index]))
    );
  }

  if (
    typeof left === 'object' &&
    left !== null &&
    typeof right === 'object' &&
    right !== null
  ) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();

    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] &&
          jsonEqual(
            (left as Record<string, unknown>)[key],
            (right as Record<string, unknown>)[key],
          ),
      )
    );
  }

  return left === right;
};

const print = (value: unknown): string => JSON.stringify(value) ?? 'null';

/** Writes a derived value back, refusing to overwrite a contradicting assertion. */
const applyDerivation = (
  instance: WorkingInstance | undefined,
  rule: RuleAST,
  result: unknown,
  errors: string[],
  scenarioId: string,
  evaluationIndex: number,
): void => {
  if (instance === undefined || rule.target === undefined) {
    return;
  }

  const attribute = rule.target.attribute;

  if (attribute === undefined) {
    return;
  }

  if (attribute in instance.values) {
    if (!jsonEqual(normalizeJsonValue(instance.values[attribute]), normalizeJsonValue(result))) {
      errors.push(
        `${scenarioId}.evaluations[${evaluationIndex}]: derived value for '${instance.id}#${attribute}' conflicts with asserted value`,
      );
    }

    return;
  }

  instance.values[attribute] = result;
};

/**
 * Runs one scenario and reports what each rule and request decided.
 *
 * The suite is read through the scenario, so every instance the model asserts
 * is available even when the scenario never issues it: an evaluation may bind an
 * instance another scenario introduced, and the static checks already proved it
 * issues it here.
 */
export const simulateScenario = (
  model: DomainModelDocument,
  suite: ValidationSuite,
  scenario: Scenario,
): ScenarioResult => {
  const scenarioId = scenario.id;
  const instances = new Map<string, WorkingInstance>();

  for (const [id, instance] of indexSuite(suite).instances) {
    instances.set(id, {
      id,
      entityRef: instance.entityRef,
      values: { ...instance.values },
      basedOn: instance.basedOn ?? [],
    });
  }

  const issuedOrder = [
    ...(scenario.givenInstanceRefs ?? []),
    ...scenario.steps.map((step) => step.issueInstanceRef),
  ];
  const issued = new Set(issuedOrder);
  const errors: string[] = [];
  const evaluationResults: SimulationEvaluationResult[] = [];
  const ruleResults = new Map<string, RuleResultRecord[]>();

  (scenario.evaluations ?? []).forEach((evaluation, index) => {
    const rule = model.rules.find((item) => item.id === evaluation.ruleRef);

    if (rule === undefined) {
      return;
    }

    try {
      const activation = buildActivation(
        rule,
        evaluation,
        instances,
        model,
        scenario.asOf,
      );
      const result = compileCelExpression(rule.expression).evaluate(activation);
      const normalized = celValueToJson(result);
      const resultError = validateTypedValue(normalized, rule.resultType);

      if (resultError !== null) {
        errors.push(
          `${scenarioId}.evaluations[${index}]: Rule '${rule.id}' result ${resultError}`,
        );
      }

      const passed =
        resultError === null &&
        jsonEqual(normalizeJsonValue(normalized), normalizeJsonValue(evaluation.expectedResult));

      if (!passed) {
        errors.push(
          `${scenarioId}.evaluations[${index}]: Rule '${rule.id}' returned ${print(normalizeJsonValue(normalized))}, expected ${print(evaluation.expectedResult)}`,
        );
      }

      if (rule.kind === 'derivation' && resultError === null) {
        applyDerivation(
          evaluation.targetInstanceRef === undefined
            ? undefined
            : instances.get(evaluation.targetInstanceRef),
          rule,
          normalized,
          errors,
          scenarioId,
          index,
        );
      }

      if (resultError === null) {
        const records = ruleResults.get(rule.id) ?? [];
        records.push({
          result: normalized,
          instanceRefs: instanceReferences(evaluation),
        });
        ruleResults.set(rule.id, records);
      }

      evaluationResults.push({
        ruleRef: rule.id,
        result: normalizeJsonValue(normalized),
        passed,
      });
    } catch (error) {
      errors.push(
        `${scenarioId}.evaluations[${index}]: cannot evaluate Rule '${rule.id}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  for (const instanceRef of issuedOrder) {
    const instance = instances.get(instanceRef);

    if (instance === undefined) {
      continue;
    }

    for (const [name, attribute] of attributesOf(entityOf(model, instance.entityRef))) {
      if (attribute.required === true && !(name in instance.values)) {
        errors.push(
          `${scenarioId}: issued instance '${instanceRef}' lacks required value '${instance.entityRef}#${name}' after derivations`,
        );
      }
    }
  }

  const manualCompletions = new Set(scenario.manualCompletionRequestRefs ?? []);
  const statusResults: SimulationStatusResult[] = [];

  for (const expectation of scenario.expectations.fulfillmentStatuses) {
    const actual = fulfillmentStatusOf(
      model,
      instances,
      issued,
      expectation.requestInstanceRef,
      ruleResults,
      manualCompletions,
    );
    const passed = actual === expectation.status;

    if (!passed) {
      errors.push(
        `${scenarioId}: Fulfillment for '${expectation.requestInstanceRef}' is '${actual}', expected '${expectation.status}'`,
      );
    }

    const requestEntityRef =
      expectation.requestEntityRef ??
      instances.get(expectation.requestInstanceRef)?.entityRef;

    statusResults.push({
      requestInstanceRef: expectation.requestInstanceRef,
      ...(requestEntityRef === undefined ? {} : { requestEntityRef }),
      status: actual,
      expectedStatus: expectation.status,
      passed,
    });
  }

  return {
    scenarioId,
    asOf: normalizeJsonValue(scenario.asOf),
    machineValidated: true,
    simulationPassed: errors.length === 0,
    issuedInstanceRefs: issuedOrder,
    instanceValues: issuedOrder
      .filter((instanceRef) => instances.has(instanceRef))
      .map((instanceRef) => {
        const instance = instances.get(instanceRef) as WorkingInstance;

        return {
          instanceRef,
          entityRef: instance.entityRef,
          values: normalizeJsonValue(instance.values),
        };
      }),
    evaluations: evaluationResults,
    fulfillmentStatuses: statusResults,
    errors: dedupe(errors),
  };
};

/**
 * Simulates every requested scenario, or none when the suite does not validate.
 *
 * A broken suite reports its static errors and executes nothing: a scenario run
 * on an inconsistent suite proves nothing.
 */
export const simulateValidationSuite = (
  model: DomainModelDocument,
  suite: ValidationSuite,
  scenarioIds?: readonly string[],
): { report: SimulationReport; errors: readonly string[] } => {
  const staticErrors = [...validateValidationSuite(model, suite)];
  const requested = new Set(scenarioIds ?? []);
  const { scenarios } = indexSuite(suite);

  for (const scenarioId of requested) {
    if (!scenarios.has(scenarioId)) {
      staticErrors.push(`unknown scenario id '${scenarioId}'`);
    }
  }

  const selected = suite.scenarios.filter(
    (scenario) => requested.size === 0 || requested.has(scenario.id),
  );
  const results =
    staticErrors.length === 0
      ? selected.map((scenario) => simulateScenario(model, suite, scenario))
      : [];
  const errors = dedupe([
    ...staticErrors,
    ...results.flatMap((result) => result.errors),
  ]);

  return {
    report: {
      schemaVersion: '5.0',
      modelId: model.manifest.id,
      machineValidated: staticErrors.length === 0,
      simulationPassed: errors.length === 0,
      scenarioResults: [...results].sort((left, right) =>
        left.scenarioId < right.scenarioId
          ? -1
          : left.scenarioId > right.scenarioId
            ? 1
            : 0,
      ),
      errors,
    },
    errors,
  };
};
