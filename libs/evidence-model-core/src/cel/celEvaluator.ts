/**
 * A CEL (Common Expression Language) reader and evaluator.
 *
 * The FM checks evaluate rule expressions against Evidence Instances. This module
 * decides a scenario in-process, and it deliberately covers the subset the FM
 * language allows: no protobuf messages, no `optional`, no `dyn` conversions
 * beyond the scalar ones below.
 *
 * Values map onto JSON as follows:
 *
 * | CEL            | TypeScript                    | JSON again            |
 * | -------------- | ----------------------------- | --------------------- |
 * | int, uint      | number (integer)              | number                |
 * | double         | number                        | number                |
 * | string, bytes  | string                        | string                |
 * | bool           | boolean                       | boolean               |
 * | null           | null                          | null                  |
 * | timestamp      | {@link CelTimestamp}          | RFC 3339 `...Z`       |
 * | duration       | {@link CelDuration}           | `<seconds>s`          |
 * | list           | array                         | array                 |
 * | map            | plain object                  | plain object          |
 */

/** A CEL evaluation that cannot produce a value. */
export class CelEvaluationError extends Error {
  /** Character offset in the source, when the failure came from a node. */
  readonly offset: number | undefined;

  constructor(message: string, offset?: number) {
    super(offset === undefined ? message : `${message} (at ${offset})`);
    this.name = 'CelEvaluationError';
    this.offset = offset;
  }
}

const ISO_PATTERN =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

/** A CEL `timestamp`, stored as an instant so comparisons ignore the offset. */
export class CelTimestamp {
  readonly epochMillis: number;

  constructor(epochMillis: number) {
    if (!Number.isFinite(epochMillis)) {
      throw new CelEvaluationError(
        `timestamp is not a finite instant: ${epochMillis}`,
      );
    }
    this.epochMillis = epochMillis;
  }

  /** Parses an RFC 3339 timestamp, or returns null when it is not one. */
  static parse(text: string): CelTimestamp | null {
    if (!ISO_PATTERN.test(text)) {
      return null;
    }

    const millis = Date.parse(text);

    return Number.isNaN(millis) ? null : new CelTimestamp(millis);
  }

  /** UTC, second precision, `Z` suffix: the RFC 3339 form the reports print. */
  toIso(): string {
    const iso = new Date(this.epochMillis).toISOString();

    return `${iso.slice(0, 19)}Z`;
  }

  toString(): string {
    return this.toIso();
  }
}

const DURATION_PATTERN =
  /^([+-])?(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/;

/** A CEL `duration`, stored as milliseconds. */
export class CelDuration {
  readonly millis: number;

  constructor(millis: number) {
    this.millis = millis;
  }

  /** Parses `1h30m`, `90s`, `0.5s`; returns null when it is not a duration. */
  static parse(text: string): CelDuration | null {
    if (text === '' || !DURATION_PATTERN.test(text)) {
      return null;
    }

    const match = DURATION_PATTERN.exec(text);

    if (match === null) {
      return null;
    }

    const [, sign, hours, minutes, seconds] = match;

    if (hours === undefined && minutes === undefined && seconds === undefined) {
      return null;
    }

    const total =
      Number(hours ?? 0) * 3_600_000 +
      Number(minutes ?? 0) * 60_000 +
      Number(seconds ?? 0) * 1000;

    return new CelDuration(sign === '-' ? -total : total);
  }

  /** Whole seconds with a trailing `s`, matching `from_cel_value`. */
  toSecondsText(): string {
    return `${Math.trunc(this.millis / 1000)}s`;
  }

  toString(): string {
    return this.toSecondsText();
  }
}

type Node =
  | { kind: 'literal'; value: unknown; offset: number }
  | { kind: 'identifier'; name: string; offset: number }
  | { kind: 'member'; object: Node; name: string; offset: number }
  | { kind: 'index'; object: Node; index: Node; offset: number }
  | { kind: 'call'; callee: Node; args: readonly Node[]; offset: number }
  | { kind: 'unary'; operator: '!' | '-'; operand: Node; offset: number }
  | { kind: 'binary'; operator: string; left: Node; right: Node; offset: number }
  | {
      kind: 'conditional';
      test: Node;
      consequent: Node;
      alternate: Node;
      offset: number;
    }
  | { kind: 'list'; items: readonly Node[]; offset: number }
  | {
      kind: 'map';
      entries: readonly { key: Node; value: Node }[];
      offset: number;
    };

/** The parsed expression tree, exported so lineage analysis can walk it. */
export type CelNode = Node;

type TokenKind = 'number' | 'string' | 'identifier' | 'operator' | 'eof';

interface Token {
  kind: TokenKind;
  text: string;
  /** Literal value for numbers and strings. */
  value?: unknown;
  offset: number;
}

const IDENTIFIER_START = /[A-Za-z_]/;
const IDENTIFIER_PART = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

/** Longest operators first so `>=` never lexes as `>` then `=`. */
const OPERATORS = [
  '&&',
  '||',
  '==',
  '!=',
  '<=',
  '>=',
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '>',
  '!',
  '?',
  ':',
  '.',
  ',',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
] as const;

const KEYWORDS = new Set(['true', 'false', 'null', 'in']);

const ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\',
  "'": "'",
  '"': '"',
  '`': '`',
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
  a: '\u0007',
  '0': '\0',
};

const lex = (source: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index] as string;

    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      index += 1;
      continue;
    }

    if (char === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n') {
        index += 1;
      }
      continue;
    }

    if (IDENTIFIER_START.test(char)) {
      const start = index;
      index += 1;
      while (
        index < source.length &&
        IDENTIFIER_PART.test(source[index] as string)
      ) {
        index += 1;
      }
      tokens.push({
        kind: 'identifier',
        text: source.slice(start, index),
        offset: start,
      });
      continue;
    }

    if (DIGIT.test(char) || (char === '.' && DIGIT.test(source[index + 1] ?? ''))) {
      const start = index;
      let fractional = false;

      while (index < source.length) {
        const current = source[index] as string;
        if (DIGIT.test(current)) {
          index += 1;
          continue;
        }
        if (current === '.' && !fractional && DIGIT.test(source[index + 1] ?? '')) {
          fractional = true;
          index += 1;
          continue;
        }
        if (
          (current === 'e' || current === 'E') &&
          /[0-9+-]/.test(source[index + 1] ?? '')
        ) {
          fractional = true;
          index += 2;
          while (DIGIT.test(source[index] ?? '')) {
            index += 1;
          }
          continue;
        }
        break;
      }

      const text = source.slice(start, index);

      if (!fractional && (source[index] === 'u' || source[index] === 'U')) {
        index += 1;
        tokens.push({
          kind: 'number',
          text: `${text}u`,
          value: Number.parseInt(text, 10),
          offset: start,
        });
        continue;
      }

      tokens.push({
        kind: 'number',
        text,
        value: fractional ? Number.parseFloat(text) : Number.parseInt(text, 10),
        offset: start,
      });
      continue;
    }

    if (char === '"' || char === "'") {
      const start = index;
      const quote = char;
      index += 1;
      let text = '';
      let closed = false;

      while (index < source.length) {
        const current = source[index] as string;
        if (current === quote) {
          index += 1;
          closed = true;
          break;
        }
        if (current === '\\') {
          const escape = source[index + 1] as string | undefined;
          if (escape === undefined) {
            break;
          }
          const mapped = ESCAPES[escape];
          if (mapped !== undefined) {
            text += mapped;
            index += 2;
            continue;
          }
          if (escape === 'u' || escape === 'x') {
            const width = escape === 'u' ? 4 : 2;
            const digits = source.slice(index + 2, index + 2 + width);
            text += String.fromCodePoint(Number.parseInt(digits, 16));
            index += 2 + width;
            continue;
          }
          text += escape;
          index += 2;
          continue;
        }
        text += current;
        index += 1;
      }

      if (!closed) {
        throw new CelEvaluationError('unterminated string literal', start);
      }

      tokens.push({
        kind: 'string',
        text: source.slice(start, index),
        value: text,
        offset: start,
      });
      continue;
    }

    const operator = OPERATORS.find((candidate) =>
      source.startsWith(candidate, index),
    );

    if (operator === undefined) {
      throw new CelEvaluationError(
        `unexpected character '${char}'`,
        index,
      );
    }

    tokens.push({ kind: 'operator', text: operator, offset: index });
    index += operator.length;
  }

  tokens.push({ kind: 'eof', text: '', offset: source.length });

  return tokens;
};

/** Binding power of each binary operator; higher binds tighter. */
const BINDING_POWER: Readonly<Record<string, number>> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 3,
  '<=': 3,
  '>': 3,
  '>=': 3,
  in: 3,
  '+': 4,
  '-': 4,
  '*': 5,
  '/': 5,
  '%': 5,
};

class Parser {
  private index = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  parse(): Node {
    const node = this.parseConditional();
    this.expectEnd();

    return node;
  }

  private peek(): Token {
    return this.tokens[this.index] as Token;
  }

  private next(): Token {
    const token = this.peek();

    if (token.kind !== 'eof') {
      this.index += 1;
    }

    return token;
  }

  private matchOperator(text: string): Token | null {
    const token = this.peek();

    if (token.kind === 'operator' && token.text === text) {
      return this.next();
    }

    return null;
  }

  private expectOperator(text: string): Token {
    const token = this.matchOperator(text);

    if (token === null) {
      throw new CelEvaluationError(
        `expected '${text}' but found '${this.peek().text}'`,
        this.peek().offset,
      );
    }

    return token;
  }

  private expectEnd(): void {
    const token = this.peek();

    if (token.kind !== 'eof') {
      throw new CelEvaluationError(
        `unexpected trailing '${token.text}'`,
        token.offset,
      );
    }
  }

  private parseConditional(): Node {
    const test = this.parseBinary(0);

    if (this.matchOperator('?') === null) {
      return test;
    }

    const consequent = this.parseConditional();
    this.expectOperator(':');
    const alternate = this.parseConditional();

    return { kind: 'conditional', test, consequent, alternate, offset: test.offset };
  }

  private parseBinary(minimum: number): Node {
    let left = this.parseUnary();

    for (;;) {
      const token = this.peek();
      const operator =
        token.kind === 'operator' || (token.kind === 'identifier' && token.text === 'in')
          ? token.text
          : undefined;

      if (operator === undefined) {
        return left;
      }

      const power = BINDING_POWER[operator];

      if (power === undefined || power <= minimum) {
        return left;
      }

      this.next();
      const right = this.parseBinary(power);
      left = { kind: 'binary', operator, left, right, offset: left.offset };
    }
  }

  private parseUnary(): Node {
    const token = this.peek();

    if (token.kind === 'operator' && (token.text === '!' || token.text === '-')) {
      this.next();

      return {
        kind: 'unary',
        operator: token.text,
        operand: this.parseUnary(),
        offset: token.offset,
      };
    }

    return this.parseMember();
  }

  private parseMember(): Node {
    let node = this.parsePrimary();

    for (;;) {
      if (this.matchOperator('.') !== null) {
        const name = this.next();

        if (name.kind !== 'identifier') {
          throw new CelEvaluationError(
            'expected a member name after .',
            name.offset,
          );
        }

        if (this.matchOperator('(') !== null) {
          node = {
            kind: 'call',
            callee: { kind: 'member', object: node, name: name.text, offset: name.offset },
            args: this.parseArguments(),
            offset: name.offset,
          };
          continue;
        }

        node = { kind: 'member', object: node, name: name.text, offset: name.offset };
        continue;
      }

      if (this.matchOperator('[') !== null) {
        const index = this.parseConditional();
        this.expectOperator(']');
        node = { kind: 'index', object: node, index, offset: node.offset };
        continue;
      }

      if (node.kind !== 'call' && this.matchOperator('(') !== null) {
        node = { kind: 'call', callee: node, args: this.parseArguments(), offset: node.offset };
        continue;
      }

      return node;
    }
  }

  private parseArguments(): readonly Node[] {
    const args: Node[] = [];

    if (this.matchOperator(')') !== null) {
      return args;
    }

    for (;;) {
      args.push(this.parseConditional());

      if (this.matchOperator(',') === null) {
        this.expectOperator(')');

        return args;
      }
    }
  }

  private parsePrimary(): Node {
    const token = this.next();

    if (token.kind === 'number' || token.kind === 'string') {
      return { kind: 'literal', value: token.value, offset: token.offset };
    }

    if (token.kind === 'identifier') {
      if (token.text === 'true') {
        return { kind: 'literal', value: true, offset: token.offset };
      }
      if (token.text === 'false') {
        return { kind: 'literal', value: false, offset: token.offset };
      }
      if (token.text === 'null') {
        return { kind: 'literal', value: null, offset: token.offset };
      }
      if (KEYWORDS.has(token.text)) {
        throw new CelEvaluationError(
          `'${token.text}' is not a value`,
          token.offset,
        );
      }

      return { kind: 'identifier', name: token.text, offset: token.offset };
    }

    if (token.kind === 'operator') {
      if (token.text === '(') {
        const node = this.parseConditional();
        this.expectOperator(')');

        return node;
      }

      if (token.text === '[') {
        const items: Node[] = [];

        if (this.matchOperator(']') === null) {
          for (;;) {
            items.push(this.parseConditional());
            if (this.matchOperator(',') === null) {
              this.expectOperator(']');
              break;
            }
            if (this.matchOperator(']') !== null) {
              break;
            }
          }
        }

        return { kind: 'list', items, offset: token.offset };
      }

      if (token.text === '{') {
        const entries: { key: Node; value: Node }[] = [];

        if (this.matchOperator('}') === null) {
          for (;;) {
            const key = this.parseConditional();
            this.expectOperator(':');
            const value = this.parseConditional();
            entries.push({ key, value });
            if (this.matchOperator(',') === null) {
              this.expectOperator('}');
              break;
            }
            if (this.matchOperator('}') !== null) {
              break;
            }
          }
        }

        return { kind: 'map', entries, offset: token.offset };
      }
    }

    throw new CelEvaluationError(
      `unexpected '${token.text || '<end>'}'`,
      token.offset,
    );
  }
}

/** Variables in scope while a macro body or the outer expression runs. */
interface Scope {
  readonly values: Readonly<Record<string, unknown>>;
  readonly parent?: Scope;
}

const lookup = (scope: Scope | undefined, name: string): unknown => {
  let current = scope;

  while (current !== undefined) {
    if (name in current.values) {
      return current.values[name];
    }
    current = current.parent;
  }

  throw new CelEvaluationError(`unknown variable '${name}'`);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const typeName = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }
  if (value instanceof CelTimestamp) {
    return 'timestamp';
  }
  if (value instanceof CelDuration) {
    return 'duration';
  }
  if (Array.isArray(value)) {
    return 'list';
  }
  if (typeof value === 'object') {
    return 'map';
  }

  return typeof value;
};

const asTimestamp = (value: unknown): CelTimestamp | null => {
  if (value instanceof CelTimestamp) {
    return value;
  }
  if (typeof value === 'string') {
    return CelTimestamp.parse(value);
  }

  return null;
};

const isBool = (value: unknown): value is boolean => typeof value === 'boolean';

const truthy = (value: unknown, offset: number): boolean => {
  if (!isBool(value)) {
    throw new CelEvaluationError(
      `expected a bool but found ${typeName(value)}`,
      offset,
    );
  }

  return value;
};

/** Numbers, plus the numeric strings `int()`, `uint()` and `double()` accept. */
const numericOf = (value: unknown, offset: number): number => {
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);

    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return requireNumber(value, offset);
};

const requireNumber = (value: unknown, offset: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new CelEvaluationError(
      `expected a number but found ${typeName(value)}`,
      offset,
    );
  }

  return value;
};

/** Structural equality with timestamp and duration awareness. */
export const celEquals = (left: unknown, right: unknown): boolean => {
  if (left instanceof CelTimestamp || right instanceof CelTimestamp) {
    const leftTime = asTimestamp(left);
    const rightTime = asTimestamp(right);

    return (
      leftTime !== null &&
      rightTime !== null &&
      leftTime.epochMillis === rightTime.epochMillis
    );
  }

  if (left instanceof CelDuration || right instanceof CelDuration) {
    const leftSpan = left instanceof CelDuration ? left : null;
    const rightSpan = right instanceof CelDuration ? right : null;

    return (
      leftSpan !== null &&
      rightSpan !== null &&
      leftSpan.millis === rightSpan.millis
    );
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => celEquals(item, right[index]))
    );
  }

  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);

    return (
      leftKeys.length === Object.keys(right).length &&
      leftKeys.every(
        (key) => key in right && celEquals(left[key], right[key]),
      )
    );
  }

  return left === right;
};

const compare = (operator: string, left: unknown, right: unknown, offset: number): boolean => {
  const leftTime = asTimestamp(left);
  const rightTime = asTimestamp(right);

  if (leftTime !== null && rightTime !== null) {
    return ordered(operator, leftTime.epochMillis, rightTime.epochMillis);
  }

  if (typeof left === 'number' && typeof right === 'number') {
    return ordered(operator, left, right);
  }

  if (typeof left === 'string' && typeof right === 'string') {
    return ordered(operator, left, right);
  }

  throw new CelEvaluationError(
    `cannot compare ${typeName(left)} with ${typeName(right)} using ${operator}`,
    offset,
  );
};

const ordered = (
  operator: string,
  left: number | string,
  right: number | string,
): boolean => {
  switch (operator) {
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    default:
      throw new CelEvaluationError(`unsupported comparison '${operator}'`);
  }
};

const iterate = (value: unknown, offset: number): readonly unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  throw new CelEvaluationError(
    `expected a list but found ${typeName(value)}`,
    offset,
  );
};

const sizeOf = (value: unknown, offset: number): number => {
  if (Array.isArray(value) || typeof value === 'string') {
    return value.length;
  }
  if (isRecord(value)) {
    return Object.keys(value).length;
  }

  throw new CelEvaluationError(
    `size() does not accept ${typeName(value)}`,
    offset,
  );
};

const scalarToTimestamp = (value: unknown, offset: number): CelTimestamp => {
  const parsed = asTimestamp(value);

  if (parsed === null) {
    throw new CelEvaluationError(
      `timestamp() does not accept ${String(value)}`,
      offset,
    );
  }

  return parsed;
};

const scalarToDuration = (value: unknown, offset: number): CelDuration => {
  const parsed =
    value instanceof CelDuration
      ? value
      : typeof value === 'string'
        ? CelDuration.parse(value)
        : null;

  if (parsed === null) {
    throw new CelEvaluationError(
      `duration() does not accept ${String(value)}`,
      offset,
    );
  }

  return parsed;
};

/** Scalar conversions the FM rules may call by name. */
const CONVERSIONS: Readonly<
  Record<string, (value: unknown, offset: number) => unknown>
> = {
  string: (value) => {
    if (value instanceof CelTimestamp) {
      return value.toIso();
    }
    if (value instanceof CelDuration) {
      return value.toSecondsText();
    }

    return String(value);
  },
  int: (value, offset) => Math.trunc(numericOf(value, offset)),
  uint: (value, offset) => Math.max(0, Math.trunc(numericOf(value, offset))),
  double: (value, offset) => numericOf(value, offset),
  bool: (value, offset) => truthy(value, offset),
  timestamp: (value, offset) => scalarToTimestamp(value, offset),
  duration: (value, offset) => scalarToDuration(value, offset),
  type: (value) => typeName(value),
};

/** Methods that read one value without extra arguments. */
const STRING_METHODS: Readonly<
  Record<string, (value: string, argument: string) => boolean>
> = {
  matches: (value, pattern) => new RegExp(pattern, 'u').test(value),
  contains: (value, needle) => value.includes(needle),
  startsWith: (value, prefix) => value.startsWith(prefix),
  endsWith: (value, suffix) => value.endsWith(suffix),
};

interface EvaluationContext {
  readonly scope: Scope;
}

const evaluateNode = (node: Node, context: EvaluationContext): unknown => {
  switch (node.kind) {
    case 'literal':
      return node.value;
    case 'identifier':
      return lookup(context.scope, node.name);
    case 'list':
      return node.items.map((item) => evaluateNode(item, context));
    case 'map': {
      const result: Record<string, unknown> = {};

      for (const entry of node.entries) {
        result[String(evaluateNode(entry.key, context))] = evaluateNode(
          entry.value,
          context,
        );
      }

      return result;
    }
    case 'unary': {
      const value = evaluateNode(node.operand, context);

      return node.operator === '!'
        ? !truthy(value, node.offset)
        : -requireNumber(value, node.offset);
    }
    case 'conditional':
      return truthy(evaluateNode(node.test, context), node.offset)
        ? evaluateNode(node.consequent, context)
        : evaluateNode(node.alternate, context);
    case 'binary':
      return evaluateBinary(node, context);
    case 'member':
      return readMember(node, context);
    case 'index': {
      const object = evaluateNode(node.object, context);
      const key = evaluateNode(node.index, context);

      if (Array.isArray(object)) {
        return object[requireNumber(key, node.offset)];
      }
      if (isRecord(object)) {
        const text = String(key);

        if (!(text in object)) {
          throw new CelEvaluationError(`no such key '${text}'`, node.offset);
        }

        return object[text];
      }

      throw new CelEvaluationError(
        `cannot index ${typeName(object)}`,
        node.offset,
      );
    }
    case 'call':
      return evaluateCall(node, context);
  }
};

const readMember = (
  node: Extract<Node, { kind: 'member' }>,
  context: EvaluationContext,
): unknown => {
  const object = evaluateNode(node.object, context);

  if (isRecord(object)) {
    if (!(node.name in object)) {
      throw new CelEvaluationError(
        `no such field '${node.name}' on ${typeName(object)}`,
        node.offset,
      );
    }

    return object[node.name];
  }

  throw new CelEvaluationError(
    `cannot read '${node.name}' from ${typeName(object)}`,
    node.offset,
  );
};

const evaluateBinary = (
  node: Extract<Node, { kind: 'binary' }>,
  context: EvaluationContext,
): unknown => {
  if (node.operator === '&&') {
    return (
      truthy(evaluateNode(node.left, context), node.offset) &&
      truthy(evaluateNode(node.right, context), node.offset)
    );
  }

  if (node.operator === '||') {
    return (
      truthy(evaluateNode(node.left, context), node.offset) ||
      truthy(evaluateNode(node.right, context), node.offset)
    );
  }

  const left = evaluateNode(node.left, context);
  const right = evaluateNode(node.right, context);

  switch (node.operator) {
    case '==':
      return celEquals(left, right);
    case '!=':
      return !celEquals(left, right);
    case '<':
    case '<=':
    case '>':
    case '>=':
      return compare(node.operator, left, right, node.offset);
    case '+':
      if (typeof left === 'string' && typeof right === 'string') {
        return left + right;
      }
      if (Array.isArray(left) && Array.isArray(right)) {
        return [...left, ...right];
      }
      if (left instanceof CelTimestamp && right instanceof CelDuration) {
        return new CelTimestamp(left.epochMillis + right.millis);
      }
      if (left instanceof CelDuration && right instanceof CelTimestamp) {
        return new CelTimestamp(right.epochMillis + left.millis);
      }
      if (left instanceof CelDuration && right instanceof CelDuration) {
        return new CelDuration(left.millis + right.millis);
      }

      return requireNumber(left, node.offset) + requireNumber(right, node.offset);
    case '-':
      if (left instanceof CelTimestamp && right instanceof CelTimestamp) {
        return new CelDuration(left.epochMillis - right.epochMillis);
      }
      if (left instanceof CelTimestamp && right instanceof CelDuration) {
        return new CelTimestamp(left.epochMillis - right.millis);
      }
      if (left instanceof CelDuration && right instanceof CelDuration) {
        return new CelDuration(left.millis - right.millis);
      }

      return requireNumber(left, node.offset) - requireNumber(right, node.offset);
    case '*':
      return requireNumber(left, node.offset) * requireNumber(right, node.offset);
    case '/':
      return requireNumber(left, node.offset) / requireNumber(right, node.offset);
    case '%':
      return requireNumber(left, node.offset) % requireNumber(right, node.offset);
    case 'in':
      if (Array.isArray(right)) {
        return right.some((item) => celEquals(item, left));
      }
      if (isRecord(right)) {
        return String(left) in right;
      }

      throw new CelEvaluationError(
        `'in' does not accept ${typeName(right)}`,
        node.offset,
      );
    default:
      throw new CelEvaluationError(
        `unsupported operator '${node.operator}'`,
        node.offset,
      );
  }
};

const MACROS = new Set(['exists', 'all', 'exists_one', 'map', 'filter']);

const evaluateMacro = (
  name: string,
  receiver: unknown,
  args: readonly Node[],
  context: EvaluationContext,
  offset: number,
): unknown => {
  if (args.length !== 2) {
    throw new CelEvaluationError(
      `${name}() takes an iteration variable and a predicate`,
      offset,
    );
  }

  const variable = args[0] as Node;
  const body = args[1] as Node;

  if (variable.kind !== 'identifier') {
    throw new CelEvaluationError(
      `${name}() expects an iteration variable`,
      offset,
    );
  }

  const items = iterate(receiver, offset);
  const run = (item: unknown): unknown =>
    evaluateNode(body, {
      scope: { values: { [variable.name]: item }, parent: context.scope },
    });

  switch (name) {
    case 'exists':
      return items.some((item) => truthy(run(item), offset));
    case 'all':
      return items.every((item) => truthy(run(item), offset));
    case 'exists_one':
      return items.filter((item) => truthy(run(item), offset)).length === 1;
    case 'map':
      return items.map((item) => run(item));
    default:
      return items.filter((item) => truthy(run(item), offset));
  }
};

const isPresent = (node: Node, context: EvaluationContext): boolean => {
  if (node.kind === 'member') {
    const object = evaluateNode(node.object, context);

    return isRecord(object) && node.name in object && object[node.name] !== null;
  }

  if (node.kind === 'index') {
    const object = evaluateNode(node.object, context);

    if (!isRecord(object)) {
      return false;
    }

    const key = evaluateNode(node.index, context);

    return String(key) in object && object[String(key)] !== null;
  }

  return true;
};

const evaluateCall = (
  node: Extract<Node, { kind: 'call' }>,
  context: EvaluationContext,
): unknown => {
  const callee = node.callee;

  if (callee.kind === 'member' && MACROS.has(callee.name)) {
    return evaluateMacro(
      callee.name,
      evaluateNode(callee.object, context),
      node.args,
      context,
      node.offset,
    );
  }

  if (callee.kind === 'identifier' && callee.name === 'has') {
    const [argument] = node.args;

    if (node.args.length !== 1 || argument === undefined) {
      throw new CelEvaluationError('has() takes exactly one argument', node.offset);
    }

    return isPresent(argument, context);
  }

  if (callee.kind === 'member' && callee.name === 'size') {
    return sizeOf(evaluateNode(callee.object, context), node.offset);
  }

  if (callee.kind === 'member') {
    const method = STRING_METHODS[callee.name];

    if (method !== undefined) {
      const receiver = evaluateNode(callee.object, context);
      const [argument] = node.args;

      if (typeof receiver !== 'string' || node.args.length !== 1 || argument === undefined) {
        throw new CelEvaluationError(
          `${callee.name}() expects a string receiver and one string argument`,
          node.offset,
        );
      }

      return method(receiver, String(evaluateNode(argument, context)));
    }
  }

  if (callee.kind === 'identifier') {
    if (callee.name === 'size') {
      const [argument] = node.args;

      if (node.args.length !== 1 || argument === undefined) {
        throw new CelEvaluationError('size() takes exactly one argument', node.offset);
      }

      return sizeOf(evaluateNode(argument, context), node.offset);
    }

    const conversion = CONVERSIONS[callee.name];

    if (conversion !== undefined) {
      const [argument] = node.args;

      if (node.args.length !== 1 || argument === undefined) {
        throw new CelEvaluationError(
          `${callee.name}() takes exactly one argument`,
          node.offset,
        );
      }

      return conversion(evaluateNode(argument, context), node.offset);
    }

    throw new CelEvaluationError(
      `unknown function '${callee.name}'`,
      node.offset,
    );
  }

  throw new CelEvaluationError('cannot call this expression', node.offset);
};

/**
 * Collects the variables an expression reads, skipping macro iteration
 * variables and function names.
 */
const collectIdentifiers = (
  node: Node,
  into: Set<string>,
  bound: ReadonlySet<string> = new Set<string>(),
): void => {
  switch (node.kind) {
    case 'identifier':
      if (!bound.has(node.name)) {
        into.add(node.name);
      }

      return;
    case 'member':
      collectIdentifiers(node.object, into, bound);

      return;
    case 'index':
      collectIdentifiers(node.object, into, bound);
      collectIdentifiers(node.index, into, bound);

      return;
    case 'unary':
      collectIdentifiers(node.operand, into, bound);

      return;
    case 'binary':
      collectIdentifiers(node.left, into, bound);
      collectIdentifiers(node.right, into, bound);

      return;
    case 'conditional':
      collectIdentifiers(node.test, into, bound);
      collectIdentifiers(node.consequent, into, bound);
      collectIdentifiers(node.alternate, into, bound);

      return;
    case 'list':
      node.items.forEach((item) => collectIdentifiers(item, into, bound));

      return;
    case 'map':
      node.entries.forEach((entry) => {
        collectIdentifiers(entry.key, into, bound);
        collectIdentifiers(entry.value, into, bound);
      });

      return;
    case 'call': {
      if (node.callee.kind === 'member') {
        if (MACROS.has(node.callee.name)) {
          const [variable, ...rest] = node.args;
          const shadowed = new Set(bound);

          if (variable?.kind === 'identifier') {
            shadowed.add(variable.name);
          }
          rest.forEach((argument) =>
            collectIdentifiers(argument, into, shadowed),
          );
          collectIdentifiers(node.callee.object, into, bound);

          return;
        }

        collectIdentifiers(node.callee.object, into, bound);
      }

      node.args.forEach((argument) =>
        collectIdentifiers(argument, into, bound),
      );

      return;
    }
    case 'literal':
      return;
  }
};

/** One parsed expression, ready to be evaluated repeatedly. */
export interface CompiledCel {
  readonly source: string;
  /** Evaluates against a variable set, throwing {@link CelEvaluationError}. */
  evaluate(activation: Readonly<Record<string, unknown>>): unknown;
  /** Root identifiers the expression reads, sorted for stable diagnostics. */
  identifiers(): readonly string[];
}

/** Parses a CEL expression into the tree the evaluator and lineage walk read. */
export const parseCelExpression = (source: string): CelNode =>
  new Parser(lex(source)).parse();

/** Parses a CEL expression; the result can be evaluated many times. */
export const compileCelExpression = (source: string): CompiledCel => {
  const ast = new Parser(lex(source)).parse();

  return {
    source,
    evaluate: (activation) =>
      evaluateNode(ast, { scope: { values: activation } }),
    identifiers: () => {
      const names = new Set<string>();
      collectIdentifiers(ast, names);

      return [...names].sort();
    },
  };
};

/** Compiles and evaluates in one step. */
export const evaluateCelExpression = (
  source: string,
  activation: Readonly<Record<string, unknown>>,
): unknown => compileCelExpression(source).evaluate(activation);

/**
 * Converts a CEL result back into the JSON shape the reports print.
 *
 * Timestamps become `...Z`, durations `<seconds>s`, and lists, maps and scalars
 * pass through unchanged.
 */
export const celValueToJson = (value: unknown): unknown => {
  if (value instanceof CelTimestamp) {
    return value.toIso();
  }
  if (value instanceof CelDuration) {
    return value.toSecondsText();
  }
  if (Array.isArray(value)) {
    return value.map((item) => celValueToJson(item));
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      result[key] = celValueToJson(item);
    }

    return result;
  }

  return value;
};
