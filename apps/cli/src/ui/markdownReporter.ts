import type { AcceptanceReport } from './trafficLightReporter.js';
const xml = (value: unknown): string =>
  Array.from(String(value ?? ''))
    .filter(
      (char) => char.charCodeAt(0) >= 32 || ['\t', '\n', '\r'].includes(char),
    )
    .join('')
    .replace(
      /[<>&"']/g,
      (char) =>
        ({
          '<': '&lt;',
          '>': '&gt;',
          '&': '&amp;',
          '"': '&quot;',
          "'": '&apos;',
        })[char]!,
    );
const md = (value: unknown): string =>
  xml(value)
    .replace(/\|/g, '&#124;')
    .replace(/[\r\n]/g, ' ');

export function markdownReport(report: AcceptanceReport): string {
  const steps = report.suites.flatMap((suite) => suite.steps);
  const passed = steps.filter((step) => step.passed).length;
  return [
    `## Evidence ${report.gate ?? 'acceptance'} gate`,
    `**${report.passed ? 'PASSED' : report.pending ? 'PENDING — WIP, not release-ready' : 'FAILED'}** — ${passed}/${steps.length} steps passed`,
    '',
    '| Flow / Step | Result | HTTP | Drift |',
    '| --- | --- | --- | --- |',
    ...steps.map(
      (step) =>
        `| ${md(step.flow)} / ${md(step.name)} | ${step.passed ? 'PASS' : step.skipped ? 'SKIPPED' : report.pending ? 'PENDING' : 'FAIL'} | ${md(step.method)} ${step.status ?? '-'} | ${(step.driftIssues ?? []).map((issue) => md(`${issue.type} ${issue.path}: ${issue.message}`)).join('<br>')} |`,
    ),
    '',
    ...steps
      .filter((step) => !step.passed)
      .map(
        (step) =>
          `- [ ] ${md(step.flow)} / ${md(step.name)}${step.failureDetails ? `: ${md(step.failureDetails)}` : ''}`,
      ),
    ...report.suites.flatMap((suite) =>
      suite.emptyReason ? [md(suite.emptyReason)] : [],
    ),
  ].join('\n');
}

/** JUnit retains failures even when an explicit WIP policy permits exit zero. */
export function junitReport(report: AcceptanceReport): string {
  const steps = report.suites.flatMap((suite) => suite.steps);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites tests="${steps.length}" failures="${steps.filter((step) => !step.passed && !step.skipped).length}" skipped="${steps.filter((step) => step.skipped).length}" time="${report.totalDurationMs / 1000}">`,
    ...report.suites.map(
      (suite) =>
        `<testsuite name="${xml(suite.suitePath)}" tests="${suite.steps.length}" failures="${suite.steps.filter((step) => !step.passed && !step.skipped).length}" skipped="${suite.steps.filter((step) => step.skipped).length}">${suite.steps
          .map((step) => {
            const details = JSON.stringify({
              assertions: step.assertions.filter((check) => !check.passed),
              drift: step.driftIssues,
              error: step.failureDetails,
            });
            return `<testcase classname="${xml(step.flow)}" name="${xml(step.name)}" time="${step.durationMs / 1000}">${step.skipped ? '<skipped/>' : step.passed ? '' : `<failure message="Acceptance failed">${xml(details)}</failure>`}${step.driftIssues?.length ? `<system-out>${xml(JSON.stringify(step.driftIssues))}</system-out>` : ''}</testcase>`;
          })
          .join('')}</testsuite>`,
    ),
    '</testsuites>',
  ].join('\n');
}
