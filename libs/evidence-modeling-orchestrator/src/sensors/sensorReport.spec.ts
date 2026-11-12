import { describe, expect, it } from 'vitest';

import {
  buildSensorReport,
  driftIssues,
  finalizeSensorReport,
  fmCheckIssues,
  keyDataSummaryOf,
  stageGateSummaryOf,
} from './sensorReport.js';

describe('fmCheckIssues', () => {
  it('turns static inconsistency into blocking findings', () => {
    const issues = fmCheckIssues({
      valid: false,
      errors: ['request.payment: 缺少确认端'],
      gaps: ['global pursuit is not closed'],
      executedScenarioCount: 2,
    });

    expect(issues.map(({ severity, code }) => ({ severity, code }))).toEqual([
      { severity: 'block', code: 'FM_INCONSISTENT' },
      { severity: 'warn', code: 'FM_SCOPE_GAP' },
    ]);
    expect(issues[0]?.suggestion).toContain('重新运行一致性检查');
  });

  it('reports stale evidence and an empty scenario set at their own severity', () => {
    const issues = fmCheckIssues({
      valid: true,
      errors: [],
      gaps: [],
      inputChanged: true,
      executedScenarioCount: 0,
    });

    expect(issues.map(({ severity, code }) => `${severity}:${code}`)).toEqual([
      'warn:FM_INPUT_CHANGED',
      'info:FM_NO_SCENARIO',
    ]);
  });

  it('stays silent on a clean report', () => {
    expect(
      fmCheckIssues({
        valid: true,
        errors: [],
        gaps: [],
        executedScenarioCount: 3,
      }),
    ).toEqual([]);
  });
});

describe('keyDataSummaryOf', () => {
  it('counts inventoried items against the decision list', () => {
    const { summary, issues } = keyDataSummaryOf({
      keyDataCount: 60,
      needsDecision: [
        {
          path: 'request.payment#requested_minor_units',
          contextRef: 'ctx.purchase',
        },
        { path: 'request.delivery#expired_at' },
      ],
    });

    expect(summary.totalItems).toBe(60);
    expect(summary.decisionOwedCount).toBe(2);
    expect(summary.resolvedCount).toBe(58);
    expect(summary.unresolvedItems).toEqual([
      {
        path: 'request.payment#requested_minor_units',
        contextRef: 'ctx.purchase',
      },
      { path: 'request.delivery#expired_at' },
    ]);
    expect(issues).toHaveLength(2);
    expect(issues[0]?.severity).toBe('warn');
    expect(issues[0]?.targetNodeId).toBe(
      'request.payment#requested_minor_units',
    );
    expect(issues[0]?.contextRef).toBe('ctx.purchase');
  });

  it('reports a resolved ledger as info', () => {
    const { summary, issues } = keyDataSummaryOf({
      keyDataCount: 4,
      needsDecision: [],
    });

    expect(summary.resolvedCount).toBe(4);
    expect(issues).toEqual([
      expect.objectContaining({ severity: 'info', code: 'KEY_DATA_RESOLVED' }),
    ]);
  });
});

describe('buildSensorReport', () => {
  it('keeps a model with owed decisions consistent but gates it shut', () => {
    const report = buildSensorReport({
      fmCheck: { valid: true, errors: [], gaps: [], executedScenarioCount: 1 },
      keyData: {
        keyDataCount: 10,
        needsDecision: [{ path: 'request.payment#expired_at' }],
      },
      stageGate: {
        target: 'api',
        passed: true,
        scopeRefs: ['ctx.purchase'],
        errors: [],
      },
      now: () => new Date('2026-11-11T08:00:00.000Z'),
    });

    expect(report.timestamp).toBe('2026-11-11T08:00:00.000Z');
    expect(report.passed).toBe(true);
    expect(report.blockCount).toBe(0);
    expect(report.warnCount).toBe(1);
    expect(report.keyDataSummary.decisionOwedCount).toBe(1);
    expect(report.isStageGateReady).toBe(false);
  });

  it('blocks when the pinned interpreter is gone', () => {
    const report = buildSensorReport({
      unavailableSensors: ['check_fm', 'audit_key_data'],
    });

    expect(report.passed).toBe(false);
    expect(report.blockCount).toBe(2);
    expect(report.isStageGateReady).toBe(false);
    expect(report.issues.map(({ code }) => code)).toEqual([
      'SENSOR_UNAVAILABLE',
      'SENSOR_UNAVAILABLE',
    ]);
  });

  it('reports an empty ledger when the audit did not run', () => {
    expect(buildSensorReport({}).keyDataSummary).toEqual({
      totalItems: 0,
      resolvedCount: 0,
      decisionOwedCount: 0,
      unresolvedItems: [],
    });
  });
});

describe('finalizeSensorReport', () => {
  it('recounts severities and de-duplicates identical findings', () => {
    const base = buildSensorReport({
      fmCheck: { valid: true, errors: [], gaps: [], executedScenarioCount: 1 },
    });
    const report = finalizeSensorReport({
      issues: [
        ...base.issues,
        {
          issueId: 'fm:1',
          severity: 'block',
          source: 'check_fm',
          code: 'FM_INCONSISTENT',
          message: 'Entity 引用不存在',
        },
        {
          issueId: 'fm:1',
          severity: 'block',
          source: 'check_fm',
          code: 'FM_INCONSISTENT',
          message: 'Entity 引用不存在',
        },
      ],
      keyDataSummary: base.keyDataSummary,
    });

    expect(report.issues).toHaveLength(1);
    expect(report.blockCount).toBe(1);
    expect(report.passed).toBe(false);
  });
});

describe('stageGateSummaryOf', () => {
  it('defaults missing fields to a closed gate', () => {
    expect(stageGateSummaryOf({})).toEqual({
      target: 'api',
      passed: false,
      scopeRefs: [],
      errors: [],
    });
  });

  it('keeps the target and scopes from the saved report', () => {
    expect(
      stageGateSummaryOf({
        target: 'visualization',
        passed: true,
        scopeRefs: ['ctx.purchase'],
      }),
    ).toEqual({
      target: 'visualization',
      passed: true,
      scopeRefs: ['ctx.purchase'],
      errors: [],
    });
  });
});

describe('driftIssues', () => {
  it('keeps the audit\'s severity and points at the evidence it names', () => {
    const issues = driftIssues({
      findings: [
        {
          kind: 'DERIVED_VALUE_SUPPLIED',
          severity: 'block',
          message: '服务直接写入了派生字段 request.payment#amount。',
          evidenceRef: 'request.payment',
          contextRef: 'context.payment',
          remediation: '改由规则算出。',
        },
        {
          kind: 'CROSS_CONTEXT_WRITE',
          severity: 'warn',
          message: '凭证被写进了别的上下文。',
          evidenceRef: null,
          contextRef: null,
        },
      ],
    });

    expect(issues.map((item) => `${item.severity}:${item.code}`)).toEqual([
      'block:DERIVED_VALUE_SUPPLIED',
      'warn:CROSS_CONTEXT_WRITE',
    ]);
    expect(issues[0]).toMatchObject({
      source: 'audit_drift',
      targetNodeId: 'request.payment',
      contextRef: 'context.payment',
      suggestion: '改由规则算出。',
    });
    expect(issues[1]?.targetNodeId).toBeUndefined();
  });

  it('reports a trace it could not read instead of an empty clean audit', () => {
    const issues = driftIssues({ errors: ['trace/resourceSpans: must be an array'] });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: 'warn',
      code: 'DRIFT_TRACE_UNREADABLE',
    });
  });

  it('folds into the one verdict, so a blocking drift closes the gate', () => {
    const report = buildSensorReport({
      fmCheck: { valid: true, errors: [], gaps: [] },
      drift: {
        findings: [
          {
            kind: 'UNMODELED_EVIDENCE_COMMITTED',
            severity: 'block',
            message: '模型里没有这张凭证。',
            evidenceRef: 'evidence.ghost',
          },
        ],
      },
    });

    expect(report.passed).toBe(false);
    expect(report.blockCount).toBe(1);
    expect(report.issues.map((item) => item.source)).toContain('audit_drift');
  });
});
