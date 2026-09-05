import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureCodingBaseline, verifyCodingChanges } from './git.ts';

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'evidence-git-test-'));
  temporaryRoots.push(root);
  return root;
}

function gitSnapshot(dirtyPaths: string[]) {
  const output = dirtyPaths.length > 0 ? `${dirtyPaths.join('\0')}\0` : '';
  return {
    exec: vi.fn(async (_command: string, args: string[]) => {
      if (args[0] === 'rev-parse')
        return { code: 0, killed: false, stdout: 'true\n', stderr: '' };
      if (args[0] === 'ls-files')
        return { code: 0, killed: false, stdout: output, stderr: '' };
      if (args[0] === 'diff')
        return { code: 0, killed: false, stdout: '', stderr: '' };
      throw new Error(`Unexpected Git command: ${args.join(' ')}`);
    }),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('coding Git baseline', () => {
  it('detects whether a file changed after the story started', async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, 'source.ts'), 'before\n');
    const pi = gitSnapshot(['source.ts']);
    const baseline = await captureCodingBaseline(pi, root);

    await expect(
      verifyCodingChanges(pi, root, baseline, ['source.ts']),
    ).rejects.toThrow('相对当前故事开始时没有变化');

    await writeFile(join(root, 'source.ts'), 'after\n');
    await expect(
      verifyCodingChanges(pi, root, baseline, ['source.ts']),
    ).resolves.toEqual(['source.ts']);
  });

  it('requires a clean-at-baseline file to become dirty', async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, 'source.ts'), 'unchanged\n');
    const pi = gitSnapshot([]);
    const baseline = {
      gitAvailable: true,
      dirtyPaths: [],
      fileHashes: {},
      capturedAt: new Date().toISOString(),
    };

    await expect(
      verifyCodingChanges(pi, root, baseline, ['source.ts']),
    ).rejects.toThrow('相对当前故事开始时没有变化');
  });

  it('rejects story changes omitted from changedFiles', async () => {
    const root = await temporaryRoot();
    await Promise.all([
      writeFile(join(root, 'source.ts'), 'source\n'),
      writeFile(join(root, 'extra.ts'), 'extra\n'),
    ]);
    const pi = gitSnapshot(['source.ts', 'extra.ts']);
    const baseline = {
      gitAvailable: true,
      dirtyPaths: [],
      fileHashes: {},
      capturedAt: new Date().toISOString(),
    };

    await expect(
      verifyCodingChanges(pi, root, baseline, ['source.ts']),
    ).rejects.toThrow('未在 changedFiles 中声明');
  });
});
