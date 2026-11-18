import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { expect, it } from 'vitest';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const load = (file: string) => {
  const text = readFileSync(path.join(root, file), 'utf8');
  const doc = parseDocument(text, { uniqueKeys: true });
  expect(doc.errors).toEqual([]);
  return { text, data: doc.toJS() };
};
it('ships a strict runnable GitHub dual-gate workflow with immutable baseline and failure artifacts', () => {
  const { text, data } = load('.github/workflows/evidence-governance.yml');
  for (const key of ['MODEL', 'BOOTSTRAP_MODEL'])
    expect(existsSync(path.join(root, data.env[key]))).toBe(true);
  expect(existsSync(path.join(root, data.env.GENERATED, 'bruno.json'))).toBe(
    true,
  );
  expect(data.permissions).toEqual({ contents: 'read' });
  const acceptance = data.jobs.acceptance;
  const contract = data.jobs['contract-and-hygiene'];
  expect(acceptance.needs).toBe('contract-and-hygiene');
  expect(acceptance.strategy.matrix.implementation).toEqual([
    'golang-gin',
    'java-spring',
    'python-fastapi',
    'ts-fastify',
  ]);
  expect(acceptance.strategy['fail-fast']).toBe(false);
  expect(acceptance.env.IMPLEMENTATION).toBe('${{ matrix.implementation }}');
  expect(contract.steps).toContainEqual(
    expect.objectContaining({
      uses: 'actions/checkout@v4',
      with: { 'fetch-depth': 0 },
    }),
  );
  expect(contract.steps).toContainEqual(
    expect.objectContaining({ run: 'pnpm api:setup' }),
  );
  expect(contract.steps).toContainEqual(
    expect.objectContaining({
      run: 'make -C examples/b2b-escrow check tools-test',
    }),
  );
  expect(text).toContain('github.event.pull_request.base.sha');
  expect(text).toContain('git show "${BASE_SHA}:${MODEL}"');
  expect(text).toContain('git show "${BASE_SHA}:${BOOTSTRAP_MODEL}"');
  expect(acceptance.steps).toContainEqual(
    expect.objectContaining({
      uses: 'actions/download-artifact@v4',
      with: { name: 'evidence-contract', path: 'reports' },
    }),
  );
  expect(acceptance.steps).toContainEqual(
    expect.objectContaining({
      id: 'build',
      run: expect.stringContaining('make -C examples/b2b-escrow prepare'),
    }),
  );
  const gateSteps = acceptance.steps.filter((step: { run?: string }) =>
    step.run?.includes('make -C examples/b2b-escrow gate '),
  );
  expect(gateSteps).toHaveLength(2);
  for (const [index, gate] of ['regression', 'dod'].entries()) {
    expect(gateSteps[index]).toMatchObject({
      // DoD must still run after a failed regression, but never after a failed build.
      if: "${{ !cancelled() && steps.build.outcome == 'success' }}",
      run: `make -C examples/b2b-escrow gate GATE=${gate} BASELINE="$GITHUB_WORKSPACE/reports/baseline.evidence.json" REPORT_DIR="$GITHUB_WORKSPACE/reports/${gate}"`,
    });
  }
  for (const [job, name] of [
    [contract, 'evidence-contract'],
    [acceptance, 'evidence-${{ matrix.implementation }}'],
  ] as const)
    expect(job.steps).toContainEqual(
      expect.objectContaining({
        uses: 'actions/upload-artifact@v4',
        if: 'always()',
        with: expect.objectContaining({ name, path: 'reports/' }),
      }),
    );
  expect(text).not.toContain('dogfood-backend');
  expect(text).not.toMatch(
    /pull_request_target|continue-on-error|--allow-pending/,
  );
});
it('ships a GitLab template with the same strict policy and native JUnit artifacts', () => {
  const { text, data } = load('templates/ci/evidence-ci.gitlab-ci.yml');
  for (const gate of ['regression', 'dod'])
    expect(data[`${gate}-gate`]).toMatchObject({
      extends: '.evidence-gate',
      variables: { GATE: gate },
    });
  expect(data.variables.GIT_DEPTH).toBe('0');
  expect(data['contract-and-hygiene'].artifacts).toMatchObject({
    when: 'always',
    paths: ['reports/'],
  });
  expect(data['.evidence-gate']).toMatchObject({
    needs: [{ job: 'contract-and-hygiene', artifacts: true }],
    artifacts: {
      when: 'always',
      paths: ['reports/'],
      reports: { junit: 'reports/*/ts-fastify/*/*.xml' },
    },
  });
  const script = data['.evidence-gate'].script.join('\n');
  expect(script).toContain('set -eu');
  expect(script).toContain(
    'make -C examples/b2b-escrow prepare IMPLEMENTATION=ts-fastify',
  );
  expect(script).toContain(
    'make -C examples/b2b-escrow gate IMPLEMENTATION=ts-fastify GATE="$GATE"',
  );
  expect(script).toContain(
    'BASELINE="$CI_PROJECT_DIR/reports/baseline.evidence.json"',
  );
  expect(script).toContain('REPORT_DIR="$CI_PROJECT_DIR/reports/$GATE"');
  expect(text).toContain('CI_MERGE_REQUEST_DIFF_BASE_SHA');
  expect(text).toContain('git show "${BASE_SHA}:${MODEL}"');
  expect(text).toContain('git show "${BASE_SHA}:${BOOTSTRAP_MODEL}"');
  expect(text).toContain('--verify');
  expect(text).not.toContain('dogfood-backend');
  expect(text).not.toMatch(/allow_failure|--allow-pending/);
});

it('delegates generated-file verification and strict policy gates without losing CLI options', () => {
  const makefile = readFileSync(
    path.join(root, 'examples/b2b-escrow/Makefile'),
    'utf8',
  );
  expect(makefile).toContain(
    'export --model "$(ROOT)/model/b2b-escrow.evidence.json" --out "$(ROOT)/generated" --verify',
  );
  expect(makefile).toContain(
    'gate:\n\tnode "$(ROOT)/verification/run.mjs" --implementation "$(IMPLEMENTATION)" --gate "$(GATE)" --baseline-model "$(BASELINE)" $(REPORT_FLAG)',
  );
  expect(makefile).toContain(
    'REPORT_FLAG = $(if $(REPORT_DIR),--report-dir "$(REPORT_DIR)",)',
  );
  const runner = readFileSync(
    path.join(root, 'examples/b2b-escrow/verification/run.mjs'),
    'utf8',
  );
  const policy = readFileSync(
    path.join(root, 'examples/b2b-escrow/verification/policy.mjs'),
    'utf8',
  );
  expect(runner).toContain(
    "args.push('--baseline-model', baseline, '--gate', scenario.gate)",
  );
  expect(runner).toContain("if (scenario.strict) args.push('--strict-drift')");
  expect(runner).toContain(
    'if (values.gate) verifyGateResult(values.gate, run.code, report)',
  );
  expect(policy).toContain(
    "return [{ name: gate, gate, mode: 'v2', fault: 'none', strict: true }]",
  );
});

it('prepares the standalone SUT explicitly without inferring it as a workspace project', () => {
  const { data } = load('.github/workflows/ci.yml');
  expect(data.jobs.verify.steps).toContainEqual(
    expect.objectContaining({ run: 'pnpm example:setup' }),
  );
  expect(data.jobs.verify.steps).toContainEqual(
    expect.objectContaining({ run: 'pnpm example:test' }),
  );
  const workspace = readFileSync(
    path.join(root, 'pnpm-workspace.yaml'),
    'utf8',
  );
  expect(parseDocument(workspace).toJS().packages).not.toContain('examples/**');
  const nx = JSON.parse(readFileSync(path.join(root, 'nx.json'), 'utf8'));
  for (const plugin of nx.plugins)
    expect(plugin.exclude).toContain('examples/**');
});
