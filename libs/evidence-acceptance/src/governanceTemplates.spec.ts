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
  expect(
    existsSync(path.join(root, data.env.GENERATED, 'acceptance.stepci.yml')),
  ).toBe(true);
  expect(data.permissions).toEqual({ contents: 'read' });
  expect(data.jobs.acceptance.strategy.matrix.gate).toEqual([
    'regression',
    'dod',
  ]);
  expect(data.jobs.acceptance.strategy['fail-fast']).toBe(false);
  expect(text).toContain('--verify');
  expect(text).toContain('github.event.pull_request.base.sha');
  expect(text).toContain('--strict-drift --report-dir reports');
  expect(text).toContain('if: always()');
  expect(text).toContain('pnpm example:setup');
  expect(text).toContain('ts-fastify/dist/server.js --test-mode');
  expect(text).not.toContain('dogfood-backend');
  expect(text).not.toMatch(
    /pull_request_target|continue-on-error|--allow-pending/,
  );
});
it('ships a GitLab template with the same strict policy and native JUnit artifacts', () => {
  const { text, data } = load('templates/ci/evidence-ci.gitlab-ci.yml');
  expect(data['regression-gate'].variables.GATE).toBe('regression');
  expect(data['dod-gate'].variables.GATE).toBe('dod');
  expect(data['.evidence-gate'].artifacts.reports.junit).toBe('reports/*.xml');
  expect(text).toContain('CI_MERGE_REQUEST_DIFF_BASE_SHA');
  expect(text).toContain('--verify');
  expect(text).toContain('--strict-drift --report-dir reports');
  expect(text).toContain('pnpm example:setup');
  expect(text).toContain('ts-fastify/dist/server.js --test-mode');
  expect(text).not.toContain('dogfood-backend');
  expect(text).not.toMatch(/allow_failure|--allow-pending/);
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
