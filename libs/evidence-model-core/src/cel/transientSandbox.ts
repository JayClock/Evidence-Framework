import type {
  DomainModelDocument,
  RuleAST,
} from '@evidence-poc/evidence-schema';
import { celValueToJson, compileCelExpression } from './celEvaluator.js';
import { CelDuration, CelTimestamp } from './celEvaluator.js';
import {
  isTimestampText,
  validateTypedValue,
} from '../validation/typedValues.js';

const typedToCel = (value: unknown, type: string): unknown => {
  if (type === 'timestamp') return CelTimestamp.parse(String(value)) ?? value;
  if (type === 'duration') return CelDuration.parse(String(value)) ?? value;
  if (['int', 'uint', 'double', 'decimal'].includes(type))
    return typeof value === 'number' ? value : Number(value);
  return value;
};

export interface ExampleRuleInputs {
  /** Alias -> concrete modeled values (or list of values for a many binding). */
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly asOf: string;
}

/**
 * Compile-time oracle, independent of Scenario files, clocks and Node I/O.
 * Missing/ambiguous binding resolution is the caller's responsibility. This
 * boundary refuses incomplete activation instead of manufacturing expectations.
 */
export function evaluateRuleOnExample(
  model: DomainModelDocument,
  rule: RuleAST,
  inputs: ExampleRuleInputs,
): unknown {
  const fail = (message: string): never => {
    throw new Error(`${rule.id}: ${message}`);
  };
  if (!isTimestampText(inputs.asOf)) fail('asOf must be an RFC 3339 timestamp');
  const activation: Record<string, unknown> = {};
  for (const alias of Object.keys(inputs.bindings)) {
    if (!(alias in rule.bindings)) fail(`unknown binding '${alias}'`);
  }
  for (const [alias, binding] of Object.entries(rule.bindings)) {
    let value = inputs.bindings[alias];
    if ('type' in binding) {
      if (
        (alias === 'now' || alias === 'asOf') &&
        binding.type === 'timestamp'
      ) {
        if (value !== undefined && value !== inputs.asOf)
          fail(`'${alias}' must use asOf`);
        value = inputs.asOf;
      }
      if (value === undefined) fail(`missing binding '${alias}'`);
      const problem = validateTypedValue(value, binding.type);
      if (problem !== null) fail(`${alias} ${problem}`);
      activation[alias] = typedToCel(structuredClone(value), binding.type);
      continue;
    }
    const entity = model.entities.find((item) => item.id === binding.ref);
    if (entity === undefined) fail(`unknown entity '${binding.ref}'`);
    const convert = (item: unknown): Record<string, unknown> => {
      if (item === null || typeof item !== 'object' || Array.isArray(item))
        fail(`'${alias}' requires entity values`);
      const result: Record<string, unknown> = {};
      for (const [name, field] of Object.entries(
        item as Record<string, unknown>,
      )) {
        const type =
          entity?.attributes?.find((attribute) => attribute.name === name)
            ?.valueType ?? 'dynamic';
        const problem = validateTypedValue(field, type);
        if (problem !== null) fail(`${alias}.${name} ${problem}`);
        result[name] = typedToCel(structuredClone(field), type);
      }
      return result;
    };
    if (binding.cardinality === 'many') {
      if (!Array.isArray(value)) fail(`'${alias}' requires a list`);
      activation[alias] = (value as unknown[]).map(convert);
    } else activation[alias] = convert(value);
  }
  try {
    const value = celValueToJson(
      compileCelExpression(rule.expression).evaluate(activation),
    );
    const problem = validateTypedValue(value, rule.resultType);
    if (problem !== null) fail(`result ${problem}`);
    // CEL must not leak undefined, non-finite values or private runtime classes.
    const json = JSON.stringify(value, (_key, item: unknown) => {
      if (
        item === undefined ||
        typeof item === 'bigint' ||
        (typeof item === 'number' && !Number.isFinite(item))
      )
        fail('result is not JSON');
      return item;
    });
    return JSON.parse(json);
  } catch (error) {
    throw new Error(
      `${rule.id}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
