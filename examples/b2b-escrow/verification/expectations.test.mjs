import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cases, verifyResult } from './expectations.mjs';

function example(scenario) {
  const flow =
    scenario.gate === 'regression' ? 'single-on-time' : 'milestone-precision';
  const step = {
    flow,
    url: 'http://127.0.0.1:1234/procurement/agreement',
    status: 201,
    passed: true,
    skipped: false,
    assertions: [],
  };
  const report = {
    passed: Boolean(scenario.green),
    pending: Boolean(scenario.allowPending && !scenario.strict),
    gate: scenario.gate,
    suites: [
      {
        selectedFlowCount: scenario.gate === 'regression' ? 2 : 3,
        steps: Array.from({ length: scenario.count }, () =>
          structuredClone(step),
        ),
      },
    ],
  };
  const first = report.suites[0].steps[0];
  if (!scenario.green) {
    first.passed = false;
    if (scenario.unavailable) {
      first.status = 404;
      first.url += '/first-milestone';
      report.suites[0].steps[1].skipped = true;
    } else if (scenario.fault === 'accept-derived') {
      first.url += '/release/request/r/confirmation';
      first.expectedStatus = 422;
    } else if (scenario.fault === 'extra-field') {
      first.driftIssues = [{ type: 'extraneous_field', path: '/unmodeled' }];
    } else {
      first.assertions = [
        {
          passed: false,
          path:
            scenario.fault === 'clock'
              ? 'jsonpath.signed_at'
              : 'jsonpath.tier1_unit_price_minor',
        },
      ];
    }
  }
  return report;
}

for (const scenario of cases) {
  test(`checks intended evidence for ${scenario.name}, not just an exit code`, () => {
    const code =
      scenario.green || (scenario.allowPending && !scenario.strict) ? 0 : 1;
    const report = example(scenario);
    verifyResult(scenario, code, report);
    assert.throws(() => verifyResult(scenario, 2, report));
    for (const mutate of [
      (r) => {
        r.suites[0].steps = [];
      },
      (r) => {
        r.suites[0].steps.forEach((s) => {
          s.skipped = true;
        });
      },
      (r) => {
        r.suites[0].steps[0].errored = true;
      },
      (r) => {
        r.suites[0].steps[2].status = 500;
      },
      (r) => {
        delete r.suites[0].steps[2].status;
      },
      (r) => {
        r.passed = !r.passed;
      },
      (r) => {
        r.pending = !r.pending;
      },
    ]) {
      const invalid = structuredClone(report);
      mutate(invalid);
      assert.throws(() => verifyResult(scenario, code, invalid));
    }
    if (!scenario.green) {
      const invalid = structuredClone(report);
      Object.assign(invalid.suites[0].steps[0], {
        status: 500,
        url: '/unrelated',
        assertions: [],
        driftIssues: [],
      });
      assert.throws(
        () => verifyResult(scenario, code, invalid),
        'unrelated server failure is not the expected red',
      );
    }
    if (scenario.gate) {
      const invalid = structuredClone(report);
      invalid.suites[0].steps[0].flow = 'unrelated';
      assert.throws(() => verifyResult(scenario, code, invalid));
    }
  });
}
