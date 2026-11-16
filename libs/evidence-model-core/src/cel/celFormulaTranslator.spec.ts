import { describe, expect, it } from 'vitest';
import {
  translateBusinessFormula,
  replaceBusinessFormulaToken,
} from './celFormulaTranslator.js';
import type { CelCandidate } from './celAnalysis.js';

const candidates: CelCandidate[] = [
  {
    alias: 'contract',
    ref: 'contract',
    label: '采购合同',
    attributes: [
      { name: 'price', label: '单价', valueType: 'decimal' },
      { name: 'qty', label: '数量', valueType: 'int' },
    ],
  },
];

describe('business formula projection', () => {
  it.each([
    'contract.price * contract.qty',
    'double(contract.qty) * contract.price',
    'string(int(2.1)) == "2"',
    'contract . price * 2',
    ' contract.price > 0 ? (contract.price + 2) : 0 ',
    '!true || -contract.price < 1.5',
    '"a * b" == "a * b"',
    '9223372036854775807',
    'null == null',
  ])('round trips exact CEL: %s', (source) => {
    const result = translateBusinessFormula(source, candidates);
    expect(result.supported).toBe(true);
    if (result.supported)
      expect(result.tokens.map((token) => token.text).join('')).toBe(source);
  });
  it('uses labels only for presentation, and validates replacements', () => {
    const source = 'contract.price * 2';
    const result = translateBusinessFormula(source, candidates);
    if (!result.supported) throw new Error('Expected supported formula');
    expect(result.tokens[0]?.label).toBe('采购合同.单价');
    expect(result.tokens.map((item) => item.label).join('')).toContain('×');
    const literal = result.tokens.at(-1)!;
    expect(replaceBusinessFormulaToken(source, literal, '3', candidates)).toBe(
      'contract.price * 3',
    );
    expect(
      replaceBusinessFormulaToken(source, literal, '(', candidates),
    ).toBeNull();
    expect(
      replaceBusinessFormulaToken('changed', literal, '3', candidates),
    ).toBeNull();
    expect(
      replaceBusinessFormulaToken(
        source,
        result.tokens[0]!,
        'contract.qty',
        candidates,
      ),
    ).toBe('contract.qty * 2');
  });
  it.each([
    '',
    'a +',
    'contract.missing',
    'other.price',
    'size([1, 2])',
    '[1].map(x, x * 2)',
    'contract["price"]',
    'contract.price // memo\n+ 2',
    'true ? 0 : size([])',
  ])('falls back without throwing: %s', (source) => {
    expect(translateBusinessFormula(source, candidates).supported).toBe(false);
  });
  it('rejects runtime scalars and collection bindings', () => {
    expect(
      translateBusinessFormula('runtime', [
        { alias: 'runtime', label: '运行时', attributes: [] },
      ]).supported,
    ).toBe(false);
    expect(
      translateBusinessFormula('contract.price', [
        { ...candidates[0]!, cardinality: 'many' },
      ]).supported,
    ).toBe(false);
  });
});
