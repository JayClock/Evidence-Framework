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
  'examples/acceptance/procurement.evidence.json',
);
const current = path.join(
  repo,
  'examples/acceptance/procurement-deposit.evidence.json',
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
      {
        cwd: root,
        timeout: 15000,
        env,
      },
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
async function withBackend(
  mode: string,
  fault: string,
  action: (url: string) => Promise<void>,
) {
  const child = spawn(
    process.execPath,
    [
      path.join(repo, 'examples/dogfood-backend/server.mjs'),
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
    await action(url);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    expect(errors).toBe('');
  }
}
const testArgs = (target: string, gate: string) => [
  'test',
  '--target',
  target,
  '--scenarios',
  'generated',
  '--baseline-model',
  baseline,
  '--gate',
  gate,
  '--json',
];

it('verifies committed exports and rejects model changes without refreshing or mutating artifacts', async () => {
  const checkedIn = await invoke([
    'export',
    '--model',
    current,
    '--out',
    path.join(repo, 'examples/governance/generated'),
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
  changed.manifest.version = '1.2.0';
  writeFileSync(model, JSON.stringify(changed));
  const stale = await invoke([...args, '--verify']);
  expect(stale.code).toBe(1);
  expect(stale.stderr).toContain('MODIFIED: openapi.json');
  expect(readFileSync(path.join(root, 'generated/openapi.json'), 'utf8')).toBe(
    before,
  );
  expect((await invoke(args)).code).toBe(0);
  expect((await invoke([...args, '--verify'])).code).toBe(0);
}, 20000);

it('keeps v1 regression green, identifies exactly the new flow, and reports explicit WIP without a false pass', async () => {
  await exported();
  await withBackend('v1', 'none', async (target) => {
    const regression = await invoke(testArgs(target, 'regression'));
    expect(regression.code, regression.stderr).toBe(0);
    const old = JSON.parse(regression.stdout);
    expect(old.suites[0].steps).toHaveLength(4);
    expect(
      old.suites[0].steps.every(
        (step: { flow: string }) => step.flow === 'payment',
      ),
    ).toBe(true);
    const dod = await invoke([
      ...testArgs(target, 'dod'),
      '--report-dir',
      'reports',
    ]);
    expect(dod.code, dod.stderr).toBe(1);
    const report = JSON.parse(dod.stdout);
    expect(report.suites[0].steps).toHaveLength(3);
    expect(report.suites[0].steps[1]).toMatchObject({
      flow: 'deposit',
      status: 404,
      passed: false,
    });
    expect(report.suites[0].steps[2].skipped).toBe(true);
    expect(readFileSync(path.join(root, 'reports/dod.md'), 'utf8')).toContain(
      '- [ ]',
    );
    expect(readFileSync(path.join(root, 'reports/dod.xml'), 'utf8')).toContain(
      '<failure',
    );
    const wip = await invoke([...testArgs(target, 'dod'), '--allow-pending']);
    expect(wip.code, wip.stderr).toBe(0);
    expect(JSON.parse(wip.stdout)).toMatchObject({
      passed: false,
      pending: true,
      gate: 'dod',
    });
  });
}, 20000);

it('makes both v2 gates green, preserves dependencies during filtering, and explicitly reports unchanged DoD', async () => {
  await exported();
  await withBackend('v2', 'none', async (target) => {
    for (const gate of ['regression', 'dod']) {
      const result = await invoke([
        ...testArgs(target, gate),
        '--strict-drift',
      ]);
      expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(JSON.parse(result.stdout).passed).toBe(true);
    }
    const selected = await invoke([
      'test',
      '--target',
      target,
      '--scenarios',
      'generated',
      '--filter',
      'deposit*',
      '--tag',
      'deposit',
      '--tag',
      'dod',
      '--json',
    ]);
    expect(selected.code, selected.stderr).toBe(0);
    expect(JSON.parse(selected.stdout).suites[0].steps).toHaveLength(3);
    const unchanged = await invoke([
      'test',
      '--target',
      target,
      '--scenarios',
      'generated',
      '--baseline-model',
      current,
      '--gate',
      'dod',
      '--json',
    ]);
    expect(unchanged.code).toBe(0);
    expect(JSON.parse(unchanged.stdout).suites[0]).toMatchObject({
      selectedFlowCount: 0,
      steps: [],
      emptyReason: expect.stringContaining('No incremental flows'),
    });
  });
}, 20000);

it.each(['extra-field', 'missing-derived', 'amount'])(
  'detects the independent %s fault with the correct gate policy',
  async (fault) => {
    await exported();
    await withBackend('v2', fault, async (target) => {
      const args = testArgs(target, fault === 'amount' ? 'regression' : 'dod');
      const advisory = await invoke([...args, '--detect-drift']);
      expect(advisory.code, advisory.stderr).toBe(
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
              : { type: 'missing_required', path: '/deposit_amount' },
          ),
        );
        const strict = await invoke([
          ...args,
          '--strict-drift',
          '--allow-pending',
        ]);
        expect(strict.code, strict.stderr).toBe(1);
        expect(JSON.parse(strict.stdout)).toMatchObject({
          passed: false,
          pending: false,
        });
      }
    });
  },
  20000,
);

it('blocks breaking compatibility changes while accepting the additive deposit contract', async () => {
  const compatible = await invoke(['diff', 'api', baseline, current]);
  expect(compatible.code, compatible.stderr).toBe(0);
  expect(JSON.parse(compatible.stdout).hasBreakingChanges).toBe(false);
  const model = JSON.parse(readFileSync(current, 'utf8'));
  const confirmation = model.entities.find(
    (entity: { id: string }) => entity.id === 'confirmation.payment',
  );
  confirmation.attributes.find(
    (attribute: { name: string }) => attribute.name === 'note',
  ).required = true;
  for (const example of confirmation.examples)
    example.value.note = 'now required';
  const broken = path.join(root, 'breaking.evidence.json');
  writeFileSync(broken, JSON.stringify(model));
  const result = await invoke(['diff', 'api', current, broken]);
  expect(result.code, result.stderr).toBe(1);
  expect(JSON.parse(result.stdout).hasBreakingChanges).toBe(true);
}, 20000);
