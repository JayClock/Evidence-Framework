import path from 'node:path';

import { isModelBundlePath } from '@evidence-poc/evidence-model-core';
import { MODEL_DIRECTORY } from '@evidence-poc/evidence-model-io';

/**
 * A project root is either a folder holding `.evidence/fm/` or one
 * `*.evidence.json` bundle. Both forms feed the same readers, so path
 * resolution lives here instead of being repeated per caller.
 */
export const isBundleProject = (rootPath: string): boolean =>
  isModelBundlePath(rootPath);

/** Directory that owns `.evidence/`, which a review page is written beside. */
export const projectDirectoryOf = (rootPath: string): string =>
  isBundleProject(rootPath)
    ? path.dirname(path.resolve(rootPath))
    : path.resolve(rootPath);

/** Model source the FM scripts read: one tree, or one bundle file. */
export const modelSourceOf = (rootPath: string): string =>
  isBundleProject(rootPath)
    ? path.resolve(rootPath)
    : path.join(path.resolve(rootPath), MODEL_DIRECTORY);
