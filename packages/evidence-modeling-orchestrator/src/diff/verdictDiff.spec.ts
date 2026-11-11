import { compareSensorReports } from './verdictDiff.js';
import {
  buildSensorReport,
  finalizeSensorReport,
  type SensorIssue,
  type SensorReport,
} from '../sensors/sensorReport.js';

const issue = (
  source: SensorIssue['source'],
  code: string,
  message: string,
): SensorIssue => ({
  issueId: `${source}:${code}:${message}`,
  severity: source === 'check_fm' ? 'block' : 'warn',
  source,
  code,
  message,
});

const reportOf = (issues: readonly SensorIssue[]): SensorReport =>
  finalizeSensorReport({
    issues,
    keyDataSummary: {
      totalItems: 3,
      resolvedCount: 3,
      decisionOwedCount: 0,
      unresolvedItems: [],
    },
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  });

describe('compareSensorReports', () => {
  it('refuses to compare before both branches ran their sensors', () => {
    const onlyTarget = compareSensorReports(null, reportOf([]));

    expect(onlyTarget).toEqual(
      expect.objectContaining({
        comparable: false,
        base: null,
        fixedIssues: [],
        introducedIssues: [],
      }),
    );
    expect(onlyTarget.target?.passed).toBe(true);
  });

  it('reports no movement for the same verdict twice', () => {
    const shared = issue('check_fm', 'FM_SCOPE_GAP', '缺少验证场景');

    const diff = compareSensorReports(reportOf([shared]), reportOf([shared]));

    expect(diff.comparable).toBe(true);
    expect(diff.fixedIssues).toEqual([]);
    expect(diff.introducedIssues).toEqual([]);
    expect(diff.sharedIssueCount).toBe(1);
    expect(diff.gateImproved).toBe(false);
    expect(diff.gateRegressed).toBe(false);
  });

  it('separates what a branch fixed from what it introduced', () => {
    const fixed = issue('check_fm', 'FM_INCONSISTENT', '请求未关联合同');
    const introduced = issue('audit_key_data', 'KEY_DATA_DECISION_OWED', '缺少提供方');

    const diff = compareSensorReports(
      reportOf([fixed]),
      reportOf([introduced]),
    );

    expect(diff.fixedIssues).toEqual([fixed]);
    expect(diff.introducedIssues).toEqual([introduced]);
    expect(diff.sharedIssueCount).toBe(0);
  });

  it('orders blocking findings ahead of warnings', () => {
    const warn = issue('audit_key_data', 'KEY_DATA_DECISION_OWED', '缺少提供方');
    const block = issue('check_fm', 'FM_INCONSISTENT', '合同缺少另一方');

    const diff = compareSensorReports(reportOf([]), reportOf([warn, block]));

    expect(diff.introducedIssues.map((item) => item.severity)).toEqual([
      'block',
      'warn',
    ]);
  });

  it('records a gate that a branch opens or closes', () => {
    const gate = {
      target: 'api' as const,
      passed: true,
      scopeRefs: [],
      errors: [],
      limitations: [],
    };
    const reportWith = (needsDecision: boolean): SensorReport =>
      buildSensorReport({
        keyData: {
          keyDataCount: 1,
          needsDecision: needsDecision
            ? [{ path: 'request.payment#expired_at' }]
            : [],
        },
        stageGate: gate,
      });
    const closed = reportWith(true);
    const open = reportWith(false);

    expect(compareSensorReports(closed, open).gateImproved).toBe(true);
    expect(compareSensorReports(open, closed).gateRegressed).toBe(true);
    expect(compareSensorReports(closed, open).target).toEqual(
      expect.objectContaining({ decisionOwedCount: 0, isStageGateReady: true }),
    );
  });
});
