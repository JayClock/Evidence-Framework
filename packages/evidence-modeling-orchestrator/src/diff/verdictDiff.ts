import type { SensorIssue, SensorReport } from '../sensors/sensorReport.js';

/** The counters one verdict contributes to a comparison. */
export interface VerdictSnapshot {
  timestamp: string;
  passed: boolean;
  blockCount: number;
  warnCount: number;
  infoCount: number;
  decisionOwedCount: number;
  isStageGateReady: boolean;
}

/**
 * Difference between the verdicts of two branches.
 *
 * Findings are compared by `issueId`, which folds source, code and message
 * together: a renamed message is a new finding, exactly as the status bar would
 * show it after a rerun.
 */
export interface VerdictDiff {
  /** False until both sides have run their sensors at least once. */
  comparable: boolean;
  base: VerdictSnapshot | null;
  target: VerdictSnapshot | null;
  /** Issue ids that only the base branch reports. */
  fixedIssues: readonly SensorIssue[];
  /** Issue ids that only the target branch reports. */
  introducedIssues: readonly SensorIssue[];
  /** Findings both branches still share. */
  sharedIssueCount: number;
  /** True when the target branch is closer to the stage gate than the base. */
  gateImproved: boolean;
  gateRegressed: boolean;
}

const snapshotOf = (report: SensorReport): VerdictSnapshot => ({
  timestamp: report.timestamp,
  passed: report.passed,
  blockCount: report.blockCount,
  warnCount: report.warnCount,
  infoCount: report.infoCount,
  decisionOwedCount: report.keyDataSummary.decisionOwedCount,
  isStageGateReady: report.isStageGateReady,
});

/** Blocking findings first, then warnings, then information. */
const severityRank = (issue: SensorIssue): number =>
  issue.severity === 'block' ? 0 : issue.severity === 'warn' ? 1 : 2;

const sortIssues = (issues: readonly SensorIssue[]): readonly SensorIssue[] =>
  [...issues].sort(
    (left, right) =>
      severityRank(left) - severityRank(right) ||
      left.issueId.localeCompare(right.issueId),
  );

/**
 * Compares two sensor verdicts so a decision maker can see what a branch costs.
 *
 * A missing side is not treated as an empty verdict: before a branch has run its
 * sensors, the honest answer is "not comparable", not "everything is new".
 */
export const compareSensorReports = (
  base: SensorReport | null,
  target: SensorReport | null,
): VerdictDiff => {
  if (base === null || target === null) {
    return {
      comparable: false,
      base: base === null ? null : snapshotOf(base),
      target: target === null ? null : snapshotOf(target),
      fixedIssues: [],
      introducedIssues: [],
      sharedIssueCount: 0,
      gateImproved: false,
      gateRegressed: false,
    };
  }

  const baseIds = new Set(base.issues.map((issue) => issue.issueId));
  const targetIds = new Set(target.issues.map((issue) => issue.issueId));
  const fixedIssues = base.issues.filter((issue) => !targetIds.has(issue.issueId));
  const introducedIssues = target.issues.filter(
    (issue) => !baseIds.has(issue.issueId),
  );
  const baseSnapshot = snapshotOf(base);
  const targetSnapshot = snapshotOf(target);

  return {
    comparable: true,
    base: baseSnapshot,
    target: targetSnapshot,
    fixedIssues: sortIssues(fixedIssues),
    introducedIssues: sortIssues(introducedIssues),
    sharedIssueCount: base.issues.length - fixedIssues.length,
    gateImproved:
      targetSnapshot.isStageGateReady && !baseSnapshot.isStageGateReady,
    gateRegressed:
      baseSnapshot.isStageGateReady && !targetSnapshot.isStageGateReady,
  };
};
