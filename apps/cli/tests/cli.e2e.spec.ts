import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unpackModelBundle } from '@evidence-poc/evidence-model-io';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const cli = path.join(repo, 'apps/cli/dist/cli.js');
const backend = path.join(
  repo,
  'examples/b2b-escrow/implementations/ts-fastify/dist/server.js',
);
let root: string, model: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'evidence-cli-e2e-'));
  model = path.join(root, 'procurement.evidence.json');
  writeFileSync(
    model,
    readFileSync(
      path.join(repo, 'examples/b2b-escrow/model/b2b-escrow.evidence.json'),
    ),
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function invoke(args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
      delete env.FORCE_COLOR;
      execFile(
        process.execPath,
        [cli, ...args],
        { cwd: root, env, timeout: 15000 },
        (error, stdout, stderr) => {
          resolve({
            code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
            stdout,
            stderr,
          });
        },
      );
    },
  );
}

async function withBackend(
  fault: string,
  action: (target: string) => Promise<void>,
) {
  const child = spawn(
    process.execPath,
    [backend, '--test-mode', '--port', '0', '--fault', fault],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stdout = '',
    stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  try {
    const target = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new Error(`Backend startup timeout: ${stdout}\n${stderr}`)),
        5000,
      );
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Backend exited ${code}: ${stderr}`));
      });
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
        if (!stdout.includes('\n')) return;
        clearTimeout(timer);
        try {
          resolve(
            (JSON.parse(stdout.split('\n')[0]!) as { host: string }).host,
          );
        } catch (error) {
          reject(error);
        }
      });
    });
    await action(target);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
}

describe('built evidence binary full lifecycle', () => {
  it('checks a source tree, exports both deliverables and passes real HTTP acceptance as JSON', async () => {
    const unpacked = await unpackModelBundle(
      model,
      path.join(root, '.evidence/fm'),
    );
    expect(unpacked.issues).toEqual([]);
    const check = await invoke(['check', '--json']);
    expect(check.code, check.stderr).toBe(0);
    expect(JSON.parse(check.stdout).valid).toBe(true);
    const exported = await invoke(['export']);
    expect(exported.code, exported.stderr).toBe(0);
    expect(exported.stdout).toContain('121 steps');
    await withBackend('none', async (target) => {
      const run = await invoke(['test', '--target', target, '--json']);
      expect(run.code, `${run.stdout}\n${run.stderr}`).toBe(0);
      expect(run.stderr).toBe('');
      const report = JSON.parse(run.stdout);
      expect(report.passed).toBe(true);
      expect(report.suites[0].steps).toHaveLength(121);
      expect(
        report.suites[0].steps.every(
          (step: { passed: boolean }) => step.passed,
        ),
      ).toBe(true);
    });
  }, 20000);

  it.each(['amount', 'clock', 'extra-field'])(
    'exits red for the independent %s fault',
    async (fault) => {
      const exported = await invoke([
        'export',
        '--model',
        model,
        '--out',
        'dist/tests',
      ]);
      expect(exported.code, exported.stderr).toBe(0);
      await withBackend(fault, async (target) => {
        const run = await invoke([
          'test',
          '--target',
          target,
          '--scenarios',
          'dist/tests',
          '--verbose',
        ]);
        expect(run.code).toBe(1);
        expect(run.stdout).toContain('FAILED (Red)');
        expect(run.stdout).not.toContain('\u001b');
        if (fault === 'amount') {
          expect(run.stdout).toContain('Expected: 1356225');
          expect(run.stdout).toContain('Received: 1356226');
        } else if (fault === 'clock') expect(run.stdout).toContain('signed_at');
        else expect(run.stdout).toContain('schema');
      });
    },
    20000,
  );

  it('compares compatible and breaking model evolution through oasdiff', async () => {
    const same = await invoke(['diff', 'api', model, model]);
    expect(same.code, same.stderr).toBe(0);
    expect(JSON.parse(same.stdout).hasBreakingChanges).toBe(false);
    const current = JSON.parse(readFileSync(model, 'utf8'));
    const confirmation = current.entities.find(
      (entity: { id: string }) => entity.id === 'confirmation.order',
    );
    confirmation.attributes.push({
      name: 'note',
      label: 'Note',
      meaning: 'Required caller note',
      valueType: 'string',
      required: true,
    });
    for (const example of confirmation.examples)
      example.value.note = 'required now';
    const target = path.join(root, 'new.evidence.json');
    writeFileSync(target, JSON.stringify(current));
    const broken = await invoke(['diff', 'api', model, target]);
    expect(broken.code, `${broken.stdout}\n${broken.stderr}`).toBe(1);
    expect(JSON.parse(broken.stdout).hasBreakingChanges).toBe(true);
    const markdown = await invoke([
      'diff',
      'api',
      model,
      target,
      '--format',
      'markdown',
    ]);
    expect(markdown.code).toBe(1);
    expect(markdown.stdout).toContain('note');
  }, 20000);

  it('reports invalid paths and parameters without false greens or broken JSON', async () => {
    for (const args of [
      ['check', 'missing.evidence.json', '--json'],
      ['test', '--json'],
      [
        'test',
        '--target',
        'http://localhost:8080',
        '--scenarios',
        'missing',
        '--json',
      ],
      ['export', '--model', model, '--format', 'bad', '--json'],
    ]) {
      const result = await invoke(args);
      expect(result.code).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({ passed: false });
      expect(result.stderr).toBe('');
    }
  });

  it('executes the standalone Fastify tests without another language runtime', async () => {
    await new Promise<void>((resolve, reject) =>
      execFile(
        process.execPath,
        ['--test', 'test/app.test.mjs'],
        {
          cwd: path.join(
            repo,
            'examples/b2b-escrow/implementations/ts-fastify',
          ),
        },
        (error, stdout, stderr) =>
          error ? reject(new Error(`${stdout}\n${stderr}`)) : resolve(),
      ),
    );
  });
});
