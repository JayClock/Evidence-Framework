import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { decideGovernance } from '@evidence-poc/evidence-agent';

import { createDriftService } from './mcpDriftService';

/**
 * The closed loop, from one saved model to a governance decision.
 *
 * Each piece is covered on its own; this test exists to prove the pieces agree
 * on the same model — that the frames a sandbox plays, the findings a trace
 * raises and the actions a policy licenses all describe one business.
 */

const fixture = path.resolve(
  import.meta.dirname,
  '../../../../libs/evidence-model-core/tests/fixtures/models/valid-traceable-subscription',
);

const string = (value: string): Record<string, unknown> => ({
  stringValue: value,
});

const span = (
  evidenceRef: string,
  attributes: readonly Record<string, unknown>[] = [],
  options: { contextRef?: string; status?: string; at?: string } = {},
): Record<string, unknown> => ({
  traceId: 'e'.repeat(32),
  spanId: `${evidenceRef}00`.slice(0, 16).padEnd(16, '0'),
  name: `POST /${evidenceRef}`,
  startTimeUnixNano: options.at ?? '1756717200000000000',
  attributes: [
    { key: 'fm.evidence.ref', value: string(evidenceRef) },
    ...(options.contextRef === undefined
      ? []
      : [{ key: 'fm.context.ref', value: string(options.contextRef) }]),
    ...(options.status === undefined
      ? []
      : [
          {
            key: 'fm.fulfillment.request.ref',
            value: string('request.content-payment'),
          },
          { key: 'fm.fulfillment.status', value: string(options.status) },
        ]),
    ...attributes,
  ],
});

const exportOf = (spans: readonly Record<string, unknown>[]) => ({
  resourceSpans: [
    {
      resource: {
        attributes: [{ key: 'service.name', value: string('billing-api') }],
      },
      scopeSpans: [{ spans }],
    },
  ],
});

let projectRoot = '';

beforeAll(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), 'evidence-loop-'));
  await mkdir(path.join(projectRoot, '.evidence'), { recursive: true });
  await symlink(fixture, path.join(projectRoot, '.evidence', 'fm'), 'dir');
});

afterAll(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe('production drift to governance on one model', () => {
  it('licenses no model change when production matches', async () => {
    const audit = await createDriftService().auditDrift({
      rootPath: projectRoot,
      document: exportOf([
        span(
          'confirmation.content-payment',
          [
            {
              key: 'fm.value.confirmed_at',
              value: string('2026-09-01T09:10:00Z'),
            },
            { key: 'fm.value.paid_minor_units', value: { intValue: '19900' } },
            { key: 'fm.value.currency', value: string('CNY') },
          ],
          { contextRef: 'context.content-subscription' },
        ),
      ]),
    });

    const decision = decideGovernance({
      drift: audit.findings.map((item) => ({
        kind: item.kind,
        severity: item.severity,
        message: item.message,
        evidenceRef: item.evidenceRef,
      })),
    });

    expect(audit.passed).toBe(true);
    expect(decision.verdict).toBe('healthy');
    expect(decision.canPatchModel).toBe(false);
  });

  it('refuses to absorb a derived value a service wrote itself', async () => {
    const audit = await createDriftService().auditDrift({
      rootPath: projectRoot,
      document: exportOf([
        span(
          'request.content-payment',
          [
            {
              key: 'fm.value.started_at',
              value: string('2026-09-01T09:00:00Z'),
            },
            // The deadline is the model's to compute; a service writing it is
            // the defect this whole loop is for.
            {
              key: 'fm.value.expired_at',
              value: string('2026-09-01T09:31:00Z'),
            },
          ],
          { contextRef: 'context.content-subscription' },
        ),
      ]),
    });
    const decision = decideGovernance({
      drift: audit.findings.map((item) => ({
        kind: item.kind,
        severity: item.severity,
        message: item.message,
        evidenceRef: item.evidenceRef,
      })),
    });

    expect(audit.passed).toBe(false);
    expect(decision.verdict).toBe('production_overreach');
    expect(decision.actions.map((item) => item.kind)).toEqual([
      'raise_blocking_ticket',
    ]);
    expect(decision.canPatchModel).toBe(false);
  });

  it('offers a repair when a breach in production left nothing behind', async () => {
    const audit = await createDriftService().auditDrift({
      rootPath: projectRoot,
      document: exportOf([
        span(
          'request.content-payment',
          [
            {
              key: 'fm.value.started_at',
              value: string('2026-09-01T09:00:00Z'),
            },
          ],
          { contextRef: 'context.content-subscription', status: 'breached' },
        ),
      ]),
    });
    const decision = decideGovernance({
      drift: audit.findings.map((item) => ({
        kind: item.kind,
        severity: item.severity,
        message: item.message,
        evidenceRef: item.evidenceRef,
      })),
    });

    expect(audit.findings.map((item) => item.kind)).toEqual([
      'BREACH_WITHOUT_FOLLOW_UP',
    ]);
    expect(decision.verdict).toBe('model_lagging');
    expect(decision.actions.map((item) => item.tool)).toEqual([
      'add_breach_compensation',
    ]);
  });
});
