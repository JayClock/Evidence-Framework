import { describe, expect, it } from 'vitest';

import { analyzeCelExpression, type CelCandidate } from './celAnalysis.js';

const candidates: readonly CelCandidate[] = [
  {
    alias: 'request',
    label: '发货请求（Shipment Request）',
    ref: 'evidence.request',
    attributes: [
      { name: 'quantity', label: '数量（Quantity）', valueType: 'int' },
      { name: 'expired_at', label: '失效时间（Expired At）' },
    ],
  },
  {
    alias: 'confirmations',
    label: '交付确认（Delivery Confirmation）',
    ref: 'evidence.confirmation',
    cardinality: 'many',
    attributes: [{ name: 'confirmed_at', label: '确认时间（Confirmed At）' }],
  },
];

describe('analyzeCelExpression', () => {
  it('accepts an expression that only reads modeled attributes', () => {
    const analysis = analyzeCelExpression({
      expression:
        'confirmations.exists(c, c.confirmed_at >= request.expired_at)',
      candidates,
    });

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.ok).toBe(true);
    // The macro local `c` is declared by the macro itself, so only the bound
    // roots are reported as reads.
    expect(analysis.identifiers).toEqual(['confirmations', 'request']);
  });

  it('reports an undeclared root identifier', () => {
    const analysis = analyzeCelExpression({
      expression: 'request.quantity * exchange_rate',
      candidates,
    });

    expect(analysis.ok).toBe(false);
    expect(analysis.diagnostics.map((item) => item.code)).toEqual([
      'cel.undeclaredIdentifier',
    ]);
    expect(analysis.diagnostics[0]?.message).toContain('exchange_rate');
  });

  it('reports an attribute the bound object does not model', () => {
    const analysis = analyzeCelExpression({
      expression: 'request.unit_price > 0',
      candidates,
    });

    expect(analysis.diagnostics).toEqual([
      {
        code: 'cel.unknownAttribute',
        message: expect.stringContaining('request.unit_price'),
        offset: expect.any(Number),
        length: 'unit_price'.length,
      },
    ]);
    expect(analysis.memberReads).toEqual([
      { alias: 'request', attribute: 'unit_price' },
    ]);
  });

  it('ignores identifiers inside string literals and keywords', () => {
    const analysis = analyzeCelExpression({
      expression:
        '\'exchange_rate\' == "exchange_rate" && request.quantity > 0 && true',
      candidates,
    });

    expect(analysis.identifiers).toEqual(['request']);
    expect(analysis.ok).toBe(true);
  });

  it('flags unbalanced brackets', () => {
    const analysis = analyzeCelExpression({
      expression: 'request.quantity > (0',
      candidates,
    });

    expect(analysis.ok).toBe(false);
    expect(analysis.diagnostics[0]).toMatchObject({ code: 'cel.unbalanced' });
  });

  it('treats an empty expression as an unresolved rule', () => {
    const analysis = analyzeCelExpression({ expression: '   ', candidates });

    expect(analysis.ok).toBe(false);
    expect(analysis.diagnostics[0]).toMatchObject({ code: 'cel.empty' });
  });
});
