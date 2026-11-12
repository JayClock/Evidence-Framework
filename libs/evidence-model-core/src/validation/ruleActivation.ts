import {
  type AttributeAST,
  type DomainModelDocument,
  type RuleAST,
  type RuleBinding,
} from '@evidence-poc/evidence-schema';

import {
  CelDuration,
  CelTimestamp,
  CelEvaluationError,
} from '../cel/celEvaluator.js';
import { attributesOf, entityOf, type RuntimeInstance } from './fulfillmentState.js';
import type { ScenarioEvaluation } from './validationSuite.js';

/**
 * What a rule sees when it evaluates.
 *
 * The end-of-scenario simulation and the step-by-step replay build the same
 * activation from the same bindings, so a value cannot be computed one way when
 * the scenario is judged and another way when it is played back.
 */
export interface Activation {
  [variable: string]: unknown;
}

/** Converts a JSON value into the CEL value its declared type implies. */
export const typedToCel = (value: unknown, valueType: string): unknown => {
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
export const instanceToCel = (
  instance: RuntimeInstance,
  attributes: ReadonlyMap<string, AttributeAST>,
): Record<string, unknown> => {
  const converted: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(instance.values)) {
    converted[name] = typedToCel(
      value,
      attributes.get(name)?.valueType ?? 'dynamic',
    );
  }

  converted['id'] = instance.id;
  converted['entityRef'] = instance.entityRef;

  return converted;
};

/**
 * The variables a rule reads, from the scenario's bindings and its clock.
 *
 * `asOf` and `now` are never asserted by hand: the static checks compare them
 * with the scenario timestamp, so they come from `asOf` here.
 */
export const buildActivation = (
  rule: RuleAST,
  evaluation: ScenarioEvaluation,
  instances: ReadonlyMap<string, RuntimeInstance>,
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

/** The instance refs one evaluation needs before it can run at all. */
export const requiredInstanceRefs = (
  evaluation: ScenarioEvaluation,
): readonly string[] => {
  const refs = new Set<string>();

  if (evaluation.targetInstanceRef !== undefined) {
    refs.add(evaluation.targetInstanceRef);
  }

  for (const source of Object.values(evaluation.bindings)) {
    if ('instanceRef' in source) {
      refs.add(source.instanceRef);
    } else if ('instanceRefs' in source) {
      source.instanceRefs.forEach((ref) => refs.add(ref));
    }
  }

  return [...refs];
};
