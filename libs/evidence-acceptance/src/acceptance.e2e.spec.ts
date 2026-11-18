import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAcceptanceSuite } from './runner/acceptanceRunner.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from './cli.js';

const backend = fileURLToPath(
  new URL(
    '../../../examples/b2b-escrow/implementations/ts-fastify/dist/server.js',
    import.meta.url,
  ),
);
const model = fileURLToPath(
  new URL(
    '../../../examples/b2b-escrow/model/b2b-escrow.evidence.json',
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
  suite = out;
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

async function execute(fault = 'none') {
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
    return await runAcceptanceSuite({ suitePath: suite, targetUrl: host });
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
}

describe(
  'generated acceptance against an independent backend process',
  { timeout: 20_000 },
  () => {
    it('passes the complete positive and invalid-input flow via the official runner', async () => {
      const report = await execute();
      expect(
        report.passed,
        JSON.stringify(
          report.steps.filter((step) => !step.passed),
          null,
          2,
        ),
      ).toBe(true);
      const steps = report.steps;
      expect(report.selectedFlowCount).toBe(5);
      expect(steps).toHaveLength(121);
      expect(steps.every((step) => !step.errored && !step.skipped)).toBe(true);
      expect(
        steps
          .filter((step) => step.name?.endsWith('-00-tamper'))
          .every((step) => step.status === 422),
      ).toBe(true);
    });
    it('goes red for an incorrect derived amount, and green again after fixing it', async () => {
      const broken = await execute('amount');
      expect(broken.passed).toBe(false);
      const step = broken.steps.find(
        (step) => step.name === 'confirmation.order#single-on-time',
      )!;
      expect(step.assertions).toContainEqual({
        path: 'jsonpath.$["gross_amount_minor"]',
        actual: 1466403,
        expected: 1466402,
        passed: false,
      });
      expect((await execute()).passed).toBe(true);
    });
    it('goes red if a backend accepts caller-supplied derived fields', async () => {
      const broken = await execute('accept-derived');
      expect(broken.passed).toBe(false);
      const step = broken.steps.find((step) =>
        step.name.endsWith('-00-tamper'),
      )!;
      expect(step.assertions).toContainEqual({
        path: 'res.status',
        actual: 201,
        expected: 422,
        passed: false,
      });
    });
    it('goes red if the backend ignores the explicit business clock', async () => {
      const broken = await execute('clock');
      expect(broken.passed).toBe(false);
      expect(broken.steps[0]?.assertions).toContainEqual(
        expect.objectContaining({
          path: 'jsonpath.$["signed_at"]',
          passed: false,
        }),
      );
    });
    it('goes red for a response that violates the projected JSON Schema', async () => {
      const broken = await execute('extra-field');
      expect(broken.passed).toBe(false);
      expect(broken.steps[0]?.assertions).toContainEqual(
        expect.objectContaining({ path: 'schema', passed: false }),
      );
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
          (entity: { id: string }) => entity.id === 'confirmation.order',
        ),
      );
      invalid.examples[0].test.inputs = {};
      expect(validate(invalid)).toBe(false);
    });
  },
);
