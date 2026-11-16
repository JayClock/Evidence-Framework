// External observer only. No implementation imports this file or another SUT.
import assert from 'node:assert/strict';

export const cases = [
  {
    name: 'full-v2',
    mode: 'v2',
    fault: 'none',
    count: 121,
    green: true,
    strict: true,
  },
  {
    name: 'regression-v1',
    mode: 'v1',
    gate: 'regression',
    fault: 'none',
    count: 46,
    green: true,
    strict: true,
  },
  {
    name: 'dod-v1',
    mode: 'v1',
    gate: 'dod',
    fault: 'none',
    count: 75,
    unavailable: true,
  },
  {
    name: 'pending-v1',
    mode: 'v1',
    gate: 'dod',
    fault: 'none',
    count: 75,
    unavailable: true,
    allowPending: true,
  },
  {
    name: 'regression-v2',
    mode: 'v2',
    gate: 'regression',
    fault: 'none',
    count: 46,
    green: true,
    strict: true,
  },
  {
    name: 'dod-v2',
    mode: 'v2',
    gate: 'dod',
    fault: 'none',
    count: 75,
    green: true,
    strict: true,
  },
  ...['accept-derived', 'extra-field', 'clock', 'precision'].map((fault) => ({
    name: `fault-${fault}`,
    mode: 'v2',
    fault,
    count: 121,
    strict: true,
  })),
  {
    name: 'strict-drift-not-pending',
    mode: 'v2',
    gate: 'dod',
    fault: 'extra-field',
    count: 75,
    strict: true,
    allowPending: true,
  },
];

// A red exit alone is not success: require the intended, observed HTTP failure.
export function verifyResult(scenario, code, report) {
  assert.equal(
    code,
    scenario.green || (scenario.allowPending && !scenario.strict) ? 0 : 1,
    'CLI exit code',
  );
  assert.equal(report.passed, Boolean(scenario.green), 'reported passed');
  assert.equal(
    report.pending === true,
    Boolean(scenario.allowPending && !scenario.strict),
    'reported pending',
  );
  assert.equal(report.suites?.length, 1, 'one executed suite');
  const steps = report.suites[0].steps;
  assert.equal(steps.length, scenario.count, 'selected step count');
  assert(
    steps.some((step) => !step.skipped && step.status > 0),
    'real HTTP must execute',
  );
  assert(
    !steps.some((step) => step.errored),
    'execution errors cannot count as expected red',
  );
  assert(
    steps.every(
      (step) => step.skipped || (step.status > 0 && step.status < 500),
    ),
    'missing responses or unexpected server errors cannot count as expected red',
  );
  if (scenario.gate) {
    assert.equal(report.gate, scenario.gate);
    assert.equal(
      report.suites[0].selectedFlowCount,
      scenario.gate === 'regression' ? 2 : 3,
    );
    assert(
      steps.every((step) =>
        step.flow.startsWith(
          scenario.gate === 'regression' ? 'single-' : 'milestone-',
        ),
      ),
    );
  }
  if (scenario.green) {
    assert(
      steps.every((step) => step.passed && !step.skipped),
      'all selected steps must run and pass',
    );
    return;
  }
  const failed = steps.filter((step) => !step.passed && !step.skipped);
  if (scenario.unavailable) {
    assert(
      failed.some(
        (step) => step.status === 404 && step.url.includes('first-milestone'),
      ),
      'v1 must reject the new milestone route',
    );
    assert(
      steps.some((step) => step.skipped),
      'dependent steps should skip',
    );
  } else if (scenario.fault === 'accept-derived') {
    assert(
      failed.some(
        (step) =>
          step.status === 201 &&
          step.expectedStatus === 422 &&
          step.url.includes('/confirmation') &&
          step.url.includes('release'),
      ),
      'caller-supplied payout must be wrongly accepted',
    );
  } else if (scenario.fault === 'extra-field') {
    assert(
      failed.some((step) =>
        step.driftIssues?.some(
          (issue) =>
            issue.type === 'extraneous_field' && issue.path === '/unmodeled',
        ),
      ),
      'strict drift must detect the injected property',
    );
  } else {
    const field =
      scenario.fault === 'clock' ? 'signed_at' : 'tier1_unit_price_minor';
    assert(
      failed.some(
        (step) =>
          step.status === 201 &&
          (scenario.fault !== 'precision' ||
            step.flow === 'milestone-precision') &&
          step.assertions.some((a) => !a.passed && a.path.includes(field)),
      ),
      `expected ${field} value mismatch`,
    );
  }
}
