import { EvaluationError, ParseError } from '@marcbachmann/cel-js';
import { Duration, UnsignedInt } from '@marcbachmann/cel-js/evaluator';

import {
  celValueToJson,
  compileCelExpression,
  evaluateCelExpression,
} from './celEvaluator.js';

const at = (iso: string): Date => new Date(iso);

describe('evaluateCelExpression (native CEL)', () => {
  it('reads literals and member paths with standard integer semantics', () => {
    expect(evaluateCelExpression('1 + 2 * 3', {})).toBe(7n);
    expect(evaluateCelExpression('7 / 2', {})).toBe(3n);
    expect(evaluateCelExpression('7.0 / 2.0', {})).toBe(3.5);
    expect(
      evaluateCelExpression('request.request_number', {
        request: { request_number: 'REQ-1' },
      }),
    ).toBe('REQ-1');
    expect(evaluateCelExpression('"a" + "b"', {})).toBe('ab');
    expect(evaluateCelExpression('[1, 2, 3][1]', {})).toBe(2n);
    expect(evaluateCelExpression('{"a": 1}["a"]', {})).toBe(1n);
    expect(evaluateCelExpression('null == null', {})).toBe(true);
  });

  it('evaluates comparisons, boolean operators and nested conditionals', () => {
    expect(evaluateCelExpression('1 < 2 && 2 <= 2', {})).toBe(true);
    expect(evaluateCelExpression('!false || false', {})).toBe(true);
    expect(evaluateCelExpression('1 in [1, 2]', {})).toBe(true);
    expect(evaluateCelExpression('"a" in {"a": 1}', {})).toBe(true);
    expect(evaluateCelExpression('false ? 1 : true ? 2 : 3', {})).toBe(2n);
    expect(evaluateCelExpression('-(3 - 5)', {})).toBe(2n);
  });

  it('short-circuits boolean operators and unselected branches', () => {
    expect(evaluateCelExpression('false && (1 / 0 > 0)', {})).toBe(false);
    expect(evaluateCelExpression('true || (1 / 0 > 0)', {})).toBe(true);
    expect(evaluateCelExpression('true ? 42 : 1 / 0', {})).toBe(42n);
  });

  it('adds durations to native timestamps and subtracts instants', () => {
    const deadline = evaluateCelExpression(
      'self.started_at + duration("30m")',
      {
        self: { started_at: at('2026-09-01T09:01:00Z') },
      },
    );
    expect(deadline).toBeInstanceOf(Date);
    expect(celValueToJson(deadline)).toBe('2026-09-01T09:31:00Z');
    expect(
      celValueToJson(
        evaluateCelExpression('a - b', {
          a: at('2026-09-01T09:31:00Z'),
          b: at('2026-09-01T09:01:00Z'),
        }),
      ),
    ).toBe('1800s');
    expect(
      celValueToJson(
        evaluateCelExpression('a - duration("30m")', {
          a: at('2026-09-01T09:31:00Z'),
        }),
      ),
    ).toBe('2026-09-01T09:01:00Z');
  });

  it('evaluates all standard list macros, including filtered map', () => {
    const activation = {
      request: { requested_minor_units: 1200n, request_number: 'REQ-1' },
      confirmations: [
        { paid_minor_units: 1000n, request_number: 'REQ-1' },
        { paid_minor_units: 1200n, request_number: 'REQ-1' },
      ],
    };
    expect(
      evaluateCelExpression(
        'confirmations.exists(c, c.paid_minor_units == request.requested_minor_units && c.request_number == request.request_number)',
        activation,
      ),
    ).toBe(true);
    expect(
      evaluateCelExpression(
        'confirmations.all(c, c.paid_minor_units == request.requested_minor_units)',
        activation,
      ),
    ).toBe(false);
    expect(
      evaluateCelExpression(
        'confirmations.exists_one(c, c.paid_minor_units == 1200)',
        activation,
      ),
    ).toBe(true);
    expect(
      evaluateCelExpression(
        'confirmations.map(c, c.paid_minor_units)',
        activation,
      ),
    ).toEqual([1000n, 1200n]);
    expect(
      evaluateCelExpression(
        'confirmations.map(c, c.paid_minor_units > 1000, c.paid_minor_units)',
        activation,
      ),
    ).toEqual([1200n]);
    expect(
      evaluateCelExpression(
        'confirmations.filter(c, c.paid_minor_units > 1000).size()',
        activation,
      ),
    ).toBe(1n);
    expect(evaluateCelExpression('size(confirmations)', activation)).toBe(2n);
  });

  it('nests macros and keeps shadowed variables local', () => {
    expect(
      evaluateCelExpression(
        'groups.all(g, g.values.filter(v, v > 0).exists(v, v == g.expected))',
        {
          groups: [
            { values: [1n, 2n], expected: 2n },
            { values: [3n], expected: 3n },
          ],
        },
      ),
    ).toBe(true);
    expect(
      evaluateCelExpression('[1].exists(x, [2].all(x, x == 2) && x == 1)', {}),
    ).toBe(true);
  });

  it('compares timestamps by instant and accepts top-level RFC 3339 input', () => {
    const activation = {
      a: at('2025-01-01T00:00:00Z'),
      b: '2025-01-01T08:00:00+08:00',
    };
    expect(evaluateCelExpression('a == b', activation)).toBe(true);
    expect(activation.b).toBe('2025-01-01T08:00:00+08:00');
    expect(
      evaluateCelExpression('a < b', {
        ...activation,
        b: '2025-01-02T00:00:00Z',
      }),
    ).toBe(true);
  });

  it('uses native scalar and string functions', () => {
    expect(evaluateCelExpression('"abc".contains("b")', {})).toBe(true);
    expect(evaluateCelExpression('"abc".startsWith("a")', {})).toBe(true);
    expect(evaluateCelExpression('"abc".matches("^a")', {})).toBe(true);
    expect(evaluateCelExpression('string(1)', {})).toBe('1');
    expect(evaluateCelExpression('int("7")', {})).toBe(7n);
    expect(
      evaluateCelExpression('timestamp("2025-01-01T00:00:00Z")', {}),
    ).toBeInstanceOf(Date);
    expect(evaluateCelExpression('duration("90s")', {})).toBeInstanceOf(
      Duration,
    );
    expect(
      evaluateCelExpression('has(a.b) && !has(a.c)', { a: { b: 1n } }),
    ).toBe(true);
    expect(evaluateCelExpression('type([]) == list', {})).toBe(true);
  });

  it('exposes native parse and evaluation errors with source ranges', () => {
    expect(() =>
      evaluateCelExpression('request.missing', { request: {} }),
    ).toThrow(EvaluationError);
    expect(() => compileCelExpression('1 +')).toThrow(ParseError);
    expect(() => compileCelExpression('request.')).toThrow(ParseError);
    expect(() => evaluateCelExpression('"abc', {})).toThrow(ParseError);
    expect(() => evaluateCelExpression('a && b', { a: 1n, b: true })).toThrow(
      EvaluationError,
    );
    try {
      compileCelExpression('  1 +\n )');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as ParseError).range).toEqual({ start: 7, end: 8 });
    }
  });

  it('reuses a compiled expression across activations and exposes the native AST', () => {
    const compiled = compileCelExpression('value + 1');
    expect(compiled.expr.ast.op).toBe('+');
    expect(compiled.evaluate({ value: 1n })).toBe(2n);
    expect(compiled.evaluate({ value: 10n })).toBe(11n);
  });

  it('lists free identifiers in source order, excluding functions and type constants', () => {
    expect(
      compileCelExpression(
        'confirmations.exists(c, c.a == request.b) && now',
      ).identifiers(),
    ).toEqual(['confirmations', 'request', 'now']);
    expect(
      compileCelExpression(
        'type(value) == int && size(items) > 0',
      ).identifiers(),
    ).toEqual(['value', 'items']);
    expect(
      compileCelExpression('items.exists(x, x.a) && x.a').identifiers(),
    ).toEqual(['items', 'x']);
    expect(
      compileCelExpression(
        'cel.bind(x, request, x.a == other.a)',
      ).identifiers(),
    ).toEqual(['request', 'other']);
  });
});

describe('celValueToJson', () => {
  it('normalizes native timestamps and preserves fractional duration precision', () => {
    expect(celValueToJson(at('2025-01-01T08:00:00+08:00'))).toBe(
      '2025-01-01T00:00:00Z',
    );
    expect(celValueToJson(new Duration(90n, 500_000_000))).toBe('90.5s');
    expect(
      celValueToJson(evaluateCelExpression('duration("0.000000001s")', {})),
    ).toBe('0.000000001s');
    expect(celValueToJson([at('2025-01-01T00:00:00.750Z')])).toEqual([
      '2025-01-01T00:00:00Z',
    ]);
  });

  it.each([
    [0n, 0],
    [1200n, 1200],
    [9007199254740991n, Number.MAX_SAFE_INTEGER],
    [-9007199254740991n, Number.MIN_SAFE_INTEGER],
    [9007199254740992n, '9007199254740992'],
    [-9007199254740992n, '-9007199254740992'],
    [1857392817294827136n, '1857392817294827136'],
  ])('normalizes integer %s without losing precision', (value, expected) => {
    expect(celValueToJson(value)).toBe(expected);
  });

  it('serializes native CEL bytes using the JSON base64 representation', () => {
    expect(celValueToJson(evaluateCelExpression('b"hello"', {}))).toBe(
      'aGVsbG8=',
    );
    expect(celValueToJson(new Uint8Array([0, 1, 255]))).toBe('AAH/');
  });

  it('normalizes uints and nested containers without leaking native classes or bigint', () => {
    expect(
      celValueToJson(evaluateCelExpression('18446744073709551615u', {})),
    ).toBe('18446744073709551615');
    const value = {
      nested: [
        1200n,
        new UnsignedInt(3n),
        {
          id: 1857392817294827136n,
          when: at('2025-06-01T00:00:00Z'),
        },
      ],
      map: new Map([['count', 2n]]),
    };
    expect(JSON.parse(JSON.stringify(celValueToJson(value)))).toEqual({
      nested: [
        1200,
        3,
        { id: '1857392817294827136', when: '2025-06-01T00:00:00Z' },
      ],
      map: { count: 2 },
    });
  });
});
