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

  it('inspects a bundle without writing anything', async () => {
    const bundlePath = join(root, 'out.evidence.json');

    await runEvidenceModelCommand(['pack', modelRoot, '--out', bundlePath]);

    expect(await runEvidenceModelCommand(['inspect', bundlePath])).toBe(0);
    expect(
      await runEvidenceModelCommand(['inspect', modelRoot, '--json']),
    ).toBe(0);
  });
});
