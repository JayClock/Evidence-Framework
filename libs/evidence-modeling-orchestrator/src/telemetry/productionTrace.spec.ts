import { readProductionTrace, TRACE_ATTRIBUTE_KEYS } from './productionTrace.js';

const span = (
  name: string,
  attributes: readonly { key: string; value: Record<string, unknown> }[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  traceId: 'a'.repeat(32),
  spanId: name.padEnd(16, '0').slice(0, 16),
  name,
  startTimeUnixNano: '1756717200000000000',
  attributes,
  ...extra,
});

const string = (value: string): Record<string, unknown> => ({
  stringValue: value,
});

const long = (value: number): Record<string, unknown> => ({
  intValue: String(value),
});

const exportOf = (
  spans: readonly Record<string, unknown>[],
  serviceName = 'checkout-api',
): Record<string, unknown> => ({
  resourceSpans: [
    {
      resource: {
        attributes: [
          { key: TRACE_ATTRIBUTE_KEYS.serviceName, value: string(serviceName) },
        ],
      },
      scopeSpans: [{ spans }],
    },
  ],
});

describe('readProductionTrace', () => {
  it('reads a span that names Evidence as one commit', () => {
    const trace = readProductionTrace(
      exportOf([
        span('POST /payments/{id}/confirm', [
          { key: TRACE_ATTRIBUTE_KEYS.evidenceRef, value: string('confirmation.payment') },
          { key: TRACE_ATTRIBUTE_KEYS.contextRef, value: string('context.payment') },
          { key: `${TRACE_ATTRIBUTE_KEYS.valuePrefix}confirmed_at`, value: string('2026-09-01T09:10:00Z') },
          { key: `${TRACE_ATTRIBUTE_KEYS.valuePrefix}amount`, value: long(19900) },
        ]),
      ]),
    );

    expect(trace.errors).toEqual([]);
    expect(trace.spanCount).toBe(1);
    expect(trace.commits).toEqual([
      {
        traceId: 'a'.repeat(32),
        spanId: 'POST /payments/{'.padEnd(16, '0').slice(0, 16),
        serviceName: 'checkout-api',
        operation: 'POST /payments/{id}/confirm',
        at: new Date(1756717200000).toISOString(),
        evidenceRef: 'confirmation.payment',
        contextRef: 'context.payment',
        values: { confirmed_at: '2026-09-01T09:10:00Z', amount: 19900 },
        fulfillment: null,
      },
    ]);
  });

  it('skips spans that are not business commits without complaining', () => {
    const trace = readProductionTrace(
      exportOf([
        span('GET /health', []),
        span('SELECT payments', [
          { key: 'db.system', value: string('postgresql') },
        ]),
      ]),
    );

    expect(trace.spanCount).toBe(2);
    expect(trace.commits).toEqual([]);
    expect(trace.errors).toEqual([]);
  });

  it('reads the fulfillment a span claims, and ignores an unknown status', () => {
    const committed = (status: string) =>
      readProductionTrace(
        exportOf([
          span('POST /payments/{id}/confirm', [
            { key: TRACE_ATTRIBUTE_KEYS.evidenceRef, value: string('confirmation.payment') },
            { key: TRACE_ATTRIBUTE_KEYS.fulfillmentRequestRef, value: string('request.payment') },
            { key: TRACE_ATTRIBUTE_KEYS.fulfillmentStatus, value: string(status) },
          ]),
        ]),
      ).commits[0]?.fulfillment;

    expect(committed('completed')).toEqual({
      requestRef: 'request.payment',
      status: 'completed',
    });
    expect(committed('probably-fine')).toBeNull();
  });

  it('reports a commit the audit cannot place, and keeps reading', () => {
    const trace = readProductionTrace(
      exportOf([
        span('POST /orders', [
          { key: TRACE_ATTRIBUTE_KEYS.evidenceRef, value: string('evidence.order') },
        ], { traceId: '', spanId: '' }),
        span('POST /orders/{id}/confirm', [
          { key: TRACE_ATTRIBUTE_KEYS.evidenceRef, value: string('confirmation.order') },
        ]),
      ]),
    );

    expect(trace.commits).toHaveLength(1);
    expect(trace.errors).toHaveLength(1);
    expect(trace.errors[0]).toContain('carries no traceId/spanId');
  });

  it('decodes every OTLP value kind the export can carry', () => {
    const trace = readProductionTrace(
      exportOf([
        span('POST /x', [
          { key: TRACE_ATTRIBUTE_KEYS.evidenceRef, value: string('evidence.x') },
          { key: `${TRACE_ATTRIBUTE_KEYS.valuePrefix}flag`, value: { boolValue: true } },
          { key: `${TRACE_ATTRIBUTE_KEYS.valuePrefix}rate`, value: { doubleValue: 0.5 } },
          {
            key: `${TRACE_ATTRIBUTE_KEYS.valuePrefix}items`,
            value: { arrayValue: { values: [string('a'), string('b')] } },
          },
          {
            key: `${TRACE_ATTRIBUTE_KEYS.valuePrefix}party`,
            value: {
              kvlistValue: {
                values: [{ key: 'id', value: string('party.customer') }],
              },
            },
          },
        ]),
      ]),
    );

    expect(trace.commits[0]?.values).toEqual({
      flag: true,
      rate: 0.5,
      items: ['a', 'b'],
      party: { id: 'party.customer' },
    });
  });

  it('orders commits by the time the services reported', () => {
    const trace = readProductionTrace(
      exportOf([
        span('second', [
          { key: TRACE_ATTRIBUTE_KEYS.evidenceRef, value: string('evidence.b') },
        ], { startTimeUnixNano: '1756717202000000000' }),
        span('first', [
          { key: TRACE_ATTRIBUTE_KEYS.evidenceRef, value: string('evidence.a') },
        ], { startTimeUnixNano: '1756717201000000000' }),
      ]),
    );

    expect(trace.commits.map((commit) => commit.evidenceRef)).toEqual([
      'evidence.a',
      'evidence.b',
    ]);
  });

  it('refuses a document that is not an OTLP export', () => {
    expect(readProductionTrace(null)).toEqual({
      commits: [],
      spanCount: 0,
      errors: ['trace: must be an object'],
    });
    expect(readProductionTrace({ spans: [] }).errors).toEqual([
      'trace/resourceSpans: must be an array',
    ]);
  });
});
