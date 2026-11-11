import path from 'node:path';

import {
  MODEL_DIRECTORY,
  isModelBundlePath,
} from '@evidence-poc/evidence-model-core';

/** Relative location of the interview transcript inside `.evidence/`. */
export const TRACE_RELATIVE_PATH = path.join(
  '.evidence',
  'traces',
  'interview-trace.json',
);

/**
 * A project root is either a folder holding `.evidence/fm/` or one
 * `*.evidence.json` bundle. Both forms feed the same readers, so path
 * resolution lives here instead of being repeated per caller.
 */
export const isBundleProject = (rootPath: string): boolean =>
  isModelBundlePath(rootPath);

/** Directory that owns `.evidence/`, i.e. where traces and branches live. */
export const projectDirectoryOf = (rootPath: string): string =>
  isBundleProject(rootPath)
    ? path.dirname(path.resolve(rootPath))
    : path.resolve(rootPath);

/** Model source the FM scripts read: one tree, or one bundle file. */
export const modelSourceOf = (rootPath: string): string =>
  isBundleProject(rootPath)
    ? path.resolve(rootPath)
    : path.join(path.resolve(rootPath), MODEL_DIRECTORY);

/** `<project>/.evidence/traces/interview-trace.json`. */
export const tracePathOf = (rootPath: string): string =>
  path.join(projectDirectoryOf(rootPath), TRACE_RELATIVE_PATH);
