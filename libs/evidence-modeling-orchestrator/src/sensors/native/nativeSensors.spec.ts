import { fileURLToPath } from 'node:url';

import { readModelRoot } from '@evidence-poc/evidence-model-core';

import { runNativeKeyDataAudit } from './nativeKeyDataAudit.js';
import { loadModelSources, runNativeFmCheck } from './modelSources.js';
import { runNativeSensors } from './nativeSensors.js';
import { checkInterviewTrace } from './nativeTraceCheck.js';
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
  it('matches the report check_fm.py prints for the golden fixture', async () => {
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
      'sha256:1e47609b3502a403cd76d680b5978fb59d3219dee514524dd59d633bda05ceee',
    );
    expect(simulation?.scenarioResults).toHaveLength(3);
  });
});

describe('runNativeKeyDataAudit', () => {
  it('classifies key data exactly as audit_key_data.py does', async () => {
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

describe('checkInterviewTrace', () => {
  it('accepts a trace that only names modeled objects', async () => {
    const { bundle } = await readModelRoot(golden);
    const document = {
      schemaVersion: '5.0',
      modelId: 'traceable-subscription',
      traces: [
        {
          traceId: 'trace-1',
          timestamp: '2026-09-01T09:20:00Z',
          focus: {
            contextRef: 'context.content-subscription',
            evidenceRef: 'request.content-payment',
            roleRef: 'role.subscriber',
          },
          narrative: { judgment: '按月订阅', story: '用户确认按月订阅并预付一期。' },
          qa: [{ questionId: 'Q1', question: '计费周期多久？' }],
          userInput: {
            rawText: '按月。',
            confirmedFacts: ['范围结束确认：context.content-subscription'],
          },
          targetBindings: [
            { evidenceRef: 'request.content-payment', sourceType: 'interview_statement' },
          ],
        },
      ],
    };

    expect(checkInterviewTrace(document, bundle)).toEqual({
      valid: true,
      traceCount: 1,
      errors: [],
      limitations: [],
    });
  });

  it('reports an unmodeled reference and a repeated question id', async () => {
    const { bundle } = await readModelRoot(golden);
    const record = {
      traceId: 'trace-1',
      timestamp: '2026-09-01T09:20:00Z',
      focus: { evidenceRef: 'request.missing' },
      narrative: { judgment: 'j', story: 's' },
      qa: [
        { questionId: 'Q1', question: 'q' },
        { questionId: 'Q1', question: 'q again' },
      ],
      userInput: { rawText: 'r', confirmedFacts: [] },
      targetBindings: [
        {
          evidenceRef: 'request.content-payment',
          attributeName: 'not_modeled',
          sourceType: 'interview_statement',
        },
      ],
    };

    expect(
      checkInterviewTrace(
        { schemaVersion: '5.0', modelId: 'traceable-subscription', traces: [record] },
        bundle,
      ),
    ).toMatchObject({
      valid: false,
      traceCount: 1,
      errors: [
        "traces[0].qa[1].questionId: duplicate 'Q1' also used at qa[0]",
        "traces[0].focus.evidenceRef: unmodeled reference 'request.missing'",
        "traces[0].targetBindings[0].attributeName: 'request.content-payment' has no modeled attribute 'not_modeled'",
      ],
    });
  });

  it('reports a document that is not a trace at all', async () => {
    const { bundle } = await readModelRoot(golden);

    expect(checkInterviewTrace([], bundle).errors).toEqual([
      '<root>: must be an object',
    ]);
  });
});

describe('checkNativeStageGate', () => {
  const scopes = ['context.content-subscription'];

  const trace = (facts: readonly string[]) => ({
    traces: [{ traceId: 'trace-1', userInput: { confirmedFacts: facts } }],
  });

  it('opens for a checked scope with a recorded closure', async () => {
    const sources = await loadModelSources(golden);
    const { report } = await runNativeFmCheck(sources, { scopeRefs: scopes });
    const gate = checkNativeStageGate({
      target: 'api',
      fmCheck: report,
      trace: trace(['范围结束确认：context.content-subscription']),
      scopes,
    });

    expect(gate).toMatchObject({
      passed: true,
      target: 'api',
      scopeRefs: scopes,
      errors: [],
    });
    expect(gate.limitations).toEqual([
      'downstream authorization and business approval remain human statements; this gate only proves scope completeness and recorded closure',
    ]);
  });

  it('stays shut without a recorded human closure', async () => {
    const sources = await loadModelSources(golden);
    const { report } = await runNativeFmCheck(sources, { scopeRefs: scopes });
    const gate = checkNativeStageGate({
      target: 'api',
      fmCheck: report,
      trace: trace(['范围结束确认：context.something-else']),
      scopes,
    });

    expect(gate.passed).toBe(false);
    expect(gate.errors).toEqual([
      "no recorded human closure for scope 'context.content-subscription'; expected a confirmed fact '范围结束确认：context.content-subscription'",
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
      trace: trace([]),
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

  it('reports a missing trace as an invalid trace instead of crashing', async () => {
    const outcome = await runNativeSensors({
      modelRoot: golden,
      tracePath: fixture('no-such-trace.json'),
    });

    expect(outcome.report.passed).toBe(false);
    expect(outcome.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'TRACE_INVALID',
          severity: 'block',
          message: expect.stringContaining('unreadable trace file'),
        }),
      ]),
    );
  });
});
