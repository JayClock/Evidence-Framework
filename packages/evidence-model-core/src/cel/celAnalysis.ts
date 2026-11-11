import type { AttributeAST, ValueType } from '@evidence-poc/evidence-schema';

/** One alias the CEL expression may read, with the attributes it exposes. */
export interface CelCandidate {
  alias: string;
  label: string;
  /** Modeled object the alias binds; absent for runtime value bindings. */
  ref?: string;
  valueType?: ValueType;
  cardinality?: 'one' | 'many';
  attributes: readonly Pick<AttributeAST, 'name' | 'label' | 'valueType'>[];
}

export type CelDiagnosticCode =
  | 'cel.empty'
  | 'cel.incomplete'
  | 'cel.unbalanced'
  | 'cel.undeclaredIdentifier'
  | 'cel.unknownAttribute';

export interface CelDiagnostic {
  code: CelDiagnosticCode;
  message: string;
  /** Character offset inside the expression, for editor underlining. */
  offset: number;
  length: number;
}

export interface CelAnalysis {
  ok: boolean;
  diagnostics: readonly CelDiagnostic[];
  /** Root identifiers the expression reads, in first-seen order. */
  identifiers: readonly string[];
  /** `alias.attribute` reads, in first-seen order. */
  memberReads: readonly { alias: string; attribute: string }[];
}

/** CEL keywords and macros that are not bindings. */
const KEYWORDS = new Set([
  'true',
  'false',
  'null',
  'in',
  'as',
  'all',
  'exists',
  'exists_one',
  'map',
  'filter',
]);

const OPENERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

/**
 * CEL macros and standard library functions called through a dot.
 *
 * `confirmations.exists(...)` looks like a member read but is a call, so these
 * names are never treated as modeled attributes.
 */
const MEMBER_FUNCTIONS = new Set([
  'all',
  'exists',
  'exists_one',
  'filter',
  'map',
  'size',
  'contains',
  'startsWith',
  'endsWith',
  'matches',
  'lowerAscii',
  'upperAscii',
  'trim',
  'split',
  'join',
  'substring',
  'indexOf',
  'getDate',
  'getDayOfMonth',
  'getDayOfWeek',
  'getDayOfYear',
  'getFullYear',
  'getHours',
  'getMilliseconds',
  'getMinutes',
  'getMonth',
  'getSeconds',
  'getDuration',
  'getFullYear',
]);

const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/g;

/** Macro locals such as the `c` in `exists(c, c.confirmed_at > 0)`. */
const MACRO_LOCAL =
  /\b(?:all|exists|exists_one|filter|map)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,/g;

const macroLocals = (text: string): Set<string> => {
  const locals = new Set<string>();

  for (const match of text.matchAll(MACRO_LOCAL)) {
    if (match[1] !== undefined) {
      locals.add(match[1]);
    }
  }

  return locals;
};

/** Replaces string literals with spaces so their content is never scanned. */
const blankStrings = (expression: string): string => {
  let output = '';
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];
    const quote = char === '"' || char === "'" ? char : null;

    if (quote === null) {
      output += char;
      index += 1;
      continue;
    }

    output += ' ';
    index += 1;

    while (index < expression.length) {
      const inner = expression[index];

      output += inner === '\n' ? '\n' : ' ';
      index += 1;

      if (inner === '\\') {
        if (index < expression.length) {
          output += ' ';
          index += 1;
        }

        continue;
      }

      if (inner === quote) {
        break;
      }
    }
  }

  return output;
};

const previousMeaningful = (text: string, offset: number): string => {
  for (let index = offset - 1; index >= 0; index -= 1) {
    const char = text[index];

    if (char !== undefined && !/\s/.test(char)) {
      return char;
    }
  }

  return '';
};

const checkBalance = (text: string): CelDiagnostic[] => {
  const stack: { char: string; offset: number }[] = [];
  const diagnostics: CelDiagnostic[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === undefined) {
      continue;
    }

    if (OPENERS[char] !== undefined) {
      stack.push({ char, offset: index });
      continue;
    }

    if (char === ')' || char === ']' || char === '}') {
      const open = stack.pop();

      if (open === undefined || OPENERS[open.char] !== char) {
        diagnostics.push({
          code: 'cel.unbalanced',
          message: `括号 '${char}' 没有匹配的开括号。`,
          offset: index,
          length: 1,
        });
      }
    }
  }

  for (const open of stack) {
    diagnostics.push({
      code: 'cel.unbalanced',
      message: `开括号 '${open.char}' 没有闭合。`,
      offset: open.offset,
      length: 1,
    });
  }

  return diagnostics;
};

/**
 * Reads `alias.member` right after an identifier, skipping whitespace.
 *
 * Returning the offset of the member keeps diagnostics pointing at the token the
 * editor should underline.
 */
const readMember = (
  text: string,
  offset: number,
): { name: string; offset: number } | undefined => {
  let index = offset;

  while (index < text.length && /\s/.test(text[index] ?? '')) {
    index += 1;
  }

  if (text[index] !== '.') {
    return undefined;
  }

  index += 1;

  while (index < text.length && /\s/.test(text[index] ?? '')) {
    index += 1;
  }

  const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(index));

  return match === null ? undefined : { name: match[0], offset: index };
};

/**
 * Fast, offline CEL pre-check for the inspector.
 *
 * It is deliberately not a full CEL parser: it catches the mistakes that break
 * the saved model (unbalanced brackets, undeclared aliases, attributes the bound
 * object does not model) so the pinned Python checker stays the authority
 * instead of being replaced by a second, drifting implementation.
 */
export const analyzeCelExpression = ({
  expression,
  candidates,
}: {
  expression: string;
  candidates: readonly CelCandidate[];
}): CelAnalysis => {
  const trimmed = expression.trim();

  if (trimmed === '') {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'cel.empty',
          message: '表达式为空；派生规则必须写明计算方式。',
          offset: 0,
          length: 0,
        },
      ],
      identifiers: [],
      memberReads: [],
    };
  }

  const text = blankStrings(expression);
  const diagnostics = checkBalance(text);
  const danglingDot = /\.\s*$/.exec(text);

  if (danglingDot !== null) {
    diagnostics.push({
      code: 'cel.incomplete',
      message: '成员访问缺少属性名；例如 contract.unit_price。',
      offset: danglingDot.index,
      length: 1,
    });
  }
  const byAlias = new Map(
    candidates.map((candidate) => [candidate.alias, candidate]),
  );
  const locals = macroLocals(text);
  const identifiers: string[] = [];
  const memberReads: { alias: string; attribute: string }[] = [];

  for (const match of text.matchAll(IDENTIFIER)) {
    const identifier = match[0];
    const offset = match.index;

    if (offset === undefined) {
      continue;
    }

    if (previousMeaningful(text, offset) === '.') {
      continue;
    }

    if (KEYWORDS.has(identifier) || locals.has(identifier)) {
      continue;
    }

    if (!identifiers.includes(identifier)) {
      identifiers.push(identifier);
    }

    const candidate = byAlias.get(identifier);

    if (candidate === undefined) {
      diagnostics.push({
        code: 'cel.undeclaredIdentifier',
        message: `'${identifier}' 未在绑定中声明；派生值只能读取已建模属性。`,
        offset,
        length: identifier.length,
      });
      continue;
    }

    const member = readMember(text, offset + identifier.length);

    if (member === undefined) {
      continue;
    }

    if (!memberReads.some((read) => read.alias === identifier && read.attribute === member.name)) {
      memberReads.push({ alias: identifier, attribute: member.name });
    }

    if (
      !MEMBER_FUNCTIONS.has(member.name) &&
      candidate.attributes.length > 0 &&
      !candidate.attributes.some((attribute) => attribute.name === member.name)
    ) {
      diagnostics.push({
        code: 'cel.unknownAttribute',
        message: `'${identifier}.${member.name}' 不是 ${candidate.label} 已建模的属性。`,
        offset: member.offset,
        length: member.name.length,
      });
    }
  }

  return {
    ok: diagnostics.length === 0,
    diagnostics,
    identifiers,
    memberReads,
  };
};
