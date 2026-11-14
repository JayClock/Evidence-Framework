import { readFile } from 'node:fs/promises';
import {
  isModelBundlePath,
  modelBundleSourceFiles,
  parseModelBundleText,
} from '@evidence-poc/evidence-model-core';
import { readModelRoot } from '@evidence-poc/evidence-model-io';

/** One source reader for previews/exports; the bundle retains its validation suite. */
export const readWorkbenchModel = async (
  source: string,
): ReturnType<typeof readModelRoot> => {
  if (!isModelBundlePath(source)) return readModelRoot(source);
  const parsed = parseModelBundleText(await readFile(source, 'utf8'));
  return {
    bundle: parsed.document,
    issues: parsed.issues,
    files: modelBundleSourceFiles(parsed.document),
  };
};
