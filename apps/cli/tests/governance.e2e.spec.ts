import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const baseline = path.join(
  repo,
  'examples/b2b-escrow/model/b2b-escrow-v1.evidence.json',
);
const current = path.join(
  repo,
  'examples/b2b-escrow/model/b2b-escrow.evidence.json',
);
let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'evidence-governance-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
const invoke = (args: string[]) =>
  new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
    delete env.FORCE_COLOR;
    execFile(
      process.execPath,
      [path.join(repo, 'apps/cli/dist/cli.js'), ...args],
      { cwd: root, timeout: 30000, env },
      (error, stdout, stderr) =>
        resolve({
          code: typeof error?.code === 'number' ? error.code : error ? 1 : 0,
          stdout,
          stderr,
        }),
    );
  });
async function exported() {
  const result = await invoke([
    'export',
    '--model',
    current,
    '--out',
    'generated',
  ]);
  expect(result.code, result.stderr).toBe(0);
}

// Each execution gets a new ledger. Reusing a mutated SUT would mask duplicate
// writes or make independent baseline/DoD runs depend on execution order.
async function runBackend(args: string[], mode = 'v2', fault = 'none') {
  const child = spawn(
    process.execPath,
    [
      path.join(
        repo,
        'examples/b2b-escrow/implementations/ts-fastify/dist/server.js',
      ),
      '--test-mode',
      '--port',
      '0',
      '--mode',
      mode,
      '--fault',
      fault,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let errors = '';
  child.stderr.on('data', (data) => {
    errors += String(data);
  });
  try {
    const [line] = await once(child.stdout, 'data', {
      signal: AbortSignal.timeout(5000),
    });
    const url = (JSON.parse(String(line)) as { host: string }).host;
    return await invoke([
      'test',
      '--target',
      url,
      '--scenarios',
      'generated',
      ...args,
      '--json',
    ]);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    expect(errors).toBe('');
  }
}
const gateArgs = (gate: string) => [
  '--baseline-model',
  baseline,
  '--gate',
  gate,
];

it('verifies committed exports and rejects stale models without mutating artifacts', async () => {
  const checkedIn = await invoke([
    'export',
    '--model',
    current,
    '--out',
    path.join(repo, 'examples/b2b-escrow/generated'),
    '--verify',
  ]);
  expect(checkedIn.code, checkedIn.stderr).toBe(0);
  const model = path.join(root, 'model.evidence.json');
  writeFileSync(model, readFileSync(current));
  const args = ['export', '--model', model, '--out', 'generated'];
  expect((await invoke(args)).code).toBe(0);
  const before = readFileSync(
    path.join(root, 'generated/openapi.json'),
    'utf8',
  );
  expect((await invoke([...args, '--verify'])).code).toBe(0);
  const changed = JSON.parse(readFileSync(model, 'utf8'));
  changed.manifest.version = '9.0.0';
  writeFileSync(model, JSON.stringify(changed));
  const stale = await invoke([...args, '--verify']);
  expect(stale.code).toBe(1);
  expect(stale.stderr).toContain('MODIFIED: openapi.json');
  expect(readFileSync(path.join(root, 'generated/openapi.json'), 'utf8')).toBe(
    before,
  );
  expect((await invoke(args)).code).toBe(0);
  expect((await invoke([...args, '--verify'])).code).toBe(0);
}, 30000);

it('keeps v1 regression green and marks unavailable milestone DoD as failed or explicit pending', async () => {
  await exported();
  const regression = await runBackend(gateArgs('regression'), 'v1');
  expect(regression.code, regression.stdout + regression.stderr).toBe(0);
  const old = JSON.parse(regression.stdout);
  expect(old.suites[0].steps).toHaveLength(46);
  expect(
    old.suites[0].steps.every((step: { flow: string }) =>
      step.flow.startsWith('single-'),
    ),
  ).toBe(true);
  const dod = await runBackend(
    [...gateArgs('dod'), '--report-dir', 'reports'],
    'v1',
  );
  expect(dod.code, dod.stderr).toBe(1);
  const report = JSON.parse(dod.stdout);
  expect(report.suites[0].steps).toHaveLength(75);
  expect(report.suites[0].steps).toContainEqual(
    expect.objectContaining({ status: 404, passed: false }),
  );
  expect(
    report.suites[0].steps.some((step: { skipped: boolean }) => step.skipped),
  ).toBe(true);
  expect(readFileSync(path.join(root, 'reports/dod.md'), 'utf8')).toContain(
    '- [ ]',
  );
  expect(readFileSync(path.join(root, 'reports/dod.xml'), 'utf8')).toContain(
    '<failure',
  );
  const wip = await runBackend([...gateArgs('dod'), '--allow-pending'], 'v1');
  expect(wip.code, wip.stderr).toBe(0);
  expect(JSON.parse(wip.stdout)).toMatchObject({
    passed: false,
    pending: true,
    gate: 'dod',
  });
}, 30000);

it('makes both v2 gates green, filters whole milestone flows and reports unchanged DoD honestly', async () => {
  await exported();
  for (const gate of ['regression', 'dod']) {
    const result = await runBackend([...gateArgs(gate), '--strict-drift']);
    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).passed).toBe(true);
  }
  const selected = await runBackend([
    '--filter',
    'milestone*',
    '--tag',
    'milestone',
    '--tag',
    'dod',
  ]);
  expect(selected.code, selected.stdout + selected.stderr).toBe(0);
  expect(JSON.parse(selected.stdout).suites[0].steps).toHaveLength(75);
  const unchanged = await runBackend([
    '--baseline-model',
    current,
    '--gate',
    'dod',
  ]);
  expect(unchanged.code, unchanged.stderr).toBe(0);
  expect(JSON.parse(unchanged.stdout).suites[0]).toMatchObject({
    selectedFlowCount: 0,
    steps: [],
    emptyReason: expect.stringContaining('No incremental flows'),
  });
}, 30000);

it.each(['extra-field', 'missing-derived', 'amount'])(
  'detects the independent %s fault with the correct gate policy',
  async (fault) => {
    await exported();
    const args = gateArgs(fault === 'amount' ? 'regression' : 'dod');
    const advisory = await runBackend([...args, '--detect-drift'], 'v2', fault);
    expect(advisory.code, advisory.stdout + advisory.stderr).toBe(
      fault === 'extra-field' ? 0 : 1,
    );
    const report = JSON.parse(advisory.stdout);
    if (fault !== 'amount') {
      expect(
        report.suites[0].steps.flatMap(
          (step: { driftIssues?: unknown[] }) => step.driftIssues ?? [],
        ),
      ).toContainEqual(
        expect.objectContaining(
          fault === 'extra-field'
            ? { type: 'extraneous_field', path: '/unmodeled' }
            : { type: 'missing_required', path: '/gross_amount_minor' },
        ),
      );
      const strict = await runBackend(
        [...args, '--strict-drift', '--allow-pending'],
        'v2',
        fault,
      );
      expect(strict.code, strict.stdout + strict.stderr).toBe(1);
      expect(JSON.parse(strict.stdout)).toMatchObject({
        passed: false,
        pending: false,
      });
    }
  },
  30000,
);

it('accepts additive milestone contracts and blocks new required caller fields', async () => {
  const compatible = await invoke(['diff', 'api', baseline, current]);
  expect(compatible.code, compatible.stderr).toBe(0);
  expect(JSON.parse(compatible.stdout).hasBreakingChanges).toBe(false);
  const model = JSON.parse(readFileSync(current, 'utf8'));
  const confirmation = model.entities.find(
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
    example.value.note = 'now required';
  const broken = path.join(root, 'breaking.evidence.json');
  writeFileSync(broken, JSON.stringify(model));
  const result = await invoke(['diff', 'api', current, broken]);
  expect(result.code, result.stdout + result.stderr).toBe(1);
  expect(JSON.parse(result.stdout).hasBreakingChanges).toBe(true);
}, 30000);
