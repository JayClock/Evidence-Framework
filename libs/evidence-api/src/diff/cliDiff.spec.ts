import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  readModelRoot,
  serializeModelBundle,
} from '@evidence-poc/evidence-model-core';
import { API_FIXTURES } from '../../tests/support/fixtures.js';
import { runCli } from '../cli.js';
import { renderApiDiff } from './renderApiDiff.js';
import { diffModelToApi } from './apiDiff.js';

it('compares directories and bundles as JSON or plain summaries without touching inputs', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'api-diff-'));
  try {
    const root = `${API_FIXTURES}full-lifecycle/fm`;
    const { bundle } = await readModelRoot(root);
    const file = path.join(directory, 'current.evidence.json');
    writeFileSync(file, serializeModelBundle(bundle));
    const original = readFileSync(file, 'utf8');
    const args = ['diff', '--base', root, '--target', file];
    const same = await runCli(args);
    expect(same.exitCode).toBe(0);
    expect(same.output).toMatchObject({
      summary: {
        routesAdded: 0,
        routesRemoved: 0,
        routesModified: 0,
        hasBreakingChanges: false,
      },
    });
    const summary = await runCli([...args, '--format', 'summary']);
    expect(summary.output).toContain('No API changes.');
    const overlay = path.join(directory, 'overlay.json');
    writeFileSync(
      overlay,
      JSON.stringify({
        routes: [
          { id: 'route.sign.contract.product-procurement', path: '/contracts' },
        ],
      }),
    );
    const broken = await runCli([...args, '--api', overlay]);
    expect(broken.exitCode).toBe(3);
    expect(broken.output).toMatchObject({
      summary: { hasBreakingChanges: true },
    });
    const colored = renderApiDiff(diffModelToApi(bundle, bundle), true);
    expect(colored).toContain('No API changes.');
    expect(readFileSync(file, 'utf8')).toBe(original);
    bundle.manifest.id = 'other';
    writeFileSync(file, serializeModelBundle(bundle));
    expect((await runCli(args)).exitCode).toBe(1);
    writeFileSync(file, 'not json');
    expect((await runCli(args)).exitCode).toBe(1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it.each([
  ['diff'],
  ['diff', '--base', 'relative', '--target', '/absolute'],
  ['diff', '--base', '/a', '--target', '/b', '--format', 'yaml'],
  ['diff', '--base', '/a', '--base', '/b'],
  ['diff', '--base', '/a', '--target', '/b', '--out', '/not-allowed'],
  ['diff', '--base'],
])('refuses malformed diff arguments: %j', async (...args) => {
  expect((await runCli(args)).exitCode).toBe(1);
});
