import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  MISSING_INTERPRETER_EXIT,
  USAGE_EXIT,
  main,
  meetsMinimum,
  parseArguments,
  parseVersion,
  probeInterpreter,
  selectInterpreter,
} from './python.mjs';

const SELF = fileURLToPath(new URL('./python.mjs', import.meta.url));

// Collect written text without requiring a real stream.
function sink() {
  const chunks = [];
  return { chunks, write: (value) => chunks.push(String(value)) };
}

// Interpreter lookup is injected so these checks never depend on the machine.
function fakeSpawn(table) {
  return (command, args) => {
    const entry = table[command];
    if (!entry) {
      return {
        error: new Error(`spawn ${command} ENOENT`),
        status: null,
        stdout: '',
        stderr: '',
      };
    }
    if (args[0] !== '-c') return { status: entry.exitCode ?? 0 };
    const requested = args.slice(2);
    const missing = requested.filter(
      (name) => !(entry.modules ?? []).includes(name),
    );
    return { status: 0, stdout: `${entry.version}\n${missing.join(',')}\n` };
  };
}

test('parses versions and enforces the declared minimum', () => {
  assert.deepEqual(parseVersion('3.12.3\n'), [3, 12]);
  assert.deepEqual(parseVersion('4.0'), [4, 0]);
  assert.equal(parseVersion('not-a-version'), null);
  assert.equal(parseVersion(undefined), null);
  assert.equal(meetsMinimum([3, 9]), false);
  assert.equal(meetsMinimum([3, 10]), true);
  assert.equal(meetsMinimum([3, 13]), true);
  assert.equal(meetsMinimum([4, 0]), true);
  assert.equal(meetsMinimum(null), false);
});

test('skips missing, outdated and dependency-less candidates in order', () => {
  const spawn = fakeSpawn({
    'python3.13': undefined,
    'python3.12': { version: '3.12.3', modules: ['jsonschema', 'celpy'] },
    'python3.11': { version: '3.11.9', modules: ['jsonschema', 'celpy'] },
    python3: { version: '3.9.6', modules: [] },
  });
  const selection = selectInterpreter({
    candidates: ['python3.13', 'python3.12', 'python3.11', 'python3', 'python'],
    modules: ['jsonschema', 'celpy'],
    env: {},
    spawn,
  });
  assert.equal(selection.status, 'ok');
  assert.equal(selection.interpreter, 'python3.12');
  assert.deepEqual(selection.version, [3, 12]);
});

test('keeps searching when the newest interpreter lacks declared modules', () => {
  const spawn = fakeSpawn({
    'python3.12': { version: '3.12.3', modules: [] },
    'python3.11': {
      version: '3.11.9',
      modules: ['jsonschema', 'celpy', 'yaml'],
    },
  });
  const selection = selectInterpreter({
    candidates: ['python3.12', 'python3.11', 'python3'],
    modules: ['jsonschema', 'celpy', 'yaml'],
    env: {},
    spawn,
  });
  assert.equal(selection.status, 'ok');
  assert.equal(selection.interpreter, 'python3.11');
});

test('reports candidates, modules and install advice when nothing matches', () => {
  const spawn = fakeSpawn({
    'python3.12': { version: '3.12.3', modules: ['jsonschema'] },
    'python3.10': { version: '3.10.13', modules: [] },
    python3: { version: '3.9.6', modules: [] },
  });
  const selection = selectInterpreter({
    candidates: ['python3.12', 'python3.10', 'python3'],
    modules: ['jsonschema', 'celpy'],
    env: {},
    spawn,
  });
  assert.equal(selection.status, 'error');
  assert.match(selection.message, /Py ?thon 3\.10\+/i);
  assert.match(selection.message, /python3\.12：缺少 celpy/);
  assert.match(selection.message, /python3\.10：缺少 jsonschema、celpy/);
  assert.match(selection.message, /python3：版本 3\.9 低于/);
  assert.match(selection.message, /pip install -r/);
  assert.match(selection.message, /PYTHON=\/absolute\/path/);
});

test('treats PYTHON as an explicit override without falling back', () => {
  const spawn = fakeSpawn({
    '/opt/custom/python': { version: '3.12.1', modules: ['jsonschema'] },
    'python3.12': { version: '3.12.3', modules: ['jsonschema'] },
  });
  const selected = selectInterpreter({
    candidates: ['python3.12'],
    modules: ['jsonschema'],
    env: { PYTHON: '/opt/custom/python' },
    spawn,
  });
  assert.equal(selected.interpreter, '/opt/custom/python');
  const rejected = selectInterpreter({
    candidates: ['python3.12'],
    modules: ['jsonschema'],
    env: { PYTHON: '/opt/custom/python', CELPY_MISSING: '1' },
    spawn: fakeSpawn({
      '/opt/custom/python': { version: '3.12.1', modules: [] },
      'python3.12': { version: '3.12.3', modules: ['jsonschema'] },
    }),
  });
  assert.equal(rejected.status, 'error');
  assert.match(rejected.message, /PYTHON=\/opt\/custom\/python/);
  assert.match(rejected.message, /不回退/);
});

test('splits wrapper flags from forwarded python arguments', () => {
  assert.deepEqual(parseArguments(['-B', '-m', 'unittest']), {
    print: false,
    modules: [],
    passthrough: ['-B', '-m', 'unittest'],
  });
  assert.deepEqual(parseArguments(['--require', 'a,b', '--print']), {
    print: true,
    modules: ['a', 'b'],
    passthrough: [],
  });
  assert.deepEqual(parseArguments(['--require=a, b', 'script.py']), {
    print: false,
    modules: ['a', 'b'],
    passthrough: ['script.py'],
  });
  assert.deepEqual(parseArguments(['--', '--print', 'script.py']), {
    print: false,
    modules: [],
    passthrough: ['--print', 'script.py'],
  });
});

test('main forwards to the selected interpreter and preserves its exit code', () => {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    if (args[0] === '-c') {
      return { status: 0, stdout: '3.12.3\n\n' };
    }
    return { status: 7 };
  };
  const exitCode = main(['-B', 'script.py'], {
    spawn,
    env: {},
    stdout: sink(),
    stderr: sink(),
  });
  assert.equal(exitCode, 7);
  assert.deepEqual(calls.at(-1), {
    command: 'python3.13',
    args: ['-B', 'script.py'],
    options: { stdio: 'inherit' },
  });
});

test('main refuses to run without a forwarded command', () => {
  const errors = sink();
  const exitCode = main([], {
    spawn: fakeSpawn({ 'python3.13': { version: '3.12.3', modules: [] } }),
    env: {},
    stdout: sink(),
    stderr: errors,
  });
  assert.equal(exitCode, USAGE_EXIT);
  assert.match(errors.chunks.join(''), /用法：node tools\/python\/python\.mjs/);
});

test('probeInterpreter reports missing modules from the real probe contract', () => {
  const probe = probeInterpreter(
    'python3.12',
    ['jsonschema'],
    fakeSpawn({ 'python3.12': { version: '3.12.3', modules: [] } }),
  );
  assert.deepEqual(probe, {
    candidate: 'python3.12',
    version: [3, 12],
    meetsVersion: true,
    missing: ['jsonschema'],
    ok: false,
  });
});

test('the real wrapper resolves python 3.10+ or fails with advice', () => {
  const result = spawnSync(process.execPath, [SELF, '--print'], {
    encoding: 'utf8',
  });
  if (result.status === MISSING_INTERPRETER_EXIT) {
    // No compliant interpreter on this machine: the message must stay
    // actionable instead of silently using an unsupported python.
    assert.match(result.stderr, /PYTHON=/);
    assert.match(result.stderr, /3\.10\+/);
    return;
  }
  assert.equal(result.status, 0, result.stderr);
  const interpreter = result.stdout.trim();
  const version = spawnSync(
    interpreter,
    ['-c', "import sys;print('%d.%d' % sys.version_info[:2])"],
    { encoding: 'utf8' },
  );
  assert.equal(version.status, 0, version.stderr);
  assert.equal(meetsMinimum(parseVersion(version.stdout)), true);
});
