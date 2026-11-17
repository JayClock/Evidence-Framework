import type { ASTNode } from '@marcbachmann/cel-js';
import { analyzeCelExpression, type CelCandidate } from './celAnalysis.js';
import { compileCelExpression } from './celEvaluator.js';

export interface BusinessFormulaToken {
  kind: 'attribute' | 'literal' | 'syntax';
  /** Exact CEL spelling; labels never become identifiers. */
  text: string;
  label: string;
  offset: number;
  length: number;
}
export type BusinessFormula =
  | { supported: true; tokens: readonly BusinessFormulaToken[] }
  | { supported: false; reason: string };

const SYMBOLS: Record<string, string> = {
  '*': '×',
  '/': '÷',
  '==': '等于',
  '!=': '不等于',
  '&&': '并且',
  '||': '或者',
  '!': '非',
  '?': '则',
  ':': '否则',
  '>': '大于',
  '<': '小于',
  '>=': '大于等于',
  '<=': '小于等于',
  double: '转为小数',
  int: '转为整数',
  string: '转为文本',
};
const BINARY = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '==',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  '&&',
  '||',
  '?:',
]);

/** A deliberately small, lossless view over the native CEL parser, not a second language. */
export const translateBusinessFormula = (
  expression: string,
  candidates: readonly CelCandidate[],
): BusinessFormula => {
  const unsupported = {
    supported: false as const,
    reason: '该规则包含复杂计算或未解析的属性，当前以 CEL 源码展示。',
  };
  if (!analyzeCelExpression({ expression, candidates }).ok) return unsupported;
  const leaves: BusinessFormulaToken[] = [];
  const visit = (node: ASTNode): boolean => {
    const text = expression.slice(node.start, node.end);
    if (node.op === '.' && node.args[0].op === 'id') {
      const candidate = candidates.find(
        (item) => item.alias === node.args[0].args,
      );
      const attribute = candidate?.attributes.find(
        (item) => item.name === node.args[1],
      );
      if (
        candidate?.ref === undefined ||
        candidate.cardinality === 'many' ||
        attribute === undefined
      )
        return false;
      leaves.push({
        kind: 'attribute',
        text,
        label: `${candidate.label}.${attribute.label}`,
        offset: node.start,
        length: node.end - node.start,
      });
      return true;
    }
    if (
      node.op === 'value' &&
      (typeof node.args === 'bigint' ||
        typeof node.args === 'number' ||
        typeof node.args === 'string' ||
        typeof node.args === 'boolean' ||
        node.args === null)
    ) {
      leaves.push({
        kind: 'literal',
        text,
        label: text,
        offset: node.start,
        length: node.end - node.start,
      });
      return true;
    }
    if (
      node.op === 'call' &&
      ['double', 'int', 'string'].includes(node.args[0]) &&
      node.args[1].length === 1
    )
      return visit(node.args[1][0]);
    if (node.op === '!_' || node.op === '-_') return visit(node.args);
    if (BINARY.has(node.op) && Array.isArray(node.args))
      return (node.args as ASTNode[]).every(visit);
    return false;
  };
  try {
    const ast = compileCelExpression(expression).expr.ast;
    if (!visit(ast)) return unsupported;
    const tokens: BusinessFormulaToken[] = [];
    let offset = 0;
    const syntax = (end: number): boolean => {
      const gap = expression.slice(offset, end);
      // Comments are source prose, not division operators or business rules.
      if (gap.includes('//') || gap.includes('/*')) return false;
      const pattern =
        /\s+|double\b|int\b|string\b|&&|\|\||==|!=|>=|<=|[()+\-*/%<>!?:]/gu;
      const matches = [...gap.matchAll(pattern)];
      if (matches.map((match) => match[0]).join('') !== gap) return false;
      for (const match of matches) {
        const text = match[0];
        tokens.push({
          kind: 'syntax',
          text,
          label: SYMBOLS[text] ?? text,
          offset: offset + match.index,
          length: text.length,
        });
      }
      offset = end;
      return true;
    };
    for (const leaf of leaves.sort((a, b) => a.offset - b.offset)) {
      if (!syntax(leaf.offset)) return unsupported;
      tokens.push(leaf);
      offset = leaf.offset + leaf.length;
    }
    if (!syntax(expression.length)) return unsupported;
    if (ast.op === '?:')
      tokens.unshift({
        kind: 'syntax',
        text: '',
        label: '如果 ',
        offset: 0,
        length: 0,
      });
    return { supported: true, tokens };
  } catch {
    return unsupported;
  }
};

/** Replace a source span, then re-parse before the session can be mutated. */
export const replaceBusinessFormulaToken = (
  expression: string,
  token: BusinessFormulaToken,
  replacement: string,
  candidates: readonly CelCandidate[],
): string | null => {
  if (
    expression.slice(token.offset, token.offset + token.length) !== token.text
  )
    return null;
  const result =
    expression.slice(0, token.offset) +
    replacement +
    expression.slice(token.offset + token.length);
  return translateBusinessFormula(result, candidates).supported ? result : null;
};
