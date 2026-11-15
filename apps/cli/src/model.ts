import { isModelBundlePath } from '@evidence-poc/evidence-model-core';
import {
  readModelBundle,
  readModelRoot,
} from '@evidence-poc/evidence-model-io';

export async function loadModel(source: string) {
  const parsed = isModelBundlePath(source)
    ? await readModelBundle(source).then(({ document, issues }) => ({
        model: document,
        issues,
      }))
    : await readModelRoot(source).then(({ bundle, issues }) => ({
        model: bundle,
        issues,
      }));
  if (parsed.issues.length)
    throw new Error(
      `FM_INVALID:\n${parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')}`,
    );
  return parsed.model;
}
