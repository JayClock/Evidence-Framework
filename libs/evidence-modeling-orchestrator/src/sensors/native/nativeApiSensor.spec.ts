import { describe, expect, it } from 'vitest';
import { readModelRoot } from '@evidence-poc/evidence-model-core';
import { fileURLToPath } from 'node:url';
import { checkNativeApiSensor } from './nativeApiSensor.js';
import { runNativeSensors } from './nativeSensors.js';
import { finalizeSensorReport } from '../sensorReport.js';

const model = async () =>
  (
    await readModelRoot(
      fileURLToPath(
        new URL(
          '../../../../evidence-api/tests/fixtures/full-lifecycle/fm',
          import.meta.url,
        ),
      ),
    )
  ).bundle;

describe('API sensor', () => {
  it('carries derived-to-input drift from unsaved models through draft and release diagnostics', async () => {
    const baseDocument = await model();
    baseDocument.entities
      .find((entity) => entity.id === 'confirmation.payment')!
      .attributes!.push({
        name: 'total_amount',
        label: 'Total amount',
        meaning: 'Confirmed amount',
        valueType: 'decimal',
        required: true,
        derivedByRuleRef: 'rule.total-amount',
      });
    baseDocument.rules.push({
      type: 'rule',
      id: 'rule.total-amount',
      kind: 'derivation',
      label: 'Total amount',
      description: 'Calculate amount',
      contextRef: 'context.product-procurement',
      expression: '42.0',
      bindings: {},
      resultType: 'decimal',
      target: { entityRef: 'confirmation.payment', attribute: 'total_amount' },
    });
    const currentDocument = structuredClone(baseDocument);
    currentDocument.rules = currentDocument.rules.filter(
      (rule) => rule.id !== 'rule.total-amount',
    );
    delete currentDocument.entities
      .find((entity) => entity.id === 'confirmation.payment')!
      .attributes!.find((field) => field.name === 'total_amount')!
      .derivedByRuleRef;
    const original = JSON.stringify([baseDocument, currentDocument]);
    const draft = checkNativeApiSensor({ baseDocument, currentDocument });
    const release = checkNativeApiSensor({
      baseDocument,
      currentDocument,
      mode: 'release',
    });
    expect(draft.snapshot.diagnostics).toEqual([]);
    expect(draft.diff?.summary.hasBreakingChanges).toBe(true);
    const breaking = (outcome: typeof draft) =>
      outcome.issues.filter((issue) => issue.code === 'API_BREAKING_CHANGE');
    expect(breaking(draft).length).toBeGreaterThan(0);
    expect(breaking(draft).every((issue) => issue.severity === 'warn')).toBe(
      true,
    );
    expect(breaking(release).every((issue) => issue.severity === 'block')).toBe(
      true,
    );
    expect(release.diff).toEqual(draft.diff);
    expect(release.summary.breakingChangeCount).toBe(breaking(release).length);
    expect(JSON.stringify([baseDocument, currentDocument])).toBe(original);
  });
  it('analyses an unsaved document without reading modelRoot or inventing a baseline', async () => {
    const document = await model();
    const result = await runNativeSensors({
      document,
      modelRoot: '/does-not-exist',
    });
    expect(result.report.apiSummary?.totalRoutes).toBeGreaterThan(0);
    expect(result.report.apiSummary?.hasBaseline).toBe(false);
    expect(result.report.unavailableSensors).toEqual([]);
    expect(result.report.isStageGateReady).toBe(false);
  });

  it('keeps a stable baseline and escalates breaking changes only for release analysis', async () => {
    const before = await model();
    const after = structuredClone(before);
    after.entities = after.entities.filter(
      (entity) => entity.id !== 'confirmation.payment',
    );
    after.relationships = after.relationships.filter(
      (edge) => edge.sourceRef !== 'confirmation.payment',
    );
    const draft = checkNativeApiSensor({
      currentDocument: after,
      baseDocument: before,
    });
    const release = checkNativeApiSensor({
      currentDocument: after,
      baseDocument: before,
      mode: 'release',
    });
    expect(draft.issues).toContainEqual(
      expect.objectContaining({
        code: 'API_BREAKING_CHANGE',
        severity: 'warn',
        targetNodeId: 'confirmation.payment',
      }),
    );
    expect(release.issues).toContainEqual(
      expect.objectContaining({
        code: 'API_BREAKING_CHANGE',
        severity: 'block',
      }),
    );
    expect(
      checkNativeApiSensor({ currentDocument: after, baseDocument: before })
        .diff,
    ).toEqual(draft.diff);
    expect(
      checkNativeApiSensor({ currentDocument: before, baseDocument: before })
        .diff?.summary.routesRemoved,
    ).toBe(0);
  });

  it('does not demand CRUD endpoints for participants and roles', async () => {
    const document = await model();
    const outcome = checkNativeApiSensor({ currentDocument: document });
    expect(
      outcome.issues
        .filter((issue) => issue.code === 'API_COVERAGE_GAP')
        .every(
          (issue) =>
            document.entities.find((entity) => entity.id === issue.targetNodeId)
              ?.category === 'evidence',
        ),
    ).toBe(true);
    expect(outcome.summary.coverageRatio).toBeLessThanOrEqual(1);
  });

  it('allows draft inspection while withholding release readiness on API gaps', () => {
    const report = finalizeSensorReport({
      issues: [
        {
          issueId: 'api:gap',
          source: 'audit_api',
          severity: 'warn',
          code: 'API_COVERAGE_GAP',
          message: 'gap',
        },
      ],
      keyDataSummary: {
        totalItems: 0,
        resolvedCount: 0,
        decisionOwedCount: 0,
        unresolvedItems: [],
      },
      stageGate: { target: 'api', passed: true, scopeRefs: [], errors: [] },
      apiSummary: {
        totalRoutes: 0,
        coverageRatio: 0,
        uncoveredEntities: ['evidence.new'],
        breakingChangeCount: 0,
        hasBaseline: true,
        modelDigest: 'digest',
      },
    });
    expect(report.passed).toBe(true);
    expect(report.canPreviewApi).toBe(true);
    expect(report.isStageGateReady).toBe(false);
  });

  it('isolates a failed API analysis from the FM result', async () => {
    const document = await model();
    const baseline = structuredClone(document);
    baseline.manifest.id = 'another-model';
    const result = await runNativeSensors({
      document,
      baseDocument: baseline,
      modelRoot: '/unused',
    });
    expect(result.fmCheck).toBeDefined();
    expect(result.report.unavailableSensors).toContain('audit_api');
    expect(result.report.passed).toBe(false);
  });
});
