import type { DomainModelDocument, RuleAST } from '@evidence-poc/evidence-schema';

import { celValueToJson, compileCelExpression } from '../cel/celEvaluator.js';
import {
  attributesOf,
  entityOf,
  fulfillmentStatusOf,
  type RuleResultRecord,
  type RuntimeInstance,
} from './fulfillmentState.js';
import { buildActivation } from './ruleActivation.js';
import {
  jsonValuesEqual,
  normalizeJsonValue,
  validateTypedValue,
} from './typedValues.js';
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
type WorkingInstance = RuntimeInstance;

const dedupe = (messages: readonly string[]): string[] => [...new Set(messages)];

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
    if (!jsonValuesEqual(normalizeJsonValue(instance.values[attribute]), normalizeJsonValue(result))) {
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
        jsonValuesEqual(normalizeJsonValue(normalized), normalizeJsonValue(evaluation.expectedResult));

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
