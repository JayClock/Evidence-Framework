import type { SensorIssue } from '@evidence-poc/evidence-agent/browser';

/** The three severities the sensors emit. */
export type SensorSeverity = SensorIssue['severity'];

/**
 * The rows the problems panel shows.
 *
 * Filtering lives outside the component so the rule is stated once and can be
 * tested without a DOM: a severity tab shows exactly that severity, and `all`
 * shows the report's own order, which the sensors already sort by importance.
 */
export const filterIssues = (
  issues: readonly SensorIssue[],
  severity: SensorSeverity | 'all',
): readonly SensorIssue[] =>
  severity === 'all'
    ? issues
    : issues.filter((issue) => issue.severity === severity);
