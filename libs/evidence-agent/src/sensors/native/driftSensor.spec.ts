import { fileURLToPath } from 'node:url';

import { loadModelSources } from './modelSources.js';
import { auditProductionDrift } from './driftSensor.js';
import { readProductionTrace } from '../../telemetry/productionTrace.js';

const fixture = (path: string): string =>
  fileURLToPath(
    new URL(
      `../../../../evidence-model-core/tests/fixtures/${path}`,
      import.meta.url,
    ),
  );

const golden = fixture('models/valid-traceable-subscription');

const model = async () => (await loadModelSources(golden)).model;

const string = (value: string): Record<string, unknown> => ({
  stringValue: value,
});

const span = (
  evidenceRef: string,
  values: Readonly<Record<string, unknown>> = {},
  extra: {
    contextRef?: string;
    fulfillment?: { requestRef: string; status: string };
    startTimeUnixNano?: string;
  } = {},
): Record<string, unknown> => ({
  traceId: 'b'.repeat(32),
  spanId: `${evidenceRef}0000000`.slice(0, 16),
  name: `POST /${evidenceRef}`,
  startTimeUnixNano: extra.startTimeUnixNano ?? '1756717200000000000',
  attributes: [
    { key: 'fm.evidence.ref', value: string(evidenceRef) },
    ...(extra.contextRef === undefined
      ? []
      : [{ key: 'fm.context.ref', value: string(extra.contextRef) }]),
    ...(extra.fulfillment === undefined
      ? []
      : [
          {
            key: 'fm.fulfillment.request.ref',
            value: string(extra.fulfillment.requestRef),
          },
          {
            key: 'fm.fulfillment.status',
            value: string(extra.fulfillment.status),
          },
        ]),
    ...Object.entries(values).map(([name, value]) => ({
      key: `fm.value.${name}`,
      value: string(String(value)),
    })),
  ],
});

const exportOf = (spans: readonly Record<string, unknown>[]) => ({
  resourceSpans: [
    {
      resource: {
        attributes: [{ key: 'service.name', value: string('subscription-api') }],
      },
      scopeSpans: [{ spans }],
    },
  ],
});

describe('auditProductionDrift', () => {
  it('accepts a trace that commits exactly what the model declares', async () => {
    const audit = auditProductionDrift({
      model: await model(),
      trace: readProductionTrace(
        exportOf([
          span(
            'confirmation.content-payment',
            { confirmed_at: '2026-09-01T09:10:00Z', paid_minor_units: 19900, currency: 'CNY' },
            { contextRef: 'context.content-subscription' },
          ),
        ]),
      ),
    });

    expect(audit.findings).toEqual([]);
    expect(audit.passed).toBe(true);
    expect(audit.commitCount).toBe(1);
    expect(audit.modelId).toBe('traceable-subscription');
  });

  it('blocks evidence the model does not have', async () => {
    const audit = auditProductionDrift({
      model: await model(),
      trace: readProductionTrace(
        exportOf([span('evidence.ghost-refund', { amount: 100 })]),
      ),
    });

    expect(audit.passed).toBe(false);
    expect(audit.findings).toHaveLength(1);
    expect(audit.findings[0]).toMatchObject({
      kind: 'UNMODELED_EVIDENCE_COMMITTED',
      severity: 'block',
      evidenceRef: 'evidence.ghost-refund',
    });
    expect(audit.counts.UNMODELED_EVIDENCE_COMMITTED).toBe(1);
  });

  it('blocks a value the model derives from other input', async () => {
    const audit = auditProductionDrift({
      model: await model(),
      trace: readProductionTrace(
        exportOf([
          span(
            'request.content-payment',
            {
              started_at: '2026-09-01T09:00:00Z',
              expired_at: '2026-09-01T09:31:00Z',
              requested_minor_units: 19900,
              currency: 'CNY',
            },
            { contextRef: 'context.content-subscription' },
          ),
        ]),
      ),
    });

    const derived = audit.findings.filter(
      (item) => item.kind === 'DERIVED_VALUE_SUPPLIED',
    );

    expect(derived.map((item) => item.message)).toEqual([
      expect.stringContaining('request.content-payment#expired_at'),
      expect.stringContaining('request.content-payment#requested_minor_units'),
      expect.stringContaining('request.content-payment#currency'),
    ]);
    expect(derived[0]).toMatchObject({
      severity: 'block',
      modelExpectation: { ruleRef: 'rule.payment-deadline' },
    });
    expect(audit.passed).toBe(false);
  });

  it('warns when a service writes into someone else\'s context', async () => {
    const audit = auditProductionDrift({
      model: await model(),
      trace: readProductionTrace(
        exportOf([
          span(
            'confirmation.content-payment',
            { confirmed_at: '2026-09-01T09:10:00Z', paid_minor_units: 19900, currency: 'CNY' },
            { contextRef: 'context.cms' },
          ),
        ]),
      ),
    });

    expect(audit.findings.map((item) => item.kind)).toEqual([
      'CROSS_CONTEXT_WRITE',
    ]);
    expect(audit.findings[0]).toMatchObject({
      severity: 'warn',
      contextRef: 'context.cms',
      modelExpectation: { contextRef: 'context.content-subscription' },
    });
    expect(audit.passed).toBe(true);
  });

  it('warns about a field the model never declared', async () => {
    const audit = auditProductionDrift({
      model: await model(),
      trace: readProductionTrace(
        exportOf([
          span(
            'confirmation.content-payment',
            { confirmed_at: '2026-09-01T09:10:00Z', paid_minor_units: 19900, currency: 'CNY', coupon_code: 'X1' },
            { contextRef: 'context.content-subscription' },
          ),
        ]),
      ),
    });

    expect(audit.findings).toHaveLength(1);
    expect(audit.findings[0]).toMatchObject({
      kind: 'UNMODELED_ATTRIBUTE_WRITTEN',
      severity: 'warn',
      remediation: expect.stringContaining('coupon_code'),
    });
  });

  it('warns when a breach in production has no follow-up in the trace', async () => {
    const trace = readProductionTrace(
      exportOf([
        span(
          'request.content-payment',
          { started_at: '2026-09-01T09:00:00Z' },
          {
            contextRef: 'context.content-subscription',
            fulfillment: {
              requestRef: 'request.content-payment',
              status: 'breached',
            },
          },
        ),
      ]),
    );
    const audit = auditProductionDrift({ model: await model(), trace });

    expect(audit.findings.map((item) => item.kind)).toEqual([
      'BREACH_WITHOUT_FOLLOW_UP',
    ]);
    expect(audit.findings[0]).toMatchObject({
      severity: 'warn',
      modelExpectation: { ruleRef: 'rule.payment-expired' },
    });
  });

  it('warns when the breached request has no breach rule at all', async () => {
    const audit = auditProductionDrift({
      model: await model(),
      trace: readProductionTrace(
        exportOf([
          span(
            'request.content-access',
            { started_at: '2026-09-01T09:00:00Z' },
            {
              contextRef: 'context.content-subscription',
              fulfillment: {
                requestRef: 'request.content-access',
                status: 'breached',
              },
            },
          ),
        ]),
      ),
    });

    expect(audit.findings.map((item) => item.message)).toEqual([
      expect.stringContaining('模型没有为它声明违约判断与补偿履约'),
    ]);
  });

  it('carries the reader\'s shape errors into the audit', async () => {
    const audit = auditProductionDrift({
      model: await model(),
      trace: readProductionTrace({}),
    });

    expect(audit.errors).toEqual(['trace/resourceSpans: must be an array']);
    expect(audit.passed).toBe(true);
    expect(audit.counts).toEqual({
      UNMODELED_EVIDENCE_COMMITTED: 0,
      UNMODELED_ATTRIBUTE_WRITTEN: 0,
      DERIVED_VALUE_SUPPLIED: 0,
      CROSS_CONTEXT_WRITE: 0,
      BREACH_WITHOUT_FOLLOW_UP: 0,
    });
  });
});
