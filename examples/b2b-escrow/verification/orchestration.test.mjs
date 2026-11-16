import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
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

for (const implementation of [
  'golang-gin',
  'java-spring',
  'python-fastapi',
  'ts-fastify',
]) {
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
