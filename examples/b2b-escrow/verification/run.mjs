#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { cases, verifyResult } from './expectations.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const cli = path.join(repo, 'apps/cli/dist/cli.js');
const baseline = path.join(root, 'model/b2b-escrow-v1.evidence.json');
const current = path.join(root, 'model/b2b-escrow.evidence.json');
const generated = path.join(root, 'generated');
const implementations = [
  'golang-gin',
  'java-spring',
  'python-fastapi',
  'ts-fastify',
];

function command(implementation) {
  switch (implementation) {
    case 'golang-gin':
      return [
        process.platform === 'win32' ? './build/escrow.exe' : './build/escrow',
        [],
      ];
    case 'java-spring':
      return [
        process.env.JAVA_HOME
          ? path.join(process.env.JAVA_HOME, 'bin/java')
          : 'java',
        ['-jar', 'target/escrow-0.1.0.jar'],
      ];
    case 'python-fastapi':
      return [
        process.platform === 'win32'
          ? '.venv/Scripts/python.exe'
          : '.venv/bin/python',
        ['-m', 'app.main'],
      ];
    case 'ts-fastify':
      return [process.execPath, ['dist/server.js']];
    default:
      throw new Error(`Unknown implementation: ${implementation}`);
  }
}

async function stop(run) {
  const { child } = run;
  if (child.exitCode === null && child.signalCode === null)
    child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    // The listener is installed at launch, so early exits cannot lose the close
    // event; wait for stdio to drain as well as for the process to exit.
    await run.closed;
  } finally {
    clearTimeout(timer);
  }
}

// Never invoke a shell, download a toolchain, or reuse another case's ledger.
function launch(executable, args, cwd) {
  const env = { ...process.env, NO_COLOR: '1' };
  delete env.FORCE_COLOR;
  const child = spawn(executable, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
  let stdout = '',
    stderr = '',
    failure;
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.on('error', (error) => {
    failure = error;
  });
  const closed = new Promise((resolve) =>
    child.on('close', (code, signal) => resolve({ code, signal })),
  );
  return {
    child,
    closed,
    output: () => ({ stdout, stderr }),
    failure: () => failure,
  };
}

async function ready(server) {
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    if (server.failure()) throw server.failure();
    if (server.child.exitCode !== null || server.child.signalCode !== null)
      throw new Error('SUT exited before readiness');
    for (const line of server.output().stdout.split('\n')) {
      let host;
      try {
        host = JSON.parse(line).host;
      } catch {
        continue;
      }
      if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(host)) continue;
      try {
        const response = await fetch(host, {
          method: 'HEAD',
          redirect: 'error',
          signal: AbortSignal.timeout(500),
        });
        await response.body?.cancel();
        return host; // Any HTTP status proves a live transport, not business success.
      } catch {
        /* Server may announce its bound socket just before serving. */
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('SUT readiness timed out');
}

async function invoke(args, directory, active) {
  const run = launch(process.execPath, [cli, ...args], repo);
  active.add(run);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void stop(run);
  }, 60000);
  try {
    const result = await run.closed;
    const output = run.output();
    await writeFile(path.join(directory, 'cli.stdout.log'), output.stdout);
    await writeFile(path.join(directory, 'cli.stderr.log'), output.stderr);
    if (run.failure()) throw run.failure();
    if (timedOut || result.signal)
      throw new Error(
        `CLI did not complete: ${timedOut ? 'timeout' : result.signal}`,
      );
    return { ...result, ...output };
  } finally {
    clearTimeout(timer);
    await stop(run);
    active.delete(run);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      implementation: { type: 'string' },
      'report-dir': { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(
      'node examples/b2b-escrow/verification/run.mjs --implementation golang-gin|java-spring|python-fastapi|ts-fastify|all [--report-dir NEW_DIRECTORY]',
    );
    return;
  }
  if (
    !implementations.includes(values.implementation) &&
    values.implementation !== 'all'
  )
    throw new Error('Select --implementation (or --help)');
  // A new directory avoids erasing evidence from an earlier run or arbitrary files.
  const output = values['report-dir']
    ? path.resolve(values['report-dir'])
    : await mkdtemp(path.join(tmpdir(), 'escrow-conformance-'));
  if (values['report-dir']) await mkdir(output);
  console.log(`Reports: ${output}`);
  const active = new Set();
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    for (const run of active) void stop(run);
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  const results = [];
  const selected =
    values.implementation === 'all' ? implementations : [values.implementation];
  try {
    const preflight = path.join(output, 'export-verify');
    await mkdir(preflight);
    const verified = await invoke(
      ['export', '--model', current, '--out', generated, '--verify'],
      preflight,
      active,
    );
    if (verified.code !== 0)
      throw new Error(
        `Build CLI and refresh generated artifacts first; see ${preflight}`,
      );
    for (const implementation of selected) {
      for (const scenario of cases) {
        if (interrupted) throw new Error('Interrupted');
        const directory = path.join(output, implementation, scenario.name);
        await mkdir(directory, { recursive: true });
        const [executable, prefix] = command(implementation);
        const server = launch(
          executable,
          [
            ...prefix,
            '--test-mode',
            '--port',
            '0',
            '--mode',
            scenario.mode,
            '--fault',
            scenario.fault,
          ],
          path.join(root, 'implementations', implementation),
        );
        active.add(server);
        const result = {
          implementation,
          scenario: scenario.name,
          expectationMet: false,
        };
        try {
          const host = await ready(server);
          if (interrupted) throw new Error('Interrupted');
          const args = [
            'test',
            '--target',
            host,
            '--scenarios',
            generated,
            '--json',
            '--report-dir',
            directory,
          ];
          if (scenario.gate)
            args.push('--baseline-model', baseline, '--gate', scenario.gate);
          if (scenario.strict) args.push('--strict-drift');
          if (scenario.allowPending) args.push('--allow-pending');
          const run = await invoke(args, directory, active);
          result.cliExitCode = run.code;
          const report = JSON.parse(run.stdout);
          verifyResult(scenario, run.code, report);
          result.expectationMet = true;
          result.passed = report.passed;
          result.pending = report.pending === true;
        } catch (error) {
          result.error = error.stack ?? String(error);
          await writeFile(
            path.join(directory, 'verification-error.log'),
            result.error,
          );
        } finally {
          await stop(server);
          active.delete(server);
          const logs = server.output();
          await writeFile(
            path.join(directory, 'backend.stdout.log'),
            logs.stdout,
          );
          await writeFile(
            path.join(directory, 'backend.stderr.log'),
            logs.stderr,
          );
        }
        results.push(result);
        console.log(
          `${result.expectationMet ? 'OK' : 'FAIL'} ${implementation}/${scenario.name}`,
        );
      }
    }
  } finally {
    await Promise.all([...active].map(stop));
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    await writeFile(
      path.join(output, 'summary.json'),
      JSON.stringify(
        {
          passed:
            !interrupted &&
            results.length === selected.length * cases.length &&
            results.every((result) => result.expectationMet),
          results,
        },
        null,
        2,
      ) + '\n',
    );
  }
  if (interrupted || results.some((result) => !result.expectationMet))
    process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
