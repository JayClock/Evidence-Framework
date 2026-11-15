import type { AttributeAST, ValueType } from '@evidence-poc/evidence-schema';
import { ParseError } from '@marcbachmann/cel-js';

import { resolveCelReference, walkCelAst } from './celAst.js';
import { compileCelExpression, isCelBuiltin } from './celEvaluator.js';

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
  | 'cel.syntaxError'
  | 'cel.undeclaredIdentifier'
  | 'cel.unknownAttribute';

export interface CelDiagnostic {
  code: CelDiagnosticCode;
  message: string;
  /** UTF-16 character offset in the original, untrimmed editor source. */
  offset: number;
  length: number;
}

export interface CelAnalysis {
  ok: boolean;
  diagnostics: readonly CelDiagnostic[];
  /** Free root identifiers in first-seen order, excluding built-ins. */
  identifiers: readonly string[];
  /** Modeled attribute reads, resolved through lexical macro aliases. */
  memberReads: readonly { alias: string; attribute: string }[];
}

/** Offline editor diagnostics from the same parser and AST as execution. */
export const analyzeCelExpression = ({
  expression,
  candidates,
}: {
  expression: string;
  candidates: readonly CelCandidate[];
}): CelAnalysis => {
  const failure = (diagnostic: CelDiagnostic): CelAnalysis => ({
    ok: false,
    diagnostics: [diagnostic],
    identifiers: [],
    memberReads: [],
  });
  if (expression.trim() === '') {
    return failure({
      code: 'cel.empty',
      message: '表达式为空；派生规则必须写明计算方式。',
      offset: 0,
      length: 0,
    });
  }
  let compiled;
  try {
    // Do not trim: parser ranges must match the CodeMirror document exactly.
    compiled = compileCelExpression(expression);
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    return failure({
      code: 'cel.syntaxError',
      message: error.summary,
      offset: error.range?.start ?? 0,
      length:
        error.range === undefined ? 1 : error.range.end - error.range.start,
    });
  }

  const byAlias = new Map(
    candidates.map((candidate) => [candidate.alias, candidate]),
  );
  const identifiers = new Set<string>();
  const memberReads = new Map<string, { alias: string; attribute: string }>();
  const diagnostics = new Map<string, CelDiagnostic>();
  walkCelAst(compiled.expr.ast, (node, scope) => {
    if (node.op === 'id' && !scope.has(node.args) && !isCelBuiltin(node.args)) {
      identifiers.add(node.args);
      if (!byAlias.has(node.args)) {
        diagnostics.set(`id:${node.start}`, {
          code: 'cel.undeclaredIdentifier',
          message: `'${node.args}' 未在绑定中声明；派生值只能读取已建模属性。`,
          offset: node.start,
          length: node.end - node.start,
        });
      }
    }
    const reference = resolveCelReference(node, scope);
    const member = reference?.members[0];
    if (
      reference === null ||
      member === undefined ||
      isCelBuiltin(reference.root)
    )
      return;
    const { root: alias } = reference;
    memberReads.set(`${alias}.${member.name}`, {
      alias,
      attribute: member.name,
    });
    const candidate = byAlias.get(alias);
    if (
      candidate !== undefined &&
      (candidate.ref !== undefined || candidate.attributes.length > 0) &&
      !candidate.attributes.some((attribute) => attribute.name === member.name)
    ) {
      diagnostics.set(`member:${member.offset}`, {
        code: 'cel.unknownAttribute',
        message: `'${alias}.${member.name}' 不是 ${candidate.label} 已建模的属性。`,
        offset: member.offset,
        length: member.length,
      });
    }
  });
  const orderedDiagnostics = [...diagnostics.values()].sort(
    (a, b) => a.offset - b.offset,
  );
  return {
    ok: orderedDiagnostics.length === 0,
    diagnostics: orderedDiagnostics,
    identifiers: [...identifiers],
    memberReads: [...memberReads.values()],
  };
};
