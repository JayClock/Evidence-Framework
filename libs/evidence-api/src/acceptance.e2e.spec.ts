import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFromFile } from '@stepci/runner';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from './cli.js';

const backend = fileURLToPath(
  new URL('../../../examples/acceptance/backend.mjs', import.meta.url),
);
const model = fileURLToPath(
  new URL(
    '../../../examples/acceptance/procurement.evidence.json',
    import.meta.url,
  ),
);
let root: string, suite: string;
beforeEach(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'evidence-backend-e2e-'));
  const out = path.join(root, 'tests');
  const result = await runCli([
    'export-tests',
    '--project-root',
    root,
    '--fm',
    model,
    '--out',
    out,
  ]);
  expect(result.exitCode, JSON.stringify(result)).toBe(0);
  suite = path.join(out, 'acceptance.stepci.yml');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

async function execute(fault = 'none') {
  const child = spawn(
    process.execPath,
    [backend, '--port', '0', '--fault', fault],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stdout = '',
    stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  try {
    const host = await new Promise<string>((resolve, reject) => {
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
        reject(new Error(`Backend exited (${code}): ${stderr}`));
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
    return await runFromFile(suite, { env: { host } });
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
}

describe('generated acceptance against an independent backend process', () => {
  it('passes the complete positive and invalid-input flow via the official runner', async () => {
    const report = await execute();
    expect(
      report.result.passed,
      JSON.stringify(report.result.tests, null, 2),
    ).toBe(true);
    const steps = report.result.tests[0]!.steps;
    expect(steps).toHaveLength(4);
    expect(steps.every((step) => !step.errored && !step.skipped)).toBe(true);
    expect(
      steps.find((step) => step.name?.endsWith('#bad-input'))?.response?.status,
    ).toBe(422);
  });
  it('goes red for an incorrect derived amount, and green again after fixing it', async () => {
    const broken = await execute('amount');
    expect(broken.result.passed).toBe(false);
    const step = broken.result.tests[0]!.steps.find((step) =>
      step.name?.endsWith('#confirmed'),
    )!;
    const checks = step.checks?.jsonpath as Record<
      string,
      { given: unknown; expected: unknown; passed: boolean }
    >;
    expect(checks['$["total_amount"]']).toMatchObject({
      given: 501,
      expected: 500,
      passed: false,
    });
    expect((await execute()).result.passed).toBe(true);
  });
  it('goes red if a backend accepts caller-supplied derived fields', async () => {
    const broken = await execute('accept-derived');
    expect(broken.result.passed).toBe(false);
    const step = broken.result.tests[0]!.steps.find((step) =>
      step.name?.endsWith('#bad-input'),
    )!;
    expect(step.checks?.status).toMatchObject({
      given: 201,
      expected: 422,
      passed: false,
    });
  });
  it('goes red if the backend ignores the explicit business clock', async () => {
    const broken = await execute('clock');
    expect(broken.result.passed).toBe(false);
    const checks = broken.result.tests[0]!.steps[0]!.checks?.jsonpath as Record<
      string,
      { passed: boolean }
    >;
    expect(checks['$["signed_at"]']?.passed).toBe(false);
  });
  it('goes red for a response that violates the projected JSON Schema', async () => {
    const broken = await execute('extra-field');
    expect(broken.result.passed).toBe(false);
    expect(broken.result.tests[0]!.steps[0]!.checks?.schema).toMatchObject({
      passed: false,
    });
  });
  it('keeps the distributed entity JSON Schema aligned with inline examples', () => {
    const schemaPath = new URL(
      '../../evidence-schema/schemas/entity.schema.json',
      import.meta.url,
    );
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const validate = new Ajv2020({
      strict: false,
      validateFormats: false,
    }).compile(schema);
    const bundle = JSON.parse(readFileSync(model, 'utf8'));
    for (const entity of bundle.entities)
      expect(validate(entity), JSON.stringify(validate.errors)).toBe(true);
    const invalid = structuredClone(
      bundle.entities.find(
        (entity: { id: string }) => entity.id === 'confirmation.payment',
      ),
    );
    invalid.examples[0].test.inputs = {};
    expect(validate(invalid)).toBe(false);
  });
});
