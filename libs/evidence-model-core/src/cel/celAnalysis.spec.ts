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
    expect(analysis.diagnostics[0]).toMatchObject({ code: 'cel.syntaxError' });
  });

  it('accepts multiline nested macros and standard function calls', () => {
    const analysis = analyzeCelExpression({
      expression: `confirmations
        .filter(c, c.confirmed_at > timestamp("2025-01-01T00:00:00Z"))
        .all(c, [1, 2].exists(n, n > 0) && c.confirmed_at <= request.expired_at)
        && size(confirmations) > 0 && type(request.quantity) == int`,
      candidates,
    });
    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.identifiers).toEqual(['confirmations', 'request']);
    expect(analysis.memberReads).toEqual([
      { alias: 'confirmations', attribute: 'confirmed_at' },
      { alias: 'request', attribute: 'expired_at' },
      { alias: 'request', attribute: 'quantity' },
    ]);
  });

  it('does not let a macro local escape into a sibling expression', () => {
    const expression =
      'confirmations.exists(c, c.confirmed_at != null) && c.confirmed_at != null';
    const analysis = analyzeCelExpression({ expression, candidates });
    expect(analysis.identifiers).toEqual(['confirmations', 'c']);
    expect(analysis.diagnostics).toEqual([
      {
        code: 'cel.undeclaredIdentifier',
        message: expect.stringContaining("'c'"),
        offset: expression.lastIndexOf('c.confirmed_at'),
        length: 1,
      },
    ]);
  });

  it('handles nested shadowing and still diagnoses free reads outside the macro', () => {
    const expression = `confirmations.exists(request,
      [1].all(request, request > 0) && request.confirmed_at > 0)
      && request.quantity > missing`;
    const analysis = analyzeCelExpression({ expression, candidates });
    expect(analysis.identifiers).toEqual([
      'confirmations',
      'request',
      'missing',
    ]);
    expect(analysis.memberReads).toEqual([
      { alias: 'confirmations', attribute: 'confirmed_at' },
      { alias: 'request', attribute: 'quantity' },
    ]);
    expect(analysis.diagnostics).toEqual([
      {
        code: 'cel.undeclaredIdentifier',
        message: expect.stringContaining('missing'),
        offset: expression.indexOf('missing'),
        length: 7,
      },
    ]);
  });

  it('diagnoses unknown attributes in macro bodies at the actual member token', () => {
    const expression = '  confirmations.exists(c, c.unknown > 0)';
    const analysis = analyzeCelExpression({ expression, candidates });
    expect(analysis.diagnostics).toEqual([
      {
        code: 'cel.unknownAttribute',
        message: expect.stringContaining('confirmations.unknown'),
        offset: expression.indexOf('unknown'),
        length: 7,
      },
    ]);
  });

  it('validates static string indexes and modeled entities with no attributes', () => {
    const expression = 'request["unit_price"] > 0';
    const analysis = analyzeCelExpression({ expression, candidates });
    expect(analysis.memberReads).toEqual([
      { alias: 'request', attribute: 'unit_price' },
    ]);
    expect(analysis.diagnostics[0]).toMatchObject({
      code: 'cel.unknownAttribute',
      offset: 8,
      length: '"unit_price"'.length,
    });
    expect(
      analyzeCelExpression({
        expression: 'empty.missing',
        candidates: [
          {
            alias: 'empty',
            ref: 'evidence.empty',
            label: 'Empty',
            attributes: [],
          },
        ],
      }).diagnostics[0]?.code,
    ).toBe('cel.unknownAttribute');
  });

  it('does not invent attribute schemas for dynamic runtime maps', () => {
    expect(
      analyzeCelExpression({
        expression: 'payload.field == 1',
        candidates: [
          {
            alias: 'payload',
            label: 'Payload',
            valueType: 'map',
            attributes: [],
          },
        ],
      }).ok,
    ).toBe(true);
  });

  it('uses parser ranges for multiline syntax errors without trimming the source', () => {
    const expression = '  request.quantity +\n  )';
    const analysis = analyzeCelExpression({ expression, candidates });
    expect(analysis.diagnostics).toEqual([
      {
        code: 'cel.syntaxError',
        message: expect.any(String),
        offset: expression.indexOf(')'),
        length: 1,
      },
    ]);
    const eof = analyzeCelExpression({ expression: '  request.', candidates });
    expect(eof.diagnostics[0]).toMatchObject({
      code: 'cel.syntaxError',
      offset: '  request.'.length,
      length: 0,
    });
  });

  it.each([
    'request.quantity +',
    'request.quantity = 1',
    'confirmations.exists(1, true)',
    '"unterminated',
  ])('rejects invalid CEL using the authoritative parser: %s', (expression) => {
    const analysis = analyzeCelExpression({ expression, candidates });
    expect(analysis.ok).toBe(false);
    expect(analysis.diagnostics[0]?.code).toBe('cel.syntaxError');
  });

  it('ignores comments, escaped strings, raw strings and function names', () => {
    const analysis = analyzeCelExpression({
      expression: `// fake.alias and ] do not count\n
        request.quantity > 0 && r"fake.alias" == "fake.alias" &&
        "escaped \\"missing\\"" != "" && string(request.quantity) != ""`,
      candidates,
    });
    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.identifiers).toEqual(['request']);
  });

  it('tracks cel.bind locals and three-argument map scopes', () => {
    const analysis = analyzeCelExpression({
      expression:
        'cel.bind(r, request, confirmations.map(c, c.confirmed_at > r.expired_at, c.confirmed_at)).size() > 0',
      candidates,
    });
    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.identifiers).toEqual(['request', 'confirmations']);
  });

  it('treats an empty expression as an unresolved rule', () => {
    const analysis = analyzeCelExpression({ expression: '   ', candidates });

    expect(analysis.ok).toBe(false);
    expect(analysis.diagnostics[0]).toMatchObject({ code: 'cel.empty' });
  });
});
