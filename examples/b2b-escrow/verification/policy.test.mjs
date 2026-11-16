import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { cases } from './expectations.mjs';
import { selectScenarios, verifyGateResult } from './policy.mjs';

const run = new URL('./run.mjs', import.meta.url);

test('demo and Git-baseline policy gates are separate, strict selections', () => {
  assert.equal(selectScenarios({}), cases);
  for (const gate of ['regression', 'dod']) {
    assert.deepEqual(
      selectScenarios({ gate, baselineModel: 'baseline.json' }),
      [{ name: gate, gate, mode: 'v2', fault: 'none', strict: true }],
    );
  }
  for (const input of [
    { gate: 'regression' },
    { baselineModel: 'baseline.json' },
    { gate: 'unknown', baselineModel: 'baseline.json' },
    { gate: 'dod', baselineModel: '' },
  ])
    assert.throws(() => selectScenarios(input));
});

function green(gate) {
  return {
    gate,
    passed: true,
    suites: [
      {
        gate,
        passed: true,
        selectedFlowCount: 1,
        steps: [{ passed: true, status: 201 }],
      },
    ],
  };
}

for (const gate of ['regression', 'dod']) {
  test(`${gate}: only genuine strict success is accepted, without frozen counts`, () => {
    const report = green(gate);
    verifyGateResult(gate, 0, report);
    assert.throws(() => verifyGateResult(gate, 1, report));
    for (const mutate of [
      (r) => {
        r.passed = false;
      },
      (r) => {
        r.pending = true;
      },
      (r) => {
        r.gate = 'other';
      },
      (r) => {
        r.suites = [];
      },
      (r) => {
        r.suites[0].gate = 'other';
      },
      (r) => {
        r.suites[0].passed = false;
      },
      (r) => {
        r.suites[0].selectedFlowCount = 0;
      },
      (r) => {
        r.suites[0].steps = [];
      },
      ...['skipped', 'errored'].map((field) => (r) => {
        r.suites[0].steps[0][field] = true;
      }),
      (r) => {
        r.suites[0].steps[0].passed = false;
      },
      ...[undefined, 0, 500].map((status) => (r) => {
        r.suites[0].steps[0].status = status;
      }),
    ]) {
      const invalid = structuredClone(report);
      mutate(invalid);
      assert.throws(() => verifyGateResult(gate, 0, invalid));
    }
  });
}

test('only an explicitly unchanged DoD may succeed without executing HTTP', () => {
  const report = green('dod');
  Object.assign(report.suites[0], {
    selectedFlowCount: 0,
    steps: [],
    emptyReason:
      'No incremental flows; baseline and current acceptance requirements are identical.',
  });
  verifyGateResult('dod', 0, report);
  delete report.suites[0].emptyReason;
  assert.throws(() => verifyGateResult('dod', 0, report));
  const regression = green('regression');
  Object.assign(regression.suites[0], report.suites[0], { gate: 'regression' });
  assert.throws(() => verifyGateResult('regression', 0, regression));
});

test('CLI rejects incomplete gate options and policy bypasses before starting a SUT', () => {
  for (const args of [
    ['--gate', 'dod'],
    ['--baseline-model', 'baseline.json'],
    ['--gate', 'other', '--baseline-model', 'baseline.json'],
    ['--allow-pending'],
  ]) {
    const result = spawnSync(
      process.execPath,
      [run.pathname, '--implementation', 'ts-fastify', ...args],
      { encoding: 'utf8', timeout: 5000 },
    );
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
  }
});
