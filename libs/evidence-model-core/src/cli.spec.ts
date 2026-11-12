import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runEvidenceModelCommand } from './cli.js';
import { readModelBundle, writeModelDirectory } from './index.js';
import { createProcurementModel } from '../tests/support/modelFixture.js';

describe('evidence-model CLI', () => {
  let root: string;
  let modelRoot: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'evidence-cli-'));
    modelRoot = join(root, '.evidence', 'fm');
    await writeModelDirectory(modelRoot, createProcurementModel());
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it('packs a directory into a bundle named after the model', async () => {
    const code = await runEvidenceModelCommand(['pack', modelRoot]);
    const bundlePath = join(
      modelRoot,
      `${createProcurementModel().manifest.id.replaceAll('.', '-')}.evidence.json`,
    );

    expect(code).toBe(0);
    expect((await readModelBundle(bundlePath)).issues).toEqual([]);
  });

  it('packs to an explicit path and unpacks it back', async () => {
    const bundlePath = join(root, 'out.evidence.json');
    const restored = join(root, 'restored');

    expect(
      await runEvidenceModelCommand(['pack', modelRoot, '--out', bundlePath]),
    ).toBe(0);
    expect(
      await runEvidenceModelCommand(['unpack', bundlePath, '--out', restored]),
    ).toBe(0);
    expect(
      JSON.parse(await readFile(join(restored, 'model.json'), 'utf8')),
    ).toEqual(createProcurementModel().manifest);
  });

  it('reports usage for an unknown command and a missing target', async () => {
    expect(await runEvidenceModelCommand(['nope'])).toBe(2);
    expect(await runEvidenceModelCommand(['pack'])).toBe(2);
    expect(await runEvidenceModelCommand([])).toBe(2);
    expect(await runEvidenceModelCommand(['--help'])).toBe(0);
  });

  it('refuses to unpack a file that is not a bundle', async () => {
    expect(
      await runEvidenceModelCommand(['unpack', join(root, 'model.json')]),
    ).toBe(2);
  });

  it('checks a model directory and reports the same digest the app does', async () => {
    const output = vi.spyOn(process.stdout, 'write');

    expect(await runEvidenceModelCommand(['check', modelRoot])).toBe(0);

    const printed = output.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(printed).toContain('一致性: 通过');
    expect(printed).toContain('模型摘要: sha256:');
  });

  it('prints the report as JSON when asked, and refuses a bundle', async () => {
    const output = vi.spyOn(process.stdout, 'write');

    // A scope the model does not contain fails the check instead of passing it.
    expect(
      await runEvidenceModelCommand(['check', modelRoot, '--scope=context.missing', '--json']),
    ).toBe(1);

    const printed = output.mock.calls.map(([chunk]) => String(chunk)).join('');
    const report = JSON.parse(printed) as {
      checkVersion: number;
      scopeRefs: readonly string[];
      errors: readonly string[];
    };

    expect(report.checkVersion).toBe(5);
    expect(report.scopeRefs).toEqual(['context.missing']);
    expect(report.errors).toEqual([
      "scope 'context.missing' must be an independent Context, not a fulfillment slice",
    ]);

    const bundlePath = join(root, 'bundle.evidence.json');

    expect(
      await runEvidenceModelCommand(['check', bundlePath]),
    ).toBe(2);
  });

  it('inspects a bundle without writing anything', async () => {
    const bundlePath = join(root, 'out.evidence.json');

    await runEvidenceModelCommand(['pack', modelRoot, '--out', bundlePath]);

    expect(await runEvidenceModelCommand(['inspect', bundlePath])).toBe(0);
    expect(
      await runEvidenceModelCommand(['inspect', modelRoot, '--json']),
    ).toBe(0);
  });
});
