import { fileURLToPath } from 'node:url';

import { runNativeKeyDataAudit } from './nativeKeyDataAudit.js';
import { loadModelSources, runNativeFmCheck } from './modelSources.js';
import { runNativeSensors } from './nativeSensors.js';
import { checkNativeStageGate, filterFmCheckErrors } from './nativeStageGate.js';

const fixture = (path: string): string =>
  fileURLToPath(
    new URL(
      `../../../../evidence-model-core/tests/fixtures/${path}`,
      import.meta.url,
    ),
  );

const golden = fixture('models/valid-traceable-subscription');

describe('loadModelSources', () => {
  it('reads the model, the suite and a digest in one pass', async () => {
    const sources = await loadModelSources(golden);

    expect(sources.sourceIssues).toEqual([]);
    expect(sources.model.manifest.id).toBe('traceable-subscription');
    expect(sources.suite.scenarios).toHaveLength(3);
    expect(await sources.rereadDigest()).toBe(sources.digest);
  });

  it('refuses a bundle, which the native sensors do not read', async () => {
    await expect(loadModelSources('/tmp/model.evidence.json')).rejects.toThrow(
      /native sensors read a model directory/,
    );
  });
});

describe('runNativeFmCheck', () => {
  it('matches the pinned report for the golden fixture', async () => {
    const sources = await loadModelSources(golden);
    const { report, simulation } = await runNativeFmCheck(sources, {
      scopeRefs: ['context.content-subscription'],
    });

    expect(report).toMatchObject({
      checkVersion: 5,
      valid: true,
      consistent: true,
      complete: true,
      gaps: [],
      inputChanged: false,
      executedScenarioCount: 3,
      simulationPassed: true,
    });
    expect(report.modelDigest).toBe(
      'sha256:7b002eff09437a82cc90f6b47830633fff1eeb2aa8f7213ba233e22bcdb21b04',
    );
    expect(simulation?.scenarioResults).toHaveLength(3);
  });
});

describe('runNativeKeyDataAudit', () => {
  it('classifies key data as the pinned ledger does', async () => {
    const sources = await loadModelSources(golden);
    const { traceability } = await runNativeFmCheck(sources, {
      detectInputChange: false,
    });
    const report = runNativeKeyDataAudit(sources.model, traceability);

    expect(report).toEqual({
      checkVersion: 1,
      valid: true,
      modelId: 'traceable-subscription',
      keyDataCount: 14,
      counts: {
        'contract-term': 3,
        derived: 3,
        'needs-decision': 1,
        'request-input': 2,
        'result-fact': 5,
      },
      needsDecision: [
        {
          contextRef: 'context.content-subscription',
          meaning: '订阅期内的访问时段截止时间',
          path: 'request.content-access#expired_at',
          valueType: 'timestamp',
        },
      ],
      derived: [
        {
          path: 'request.content-payment#currency',
          ruleRef: 'rule.payment-request-currency',
          sources: ['contract.content-subscription#currency'],
        },
        {
          path: 'request.content-payment#expired_at',
          ruleRef: 'rule.payment-deadline',
          sources: ['request.content-payment#started_at'],
        },
        {
          path: 'request.content-payment#requested_minor_units',
          ruleRef: 'rule.payment-request-amount',
          sources: ['contract.content-subscription#price_minor_units'],
        },
      ],
      note: 'needsDecision 是待决清单，不是错误：每项须给出提供方结论（合同参数、前序凭证属性或请求形成事实），或补派生规则。',
    });
  });
});

describe('checkNativeStageGate', () => {
  const scopes = ['context.content-subscription'];

  it('opens for a checked scope the saved report covers', async () => {
    const sources = await loadModelSources(golden);
    const { report } = await runNativeFmCheck(sources, { scopeRefs: scopes });
    const gate = checkNativeStageGate({
      target: 'api',
      fmCheck: report,
      scopes,
    });

    expect(gate).toMatchObject({
      passed: true,
      target: 'api',
      scopeRefs: scopes,
      errors: [],
    });
  });

  it('stays shut when the report does not cover the requested scope', async () => {
    const sources = await loadModelSources(golden);
    const { report } = await runNativeFmCheck(sources, { scopeRefs: scopes });
    const gate = checkNativeStageGate({
      target: 'api',
      fmCheck: report,
      scopes: ['context.something-else'],
    });

    expect(gate.passed).toBe(false);
    expect(gate.errors).toEqual([
      "FM check does not cover scope 'context.something-else'",
    ]);
  });

  it('refuses an unbounded model and a stale report', async () => {
    const sources = await loadModelSources(golden);
    const { report } = await runNativeFmCheck(sources, {
      scopeRefs: scopes,
      detectInputChange: false,
    });

    expect(
      filterFmCheckErrors({ ...report, inputChanged: true }, []).errors,
    ).toEqual(
      expect.arrayContaining([
        'FM inputs changed after the check; the evidence is stale',
      ]),
    );

    const unbounded = checkNativeStageGate({
      target: 'visualization',
      fmCheck: { ...report, checkVersion: 4 },
      scopes: [],
    });

    expect(unbounded.passed).toBe(false);
    expect(unbounded.errors).toEqual(
      expect.arrayContaining([
        'no scope supplied; downstream never consumes an unbounded model',
        'FM check contract is not version 5: 4',
      ]),
    );
  });
});

describe('runNativeSensors', () => {
  it('folds every native report into one verdict', async () => {
    const outcome = await runNativeSensors({
      modelRoot: golden,
      scopeRefs: ['context.content-subscription'],
    });

    expect(outcome.report.passed).toBe(true);
    expect(outcome.report.blockCount).toBe(0);
    expect(outcome.report.unavailableSensors).toEqual([]);
    expect(outcome.report.keyDataSummary).toMatchObject({
      totalItems: 14,
      decisionOwedCount: 1,
      resolvedCount: 13,
    });
    expect(outcome.scenarioResults).toHaveLength(3);
    expect(outcome.fmCheck?.executedScenarioCount).toBe(3);
  });
});
