import { Environment, type ParseResult } from '@marcbachmann/cel-js';
import { Duration, UnsignedInt } from '@marcbachmann/cel-js/evaluator';

import { isTimestampText } from '../validation/typedValues.js';
import { walkCelAst } from './celAst.js';

const environment = new Environment({ unlistedVariablesAreDyn: true });

/** Built-in type constants and namespaces are not business bindings. */
export const isCelBuiltin = (name: string): boolean =>
  environment.hasVariable(name);

export interface CompiledCel {
  readonly source: string;
  /** The library's reusable expression and native AST, without an adapter tree. */
  readonly expr: ParseResult;
  evaluate(activation: Readonly<Record<string, unknown>>): unknown;
  identifiers(): readonly string[];
}

/** Native parser/evaluation errors retain their source ranges and causes. */
export const compileCelExpression = (source: string): CompiledCel => {
  const expr = environment.parse(source);
  return {
    source,
    expr,
    evaluate: (activation) =>
      expr(
        Object.fromEntries(
          Object.entries(activation).map(([name, value]) => [
            name,
            isTimestampText(value) ? new Date(value) : value,
          ]),
        ),
      ),
    identifiers: () => {
      const identifiers = new Set<string>();
      walkCelAst(expr.ast, (node, scope) => {
        if (
          node.op === 'id' &&
          !scope.has(node.args) &&
          !isCelBuiltin(node.args)
        ) {
          identifiers.add(node.args);
        }
      });
      return [...identifiers];
    },
  };
};

export const evaluateCelExpression = (
  source: string,
  activation: Readonly<Record<string, unknown>>,
): unknown => compileCelExpression(source).evaluate(activation);

/** JSON boundary: safe integers stay numbers; wider integers stay exact strings. */
export const celValueToJson = (value: unknown): unknown => {
  if (value instanceof Date) return `${value.toISOString().slice(0, 19)}Z`;
  if (value instanceof Duration) return value.toString();
  if (value instanceof UnsignedInt) return celValueToJson(value.value);
  if (typeof value === 'bigint') {
    return value >= BigInt(Number.MIN_SAFE_INTEGER) &&
      value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (Array.isArray(value)) return value.map(celValueToJson);
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value].map(([key, item]) => [String(key), celValueToJson(item)]),
    );
  }
  if (value instanceof Uint8Array) {
    return btoa(
      Array.from(value, (byte) => String.fromCharCode(byte)).join(''),
    );
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, celValueToJson(item)]),
    );
  }
  return value;
};
