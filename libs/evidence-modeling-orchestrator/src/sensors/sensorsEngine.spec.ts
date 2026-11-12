import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createSensorsEngine } from './sensorsEngine.js';

const goldenModel = fileURLToPath(
  new URL(
    '../../../evidence-model-core/tests/fixtures/models/valid-traceable-subscription',
    import.meta.url,
  ),
);

describe('createSensorsEngine', () => {
  it('reads the model directly and needs no interpreter', async () => {
    const engine = createSensorsEngine({
      now: () => new Date('2026-11-11T09:00:00.000Z'),
    });

    const outcome = await engine.runFullSensors({
      modelRoot: goldenModel,
      scopeRefs: ['context.content-subscription'],
    });

    expect(outcome.report.timestamp).toBe('2026-11-11T09:00:00.000Z');
    expect(outcome.report.passed).toBe(true);
    expect(outcome.report.unavailableSensors).toEqual([]);
    expect(outcome.fmCheck?.executedScenarioCount).toBe(3);
    expect(outcome.keyData?.keyDataCount).toBe(14);
  });

  it('gates natively from the same report the sensors produce', async () => {
    const engine = createSensorsEngine();
    const trace = fileURLToPath(
      new URL(
        '../../../evidence-model-core/tests/fixtures/models/valid-traceable-subscription/README.md',
        import.meta.url,
      ),
    );
    const summary = await engine.checkStageGate({
      target: 'api',
      modelRoot: goldenModel,
      tracePath: trace,
      scopeRefs: ['context.content-subscription'],
    });

    // The README is not a trace, so the gate must stay shut rather than pass.
    expect(summary.passed).toBe(false);
    expect(summary.errors).toEqual(
      expect.arrayContaining(['Interview trace is not a JSON object']),
    );
  });
});
