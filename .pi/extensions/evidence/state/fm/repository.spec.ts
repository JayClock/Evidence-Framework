import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FM_MODEL_ROOT } from './paths.ts';
import { createFmRepository } from './repository.ts';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
const roots: string[] = [];
beforeEach(async () => {
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises',
    );
  vi.mocked(rename).mockReset().mockImplementation(actual.rename);
});
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function harness() {
  const root = await mkdtemp(join(tmpdir(), 'evidence-fm-repository-'));
  roots.push(root);
  const target = join(root, FM_MODEL_ROOT);
  await mkdir(target, { recursive: true });
  await writeFile(join(target, 'model.yaml'), 'synthetic previous model\n');
  const validate = vi.fn().mockResolvedValue({
    passed: true,
    machineValidated: true,
    simulationPassed: null,
    items: [],
  });
  const repository = createFmRepository(validate);
  const options = {
    root,
    executor: { exec: vi.fn() },
    timeoutMs: 1000,
    files: [{ path: 'model.yaml', content: 'synthetic next model' }],
  };
  return { root, target, validate, repository, options };
}

describe('FM file repository', () => {
  it('restores the previous model when promotion of validated staging fails', async () => {
    const h = await harness();
    const actual =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (
        dirname(String(from)) === join(h.root, '.evidence', 'staging') &&
        to === h.target
      )
        throw new Error('synthetic promotion failure');
      await actual.rename(from, to);
    });
    await expect(h.repository.replaceFmModel(h.options)).rejects.toThrow(
      'synthetic promotion failure',
    );
    expect(await readFile(join(h.target, 'model.yaml'), 'utf8')).toBe(
      'synthetic previous model\n',
    );
    expect(await readdir(join(h.root, '.evidence/staging'))).toEqual([]);
    expect(await readdir(dirname(h.target))).not.toContain('fm-model.backup');
  });

  it('cleans staging after an interrupted validator without touching the formal model', async () => {
    const h = await harness();
    h.validate.mockRejectedValue(new Error('synthetic interruption'));
    await expect(h.repository.replaceFmModel(h.options)).rejects.toThrow(
      'synthetic interruption',
    );
    expect(await readFile(join(h.target, 'model.yaml'), 'utf8')).toBe(
      'synthetic previous model\n',
    );
    expect(await readdir(join(h.root, '.evidence/staging'))).toEqual([]);
    expect(rename).not.toHaveBeenCalled();
  });

  it('discards successful drafts instead of publishing them', async () => {
    const h = await harness();
    expect(
      await h.repository.replaceFmModel({ ...h.options, draftOnly: true }),
    ).toMatchObject({ passed: true, files: [] });
    expect(await readFile(join(h.target, 'model.yaml'), 'utf8')).toBe(
      'synthetic previous model\n',
    );
    expect(await readdir(join(h.root, '.evidence/staging'))).toEqual([]);
    expect(rename).not.toHaveBeenCalled();
  });
});
