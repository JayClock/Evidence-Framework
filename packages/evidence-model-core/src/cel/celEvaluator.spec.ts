import {
  CelDuration,
  CelEvaluationError,
  CelTimestamp,
  celEquals,
  celValueToJson,
  compileCelExpression,
  evaluateCelExpression,
} from './celEvaluator.js';

const at = (iso: string): CelTimestamp => {
  const parsed = CelTimestamp.parse(iso);

  if (parsed === null) {
    throw new Error(`not a timestamp: ${iso}`);
  }

  return parsed;
};

describe('evaluateCelExpression', () => {
  it('reads literals and member paths', () => {
    expect(evaluateCelExpression('1 + 2 * 3', {})).toBe(7);
    expect(
      evaluateCelExpression('request.request_number', {
        request: { request_number: 'REQ-1' },
      }),
    ).toBe('REQ-1');
    expect(evaluateCelExpression('"a" + "b"', {})).toBe('ab');
    expect(evaluateCelExpression('[1, 2, 3][1]', {})).toBe(2);
    expect(evaluateCelExpression('{"a": 1}["a"]', {})).toBe(1);
    expect(evaluateCelExpression('null == null', {})).toBe(true);
  });

  it('evaluates the comparison and boolean operators', () => {
    expect(evaluateCelExpression('1 < 2 && 2 <= 2', {})).toBe(true);
    expect(evaluateCelExpression('!false || false', {})).toBe(true);
    expect(evaluateCelExpression('1 in [1, 2]', {})).toBe(true);
    expect(evaluateCelExpression('"a" in {"a": 1}', {})).toBe(true);
    expect(evaluateCelExpression('1 == 1 ? "yes" : "no"', {})).toBe('yes');
    expect(evaluateCelExpression('-(3 - 5)', {})).toBe(2);
  });

  it('adds durations to timestamps the way a deadline rule does', () => {
    const deadline = evaluateCelExpression('self.started_at + duration("30m")', {
      self: { started_at: at('2026-09-01T09:01:00Z') },
    });

    expect(deadline).toBeInstanceOf(CelTimestamp);
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

  it('evaluates the list macros over Evidence instances', () => {
    const activation = {
      request: { requested_minor_units: 1200, request_number: 'REQ-1' },
      confirmations: [
        { paid_minor_units: 1000, request_number: 'REQ-1' },
        { paid_minor_units: 1200, request_number: 'REQ-1' },
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
      evaluateCelExpression('confirmations.map(c, c.paid_minor_units)', activation),
    ).toEqual([1000, 1200]);
    expect(
      evaluateCelExpression(
        'confirmations.filter(c, c.paid_minor_units > 1000).size()',
        activation,
      ),
    ).toBe(1);
    expect(evaluateCelExpression('size(confirmations)', activation)).toBe(2);
  });

  it('nests a macro inside another macro like the delivery rule does', () => {
    const activation = {
      request: {
        request_number: 'REQ-1',
        started_at: at('2025-01-01T00:00:00Z'),
        expired_at: at('2025-02-01T00:00:00Z'),
        delivery_address: 'Hangzhou',
      },
      confirmations: [
        {
          request_number: 'REQ-1',
          confirmed_at: at('2025-01-10T00:00:00Z'),
          delivery_note_number: 'DN-1',
        },
      ],
      proofs: [
        {
          request_number: 'REQ-1',
          delivery_note_number: 'DN-1',
          created_at: at('2025-01-10T00:00:00Z'),
          delivery_address: 'Hangzhou',
        },
      ],
    };

    expect(
      evaluateCelExpression(
        'confirmations.exists(c, c.request_number == request.request_number && c.confirmed_at >= request.started_at && c.confirmed_at <= request.expired_at && proofs.exists(p, p.request_number == request.request_number && p.delivery_note_number == c.delivery_note_number && p.created_at <= c.confirmed_at && p.delivery_address == request.delivery_address))',
        activation,
      ),
    ).toBe(true);
  });

  it('compares timestamps by instant, not by text', () => {
    expect(
      celEquals(
        at('2025-01-01T00:00:00Z'),
        at('2025-01-01T08:00:00+08:00'),
      ),
    ).toBe(true);
    expect(
      evaluateCelExpression('a < b', {
        a: at('2025-01-01T00:00:00Z'),
        b: '2025-01-02T00:00:00Z',
      }),
    ).toBe(true);
  });

  it('keeps the scalar and string helpers the rules use', () => {
    expect(evaluateCelExpression('"abc".contains("b")', {})).toBe(true);
    expect(evaluateCelExpression('"abc".startsWith("a")', {})).toBe(true);
    expect(evaluateCelExpression('"abc".matches("^a")', {})).toBe(true);
    expect(evaluateCelExpression('string(1)', {})).toBe('1');
    expect(evaluateCelExpression('int("7")', {})).toBe(7);
    expect(evaluateCelExpression('timestamp("2025-01-01T00:00:00Z")', {})).toBeInstanceOf(
      CelTimestamp,
    );
    expect(evaluateCelExpression('duration("90s")', {})).toBeInstanceOf(
      CelDuration,
    );
    expect(evaluateCelExpression('has(a.b) && !has(a.c)', { a: { b: 1 } })).toBe(
      true,
    );
    expect(evaluateCelExpression('type([])', {})).toBe('list');
  });

  it('reports where an expression broke', () => {
    expect(() => evaluateCelExpression('request.missing', { request: {} })).toThrow(
      "no such field 'missing'",
    );
    expect(() => compileCelExpression('1 +')).toThrow(CelEvaluationError);
    expect(() => compileCelExpression('request.').valueOf).toThrow(
      CelEvaluationError,
    );
    expect(() => evaluateCelExpression('"abc', {})).toThrow(/unterminated/);
    expect(() => evaluateCelExpression('a && b', { a: 1, b: true })).toThrow(
      /expected a bool/,
    );
  });

  it('lists the root identifiers a rule reads', () => {
    expect(
      compileCelExpression(
        'confirmations.exists(c, c.a == request.b) && now',
      ).identifiers(),
    ).toEqual(['confirmations', 'now', 'request']);
  });
});

describe('celValueToJson', () => {
  it('normalizes timestamps and durations the way the reports print them', () => {
    expect(celValueToJson(at('2025-01-01T08:00:00+08:00'))).toBe(
      '2025-01-01T00:00:00Z',
    );
    expect(celValueToJson(new CelDuration(90_500))).toBe('90s');
    expect(celValueToJson([at('2025-01-01T00:00:00.750Z')])).toEqual([
      '2025-01-01T00:00:00Z',
    ]);
    expect(celValueToJson({ nested: { when: at('2025-06-01T00:00:00Z') } })).toEqual(
      { nested: { when: '2025-06-01T00:00:00Z' } },
    );
  });
});
