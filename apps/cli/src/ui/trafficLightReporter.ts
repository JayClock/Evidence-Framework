import type {
  AcceptanceRunReport,
  StepExecutionResult,
} from '@evidence-poc/evidence-acceptance/runner';

export interface AcceptanceReport {
  readonly passed: boolean;
  readonly targetUrl: string;
  readonly asOf?: string;
  readonly totalDurationMs: number;
  readonly suites: readonly AcceptanceRunReport[];
  readonly gate?: 'regression' | 'dod';
  /** WIP is explicit and never changes passed:false into a green test. */
  readonly pending?: boolean;
}
const display = (value: unknown): string =>
  JSON.stringify(value) ?? 'undefined';

export function trafficLightReport(
  report: AcceptanceReport,
  options: { color: boolean; verbose: boolean },
): string {
  const paint = (code: number, value: string) =>
    options.color ? `\u001b[${code}m${value}\u001b[0m` : value;
  const lines = [
    'Evidence Acceptance Test Runner',
    `Target: ${report.targetUrl}`,
    ...(report.gate
      ? [
          `Gate: ${report.gate} (${report.pending ? 'WIP; not release-ready' : 'strict'})`,
        ]
      : []),
    ...(report.asOf
      ? [
          `Logical Clock: ${report.asOf} (request override; compiled assertions unchanged)`,
        ]
      : []),
  ];
  const all: StepExecutionResult[] = [];
  let flowPassed = 0,
    flowFailed = 0;
  for (const suite of report.suites) {
    lines.push(`Suite: ${suite.suitePath}`);
    if (suite.emptyReason) lines.push(`  ${suite.emptyReason}`);
    const flows = new Map<string, StepExecutionResult[]>();
    for (const step of suite.steps) {
      all.push(step);
      const steps = flows.get(step.flow) ?? [];
      steps.push(step);
      flows.set(step.flow, steps);
    }
    for (const [flow, steps] of flows) {
      if (steps.every((step) => step.passed)) flowPassed++;
      else flowFailed++;
      lines.push(`  Flow: ${flow}`);
      for (const step of steps) {
        const symbol = step.skipped
          ? paint(33, '↳')
          : step.passed
            ? paint(32, '✓')
            : paint(31, '✗');
        lines.push(
          `    ${symbol} [${step.method || 'HTTP'} ${step.status ?? '-'}] ${step.url || step.name} (${step.durationMs}ms)${step.skipped ? ' SKIPPED' : ''}`,
        );
        for (const issue of step.driftIssues ?? [])
          lines.push(
            paint(
              33,
              `        ↳ DRIFT: ${issue.type} ${issue.path || '/'}: ${issue.message}`,
            ),
          );
        if (!step.passed && report.pending)
          lines.push(paint(33, '        [PENDING (DoD)]'));
        if (step.failureDetails) lines.push(`        ${step.failureDetails}`);
        for (const check of step.assertions) {
          if (check.passed && !options.verbose) continue;
          lines.push(
            `        ↳ Assert: ${check.path} == ${display(check.expected)} [${check.passed ? 'OK' : 'FAILED'}]`,
          );
          if (!check.passed)
            lines.push(
              `            Expected: ${display(check.expected)}`,
              `            Received: ${display(check.actual)}`,
            );
        }
      }
    }
  }
  const passed = all.filter((step) => step.passed).length;
  const skipped = all.filter((step) => step.skipped).length;
  lines.push(
    '',
    'Test Summary:',
    `  Status:   ${report.passed ? paint(32, 'PASSED (Green)') : report.pending ? paint(33, 'PENDING (DoD WIP; not passed)') : paint(31, 'FAILED (Red)')}`,
    ...(report.gate === 'dod'
      ? [
          `  Completion: ${all.length ? Math.floor((100 * passed) / all.length) : 100}% (${passed}/${all.length} steps passed)`,
        ]
      : []),
    `  Flows:    ${flowPassed} passed, ${flowFailed} failed, ${flowPassed + flowFailed} total`,
    `  Steps:    ${passed} passed, ${all.length - passed - skipped} failed, ${skipped} skipped, ${all.length} total`,
    `  Duration: ${report.totalDurationMs}ms`,
  );
  return lines.join('\n');
}
