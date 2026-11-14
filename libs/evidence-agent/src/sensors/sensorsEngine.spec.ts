import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildDelivery } from '@evidence-poc/evidence-api';
import { readModelRoot } from '@evidence-poc/evidence-model-core';
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

  it('does not turn a draft refresh or an obsolete saved report into release authorization', async () => {
    const engine = createSensorsEngine();
    const { bundle } = await readModelRoot(goldenModel);
    const route = buildDelivery(bundle).routes.find(
      (route) =>
        route.method === 'POST' && route.fields.some((field) => field.required),
    )!;
    const field = route.fields.find((field) => field.required)!;
    const baseline = structuredClone(bundle);
    const entity = baseline.entities.find(
      (entity) => entity.id === route.entityRef,
    )!;
    entity.attributes = entity.attributes!.filter(
      (attribute) => attribute.name !== field.name,
    );
    const gate = await engine.checkStageGate({
      target: 'api',
      modelRoot: goldenModel,
      scopeRefs: ['context.content-subscription'],
      baseDocument: baseline,
    });
    expect(gate.passed).toBe(false);
    expect(
      gate.errors.some((error) => error.startsWith('API_BREAKING_CHANGE:')),
    ).toBe(true);
    const checked = await engine.runFullSensors({
      modelRoot: goldenModel,
      scopeRefs: ['context.content-subscription'],
    });
    const stale = await engine.checkStageGate({
      target: 'api',
      modelRoot: goldenModel,
      scopeRefs: ['context.content-subscription'],
      fmCheck: { ...checked.fmCheck!, modelDigest: 'old' },
    });
    expect(stale.passed).toBe(false);
    expect(stale.errors).toContain('FM 检查与当前模型摘要不一致，请重新检查。');
  });

  it('keeps API coverage gaps out of the FM-only visualization gate', async () => {
    const engine = createSensorsEngine();
    const input = {
      modelRoot: goldenModel,
      scopeRefs: ['context.content-subscription'],
    };
    const summary = await engine.checkStageGate({
      ...input,
      target: 'visualization',
    });
    expect(summary.passed).toBe(true);
    expect(summary.errors).toEqual([]);
    const apiGate = await engine.checkStageGate({ ...input, target: 'api' });
    expect(apiGate.passed).toBe(false);
    expect(
      apiGate.errors.every((error) => error.startsWith('API_COVERAGE_GAP:')),
    ).toBe(true);
    expect(apiGate.errors).toHaveLength(2);
  });
});
