import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import {
  MODEL_README_PATH,
  createEmptyModelBundle,
  isModelBundlePath,
  modelBundleSourceFiles,
  packModelSourceFiles,
  parseModelBundleText,
  serializeModelBundle,
  type DomainModelBundle,
  type ModelBundleParseResult,
  type PackResult,
  type SerializeBundleOptions,
} from './modelBundle.js';
import type { ModelSourceFile, ModelSourceIssue } from './modelSourceFiles.js';

/** Relative location of the FM source tree inside a project root. */
export const MODEL_DIRECTORY = path.join('.evidence', 'fm');

/** Trees a bundle never carries: derived output and another skill's inputs. */
const SKIPPED_TREES = new Set(['generated', 'discovery']);

export interface WriteModelBundleResult {
  written: boolean;
  /** Byte length of the serialized bundle. */
  bytes: number;
}

const isSkippedPath = (relative: string): boolean =>
  relative
    .split('/')
    .some((part) => part.startsWith('.') || part === '__pycache__');

/**
 * Reads every file a bundle should carry: `model.json`, the three source trees,
 * `validation/**` and `README.md`.
 *
 * `generated/` stays behind because it is derived output, and `discovery/`
 * because interview traces belong to Discovery and are never model sources.
 */
async function readSourceTree(root: string): Promise<ModelSourceFile[]> {
  const files: ModelSourceFile[] = [];

  const read = async (relativeDirectory: string): Promise<void> => {
    const absolute = path.join(root, relativeDirectory);
    let entries: Dirent[];

    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }

      throw error;
    }

    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const relative =
        relativeDirectory === ''
          ? entry.name
          : `${relativeDirectory}/${entry.name}`;

      if (isSkippedPath(relative)) {
        continue;
      }

      if (entry.isDirectory()) {
        if (relativeDirectory === '' && SKIPPED_TREES.has(entry.name)) {
          continue;
        }

        await read(relative);
        continue;
      }

      const carried =
        entry.isFile() &&
        (entry.name.endsWith('.json') ||
          (relativeDirectory === '' && entry.name === MODEL_README_PATH));

      if (!carried) {
        continue;
      }

      files.push({
        path: relative,
        content: await readFile(path.join(root, relative), 'utf8'),
      });
    }
  };

  await read('');

  return files;
}

/** Reads `<root>/.evidence/fm` and packs it into one bundle. */
export async function packModelDirectory(
  root: string,
): Promise<PackResult & { files: ModelSourceFile[] }> {
  const files = await readSourceTree(root);

  return { ...packModelSourceFiles(files), files };
}

/** True when `target` exists and is a single-file bundle. */
export async function isModelBundleFile(target: string): Promise<boolean> {
  if (!isModelBundlePath(target)) {
    return false;
  }

  const info = await stat(target).catch(() => null);

  return info?.isFile() === true;
}

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortKeys(entry)]),
  );
};

const canonicalJson = (value: unknown): string =>
  JSON.stringify(sortKeys(value)) ?? 'null';

/**
 * True when the existing file already carries this object.
 *
 * Comparing canonical JSON instead of bytes keeps unpacking from reformatting a
 * hand-written tree whose objects did not change.
 */
const carriesSameJson = (existing: string, desired: unknown): boolean => {
  try {
    return canonicalJson(JSON.parse(existing)) === canonicalJson(desired);
  } catch {
    return false;
  }
};

const writeAtomically = async (
  absolute: string,
  content: string,
): Promise<void> => {
  await mkdir(path.dirname(absolute), { recursive: true });

  const temporary = `${absolute}.tmp-${randomUUID()}`;

  await writeFile(temporary, content, 'utf8');
  await rename(temporary, absolute);
};

const readExisting = async (absolute: string): Promise<string | undefined> =>
  readFile(absolute, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  });

/** Reads a bundle from disk and parses it. */
export async function readModelBundle(
  filePath: string,
  options: { validate?: boolean } = {},
): Promise<ModelBundleParseResult & { content: string }> {
  const content = await readExisting(filePath);

  if (content === undefined || content === '') {
    return {
      document: createEmptyModelBundle(),
      content: '',
      issues: [
        {
          path: filePath,
          message: `bundle file ${filePath} does not exist or is empty.`,
        } satisfies ModelSourceIssue,
      ],
    };
  }

  return { ...parseModelBundleText(content, options), content };
}

/**
 * Writes one document as a bundle, leaving the file untouched when the bytes
 * already match so an idle save produces no git churn.
 */
export async function writeModelBundle(
  filePath: string,
  document: DomainModelDocument | DomainModelBundle,
  options: SerializeBundleOptions = {},
): Promise<WriteModelBundleResult> {
  const content = serializeModelBundle(document, options);
  const bytes = Buffer.byteLength(content);

  if ((await readExisting(filePath)) === content) {
    return { written: false, bytes };
  }

  await writeAtomically(filePath, content);

  return { written: true, bytes };
}

export interface UnpackResult {
  written: string[];
  unchanged: string[];
}

/**
 * Unpacks a bundle back onto a `.evidence/fm` tree.
 *
 * Files the bundle does not name are left alone: unpacking is a migration step,
 * not a destructive reset, so a tree that still holds `generated/` keeps it.
 * Files whose objects already match are not rewritten, so hand formatting and an
 * unchanged git status survive a pack/unpack round trip.
 */
export async function unpackModelBundle(
  filePath: string,
  root: string,
  options: SerializeBundleOptions = {},
): Promise<{
  bundle: DomainModelBundle;
  issues: ModelBundleParseResult['issues'];
  result: UnpackResult;
}> {
  const { document, issues } = await readModelBundle(filePath);
  const written: string[] = [];
  const unchanged: string[] = [];

  for (const file of modelBundleSourceFiles(document, options)) {
    const absolute = path.join(root, file.path);
    const current = await readExisting(absolute);
    const untouched =
      current !== undefined &&
      (file.path.endsWith('.json')
        ? carriesSameJson(current, JSON.parse(file.content))
        : current === file.content);

    if (untouched) {
      unchanged.push(file.path);
      continue;
    }

    await writeAtomically(absolute, file.content);
    written.push(file.path);
  }

  return { bundle: document, issues, result: { written, unchanged } };
}
