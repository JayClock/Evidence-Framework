// Policy gates use the supplied Git baseline, not the demo's frozen flow counts.
import assert from 'node:assert/strict';
import { cases } from './expectations.mjs';

export function selectScenarios({ gate, baselineModel }) {
  if (gate === undefined && baselineModel === undefined) return cases;
  if (!['regression', 'dod'].includes(gate) || !baselineModel)
    throw new Error(
      '--gate regression|dod requires --baseline-model FILE (and vice versa)',
    );
  return [{ name: gate, gate, mode: 'v2', fault: 'none', strict: true }];
}

export function verifyGateResult(gate, code, report) {
  assert.equal(code, 0, 'strict policy gate exit code');
  assert.equal(report.passed, true, 'policy gate must pass');
  assert.notEqual(
    report.pending,
    true,
    'pending is forbidden for policy gates',
  );
  assert.equal(report.gate, gate);
  assert.equal(report.suites?.length, 1, 'one suite required');
  const suite = report.suites[0];
  assert.equal(suite.gate, gate);
  assert.equal(suite.passed, true);
  if (suite.selectedFlowCount === 0) {
    assert.equal(gate, 'dod', 'regression must not be empty');
    assert.equal(
      suite.emptyReason,
      'No incremental flows; baseline and current acceptance requirements are identical.',
    );
    assert.deepEqual(suite.steps, []);
    return; // Explicit no-increment result, not an executed green suite.
  }
  assert(
    suite.selectedFlowCount > 0 && suite.steps.length > 0,
    'nonempty selection',
  );
  assert(
    suite.steps.every(
      (step) =>
        step.passed &&
        !step.skipped &&
        !step.errored &&
        step.status > 0 &&
        step.status < 500,
    ),
    'all selected HTTP steps must execute and pass',
  );
}
