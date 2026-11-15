import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeModelBundle } from '@evidence-poc/evidence-model-core';
import { createProcurementModel } from '@evidence-poc/evidence-model-core/testing';
import {
  packModelDirectory,
  readModelRoot,
  unpackModelBundle,
  writeModelDirectory,
} from './index.js';
import { runEvidenceModelCommand } from './cli.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'evidence-no-legacy-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe('breaking removal of validation files', () => {
  it.each(['legacy.json', 'instance--legacy.md'])(
    'blocks a retired source tree containing %s',
    async (name) => {
      const fm = path.join(root, 'fm');
      await writeModelDirectory(fm, createProcurementModel());
      const retired = path.join(fm, 'validation/scenarios');
      await mkdir(retired, { recursive: true });
      await writeFile(path.join(retired, name), '{}');
      for (const result of [
        await readModelRoot(fm),
        await packModelDirectory(fm),
      ]) {
        expect(result.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'model.legacy-validation' }),
          ]),
        );
        expect(result.bundle).not.toHaveProperty('validation');
      }
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      expect(
        await runEvidenceModelCommand([
          'pack',
          fm,
          '--out',
          path.join(root, 'refused.evidence.json'),
        ]),
      ).toBe(1);
      expect(await readdir(root)).not.toContain('refused.evidence.json');
    },
  );
  it('refuses unpacking an old envelope without creating or overwriting output', async () => {
    const file = path.join(root, 'old.evidence.json');
    const legacy = {
      ...JSON.parse(serializeModelBundle(createProcurementModel())),
      validation: { instances: [], scenarios: [] },
    };
    await writeFile(file, JSON.stringify(legacy));
    const out = path.join(root, 'existing');
    await mkdir(out);
    await writeFile(path.join(out, 'keep.txt'), 'untouched');
    const result = await unpackModelBundle(file, out);
    expect(result.issues.some((issue) => issue.path === 'validation')).toBe(
      true,
    );
    expect(result.result).toEqual({ written: [], unchanged: [] });
    expect(await readdir(out)).toEqual(['keep.txt']);
    expect(await readFile(path.join(out, 'keep.txt'), 'utf8')).toBe(
      'untouched',
    );
  });
});
