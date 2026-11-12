import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSimulationService } from './mcpSimulationService';

const golden = path.resolve(
  import.meta.dirname,
  '../../../../libs/evidence-model-core/tests/fixtures/models/valid-traceable-subscription',
);

// The service reads a project root, so the fixture is mounted the way a real
// project holds it: `<root>/.evidence/fm`.
let projectRoot = '';

beforeAll(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), 'evidence-replay-'));
  await mkdir(path.join(projectRoot, '.evidence'), { recursive: true });
  await symlink(golden, path.join(projectRoot, '.evidence', 'fm'), 'dir');
});

afterAll(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

const trace = {
  resourceSpans: [
    {
      resource: {
        attributes: [{ key: 'service.name', value: { stringValue: 'billing' } }],
      },
      scopeSpans: [
        {
          spans: [
            {
              traceId: 'c'.repeat(32),
              spanId: 'd'.repeat(16),
              name: 'POST /payments',
              startTimeUnixNano: '1756717200000000000',
              attributes: [
                {
                  key: 'fm.evidence.ref',
                  value: { stringValue: 'confirmation.content-payment' },
                },
                {
                  key: 'fm.context.ref',
                  value: { stringValue: 'context.content-subscription' },
                },
                {
                  key: 'fm.value.confirmed_at',
                  value: { stringValue: '2026-09-01T09:10:00Z' },
                },
                {
                  key: 'fm.value.paid_minor_units',
                  value: { intValue: '19900' },
                },
                { key: 'fm.value.currency', value: { stringValue: 'CNY' } },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('createSimulationService', () => {
  it('summarizes every scenario and returns the frames it was asked for', async () => {
    const replay = await createSimulationService().replay({
      rootPath: projectRoot,
      scenarioId: 'scenario.successful-payment',
    });

    expect(replay.passed).toBe(true);
    expect(replay.errors).toEqual([]);
    expect(replay.scenarios.map((item) => item.scenarioId)).toEqual([
      'scenario.successful-payment',
    ]);
    expect(replay.frames.map((frame) => frame.sequence)).toEqual([1, 2, 3]);
    expect(replay.frames.at(-1)?.fulfillmentStates).toEqual([
      { requestInstanceRef: 'instance.payment-request', status: 'completed' },
    ]);
  });

  it('returns summaries only when no scenario was named', async () => {
    const replay = await createSimulationService().replay({
      rootPath: projectRoot,
    });

    expect(replay.frames).toEqual([]);
    expect(replay.scenarios).toHaveLength(3);
    expect(replay.scenarios.map((item) => item.stepCount)).toEqual([2, 1, 3]);
  });

  it('reports an unknown scenario as a failed replay instead of throwing', async () => {
    const replay = await createSimulationService().replay({
      rootPath: projectRoot,
      scenarioId: 'scenario.absent',
    });

    expect(replay.passed).toBe(false);
    expect(replay.errors).toEqual(["unknown scenario id 'scenario.absent'"]);
  });

  it('audits a trace against the saved model', async () => {
    const audit = await createSimulationService().auditDrift({
      rootPath: projectRoot,
      document: trace,
    });

    expect(audit).toMatchObject({
      modelId: 'traceable-subscription',
      spanCount: 1,
      commitCount: 1,
      passed: true,
      findings: [],
    });
  });

  it('answers readably when the model directory does not exist', async () => {
    const replay = await createSimulationService().replay({
      rootPath: '/nowhere/project',
    });
    const audit = await createSimulationService().auditDrift({
      rootPath: '/nowhere/project',
      document: trace,
    });

    expect(replay.passed).toBe(false);
    expect(replay.errors.length).toBeGreaterThan(0);
    expect(audit.passed).toBe(false);
    expect(audit.errors.length).toBeGreaterThan(0);
  });
});
