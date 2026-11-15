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
} from '@evidence-poc/evidence-model-core';

/** Reads model sources. The removed validation/ tree is scanned only to reject it. */

/** Tree holding output the checks never read back. */
export const MODEL_GENERATED_TREE = 'generated';

/** Model source trees plus the retired path, detected as a blocking source issue. */
export const MODEL_CHECK_TREES = [...MODEL_SOURCE_TREES, 'validation'] as const;

/** Files the checks never read: generated output, caches and dot directories. */
const isIgnored = (relativePath: string): boolean =>
  relativePath
    .split('/')
    .some(
      (part) =>
        part === MODEL_GENERATED_TREE ||
        part === '__pycache__' ||
        part.startsWith('.'),
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

    if (
      !entry.isFile() ||
      (!entry.name.endsWith('.json') && !relative.startsWith('validation/'))
    ) {
      continue;
    }

    files.push({
      path: relative,
      content: await readFile(path.join(root, relative), 'utf8'),
    });
  }

  return files;
};

/**
 * Every source file under a model root, manifest first.
 *
 * A missing root reads as an empty set rather than throwing, so a caller can
 * report "this directory is not a model" instead of an `ENOENT`.
 */
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

  for (const tree of MODEL_CHECK_TREES) {
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

    files.push({
      path: relative,
      bytes: await readFile(path.join(root, relative)),
    });
  }

  return files;
};

/**
 * Every file under a model root, with its bytes.
 *
 * The digest covers whatever is on disk rather than only the sources: a
 * hand-edited `README.md` or a stray file is input too, and a check that
 * silently ignored it could be invalidated without noticing.
 */
export async function readModelRootBytes(
  root: string,
): Promise<ModelRootBytes[]> {
  return (await readTreeBytes(root)).sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

/**
 * `sha256:...` over the sorted `path → sha256(bytes)` map.
 *
 * Independent of where the tree lives and of the generated output, so a packed
 * and an unpacked copy stay comparable.
 */
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

/** Reads a model root and packs it, reporting file-level problems as issues. */
export async function readModelRoot(
  root: string,
): Promise<PackResult & { files: ModelSourceFile[] }> {
  const files = await readModelRootFiles(root);

  return { ...packModelSourceFiles(files), files };
}
