import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const implementations = [
  'golang-gin',
  'java-spring',
  'python-fastapi',
  'ts-fastify',
];

function make(...args) {
  return spawnSync('make', ['--no-print-directory', '-C', root, ...args], {
    cwd: tmpdir(),
    encoding: 'utf8',
    timeout: 10000,
  });
}

test('orchestration help is toolchain-free; invalid implementations fail closed', () => {
  const help = make('help');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /test-all/);
  const invalid = make('setup', 'IMPLEMENTATION=typo');
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Unknown IMPLEMENTATION/);
  for (const value of ['', 'golang-gin java-spring']) {
    const multiple = make('setup', `IMPLEMENTATION=${value}`);
    assert.notEqual(multiple.status, 0);
    assert.match(multiple.stderr, /Select exactly one IMPLEMENTATION/);
  }
});

for (const implementation of implementations) {
  test(`${implementation}: native orchestration references only the selected project from any cwd`, () => {
    const result = make(
      '-n',
      'prepare',
      'up',
      `IMPLEMENTATION=${implementation}`,
      'PORT=8123',
      'MODE=v1',
      'FAULT=extra-field',
    );
    assert.equal(result.status, 0, result.stderr);
    const paths = [...result.stdout.matchAll(/implementations\/([\w-]+)/g)].map(
      (match) => match[1],
    );
    assert(paths.length > 0);
    assert(paths.every((name) => name === implementation));
    assert.match(
      result.stdout,
      /--port "8123" --mode "v1" --fault "extra-field"/,
    );
    assert.doesNotMatch(result.stdout, /verification\/run|workspace:\*/);
  });
}

test('policy gate passes exact baseline and NEW report paths, not demo defaults', () => {
  const result = make(
    '-n',
    'gate',
    'IMPLEMENTATION=golang-gin',
    'GATE=dod',
    'BASELINE=/tmp/immutable baseline.evidence.json',
    'REPORT_DIR=/tmp/new reports',
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /--gate "dod" --baseline-model "\/tmp\/immutable baseline.evidence.json"/,
  );
  assert.match(result.stdout, /--report-dir "\/tmp\/new reports"/);
  assert.doesNotMatch(result.stdout, /allow-pending|install|api:setup/);
});

test('test-all runs conformance and both strict gates separately for every implementation', () => {
  const baseline = '/tmp/immutable baseline.evidence.json';
  const reports = '/tmp/new reports';
  const result = make(
    '-n',
    'test-all',
    `BASELINE=${baseline}`,
    `REPORT_DIR=${reports}`,
  );
  assert.equal(result.status, 0, result.stderr);
  const invocations = result.stdout
    .split('\n')
    .filter((line) => line.includes('/verification/run.mjs" --implementation'))
    .map((line) => line.slice(line.indexOf('--implementation')));
  assert.deepEqual(
    invocations,
    implementations.flatMap((implementation) => {
      const prefix = `--implementation "${implementation}"`;
      const report = (stage) =>
        `--report-dir "${reports}/${implementation}/${stage}"`;
      return [
        `${prefix} ${report('conformance')}`,
        ...['regression', 'dod'].map(
          (gate) =>
            `${prefix} --gate "${gate}" --baseline-model "${baseline}" ${report(gate)}`,
        ),
      ];
    }),
  );
});
