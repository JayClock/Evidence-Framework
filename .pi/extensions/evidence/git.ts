import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { projectPath, relativeProjectPath } from './storage.ts';
import type { CodingBaseline } from './types.ts';

type ExecApi = Pick<ExtensionAPI, 'exec'>;

const MAX_BASELINE_FILES = 2_000;

function nullSeparatedPaths(output: string): string[] {
  return output.split('\0').filter(Boolean);
}

async function hashFile(root: string, path: string): Promise<string> {
  const content = await readFile(projectPath(root, path));
  return createHash('sha256').update(content).digest('hex');
}

export async function captureCodingBaseline(
  pi: ExecApi,
  root: string,
): Promise<CodingBaseline> {
  const capturedAt = new Date().toISOString();
  const repository = await pi.exec(
    'git',
    ['rev-parse', '--is-inside-work-tree'],
    { cwd: root, timeout: 5_000 },
  );
  if (repository.code !== 0) {
    return { gitAvailable: false, dirtyPaths: [], fileHashes: {}, capturedAt };
  }

  const [workingTree, index] = await Promise.all([
    pi.exec('git', ['ls-files', '-m', '-o', '--exclude-standard', '-z'], {
      cwd: root,
      timeout: 30_000,
    }),
    pi.exec('git', ['diff', '--cached', '--name-only', '-z'], {
      cwd: root,
      timeout: 30_000,
    }),
  ]);
  if (workingTree.code !== 0 || index.code !== 0) {
    throw new Error(
      `无法捕获 Coding Git 基线：${workingTree.stderr || index.stderr}`,
    );
  }

  const dirtyPaths = [
    ...new Set(
      [
        ...nullSeparatedPaths(workingTree.stdout),
        ...nullSeparatedPaths(index.stdout),
      ].map((path) => relativeProjectPath(root, path)),
    ),
  ];
  if (dirtyPaths.length > MAX_BASELINE_FILES) {
    throw new Error(
      `Coding Git 基线包含 ${dirtyPaths.length} 个脏文件，超过上限 ${MAX_BASELINE_FILES}；请先整理工作区。`,
    );
  }

  const entries = await Promise.all(
    dirtyPaths.map(async (path) => {
      try {
        return [path, await hashFile(root, path)] as const;
      } catch {
        return null;
      }
    }),
  );
  const fileHashes = Object.fromEntries(
    entries.filter(
      (entry): entry is readonly [string, string] => entry !== null,
    ),
  );
  return { gitAvailable: true, dirtyPaths, fileHashes, capturedAt };
}

function snapshotMarker(
  snapshot: CodingBaseline,
  dirtyPaths: Set<string>,
  path: string,
): string {
  if (!dirtyPaths.has(path)) return '<clean>';
  return snapshot.fileHashes[path] ?? '<missing>';
}

export async function verifyCodingChanges(
  pi: ExecApi,
  root: string,
  baseline: CodingBaseline,
  declaredPaths: string[],
  ignorePath: (path: string) => boolean = () => false,
): Promise<string[]> {
  if (!baseline.gitAvailable) return declaredPaths;

  const current = await captureCodingBaseline(pi, root);
  if (!current.gitAvailable) {
    throw new Error('Coding 期间 Git 仓库变为不可用，无法验证变更文件。');
  }

  const baselineDirty = new Set(baseline.dirtyPaths);
  const currentDirty = new Set(current.dirtyPaths);
  const candidates = new Set([...baselineDirty, ...currentDirty]);
  const changedPaths = [...candidates].filter((path) => {
    return (
      snapshotMarker(baseline, baselineDirty, path) !==
      snapshotMarker(current, currentDirty, path)
    );
  });
  const relevantChanges = changedPaths.filter((path) => !ignorePath(path));
  const changed = new Set(relevantChanges);
  const declared = new Set(declaredPaths);

  const unchangedDeclarations = declaredPaths.filter(
    (path) => !changed.has(path),
  );
  if (unchangedDeclarations.length > 0) {
    throw new Error(
      `以下声明文件相对当前故事开始时没有变化：${unchangedDeclarations.join(', ')}`,
    );
  }
  const undeclaredChanges = relevantChanges.filter(
    (path) => !declared.has(path),
  );
  if (undeclaredChanges.length > 0) {
    throw new Error(
      `检测到未在 changedFiles 中声明的故事变更：${undeclaredChanges.join(', ')}`,
    );
  }
  return relevantChanges;
}
