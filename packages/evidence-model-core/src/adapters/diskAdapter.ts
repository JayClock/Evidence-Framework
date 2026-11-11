import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import {
  MODEL_MANIFEST_PATH,
  MODEL_SOURCE_TREES,
  parseModelSourceFiles,
  serializeDomainModel,
  type ModelSourceFile,
  type ModelSourceParseResult,
} from './modelSourceFiles.js';

export interface WriteModelResult {
  written: string[];
  unchanged: string[];
  removed: string[];
}

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

/** Reads `model.json` plus the three source trees below a model root. */
export async function readModelDirectory(
  root: string,
): Promise<ModelSourceParseResult & { files: ModelSourceFile[] }> {
  const files: ModelSourceFile[] = [
    {
      path: MODEL_MANIFEST_PATH,
      content: await readFile(
        path.join(root, MODEL_MANIFEST_PATH),
        'utf8',
      ).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          return '';
        }

        throw error;
      }),
    },
  ].filter((file) => file.content !== '');

  for (const tree of MODEL_SOURCE_TREES) {
    files.push(...(await readTree(root, tree)));
  }

  return { ...parseModelSourceFiles(files), files };
}

const writeAtomically = async (
  absolute: string,
  content: string,
): Promise<void> => {
  const temporary = `${absolute}.tmp-${randomUUID()}`;

  await writeFile(temporary, content, 'utf8');
  await rename(temporary, absolute);
};

const removeStaleFiles = async (
  root: string,
  desired: ReadonlySet<string>,
): Promise<string[]> => {
  const existing = (
    await Promise.all(
      MODEL_SOURCE_TREES.map((tree) => readTree(root, tree)),
    )
  ).flat();
  const removed: string[] = [];

  for (const file of existing) {
    if (desired.has(file.path)) {
      continue;
    }

    await rm(path.join(root, file.path));
    removed.push(file.path);
  }

  return removed;
};

/**
 * Writes a document to a model root, touching only files that changed.
 *
 * - unchanged files are left byte-identical (no git churn);
 * - new or edited files are written through a temp file and atomic rename;
 * - `.json` files under the three source trees that no longer exist in the
 *   document are removed (rename or delete of a modeled object);
 * - other trees (`validation/`, `generated/`…) are never touched.
 */
export async function writeModelDirectory(
  root: string,
  document: DomainModelDocument,
  options: { sortKeys?: boolean } = {},
): Promise<WriteModelResult> {
  const files = serializeDomainModel(document, options);
  const desired = new Set(files.map((file) => file.path));
  const written: string[] = [];
  const unchanged: string[] = [];

  for (const file of files) {
    const absolute = path.join(root, file.path);
    const current = await readFile(absolute, 'utf8').catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          return undefined;
        }

        throw error;
      },
    );

    if (current === file.content) {
      unchanged.push(file.path);
      continue;
    }

    await mkdir(path.dirname(absolute), { recursive: true });
    await writeAtomically(absolute, file.content);
    written.push(file.path);
  }

  const removed = await removeStaleFiles(root, desired);

  return { written, unchanged, removed };
}
