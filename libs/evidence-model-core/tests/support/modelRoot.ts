/**
 * Fixture reader for the model-core specs.
 *
 * The production reader lives in `@evidence-poc/evidence-model-io`. Keeping it
 * out of this package is the point of the split: `evidence-model-core` stays
 * free of `node:fs` so the renderer can import it. The specs still assert
 * against real source trees, so this test-only mirror walks a fixture root the
 * same way and hands the files to the pure packer in this package.
 *
 * Test-only: `tests/` is included by `tsconfig.spec.json` and never built.
 */
import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  MODEL_MANIFEST_PATH,
  MODEL_SOURCE_TREES,
  packModelSourceFiles,
  type ModelSourceFile,
  type PackResult,
} from '../../src/index.js';

const CHECK_TREES = [...MODEL_SOURCE_TREES, 'validation'] as const;

const isIgnored = (relativePath: string): boolean =>
  relativePath
    .split('/')
    .some(
      (part) => part === 'generated' || part === '__pycache__' || part.startsWith('.'),
    );

const readTree = async (
  root: string,
  relativeDirectory: string,
): Promise<ModelSourceFile[]> => {
  const absolute = path.join(root, relativeDirectory);
  let entries: Dirent[];

  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const files: ModelSourceFile[] = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const relative = `${relativeDirectory}/${entry.name}`;

    if (isIgnored(relative)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await readTree(root, relative)));
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    files.push({
      path: relative,
      content: await readFile(path.join(root, relative), 'utf8'),
    });
  }

  return files;
};

/** Every source file under a fixture model root, manifest first. */
export async function readModelRootFiles(
  root: string,
): Promise<ModelSourceFile[]> {
  const manifest = await readFile(path.join(root, MODEL_MANIFEST_PATH), 'utf8')
    .then((content): ModelSourceFile[] => [
      { path: MODEL_MANIFEST_PATH, content },
    ])
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return [];
      }

      throw error;
    });

  const files: ModelSourceFile[] = [...manifest];

  for (const tree of CHECK_TREES) {
    files.push(...(await readTree(root, tree)));
  }

  return files;
}

/** One file as the digest reads it: its path and its bytes. */
export interface ModelRootBytes {
  path: string;
  bytes: Buffer;
}

const readTreeBytes = async (
  root: string,
  relativeDirectory = '',
): Promise<ModelRootBytes[]> => {
  const absolute = path.join(root, relativeDirectory);
  let entries: Dirent[];

  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const files: ModelRootBytes[] = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const relative =
      relativeDirectory === ''
        ? entry.name
        : `${relativeDirectory}/${entry.name}`;

    if (isIgnored(relative)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await readTreeBytes(root, relative)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    files.push({ path: relative, bytes: await readFile(path.join(root, relative)) });
  }

  return files;
}

/** Every file under a fixture model root, with its bytes. */
export async function readModelRootBytes(
  root: string,
): Promise<ModelRootBytes[]> {
  return (await readTreeBytes(root)).sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

/** `sha256:...` over the sorted `path → sha256(bytes)` map. */
export const modelDigestOf = (
  files: readonly { path: string; content: string | Buffer }[],
): string => {
  const hashes: Record<string, string> = {};

  for (const file of files) {
    hashes[file.path] = createHash('sha256').update(file.content).digest('hex');
  }

  const content = JSON.stringify(
    Object.fromEntries(
      Object.entries(hashes).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    ),
  );

  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
};

/** Reads a fixture model root and packs it, reporting problems as issues. */
export async function readModelRoot(
  root: string,
): Promise<PackResult & { files: ModelSourceFile[] }> {
  const files = await readModelRootFiles(root);

  return { ...packModelSourceFiles(files), files };
}
