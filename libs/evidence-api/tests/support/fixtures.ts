import { fileURLToPath } from 'node:url';

import {
  buildFmCheckReport,
  loadValidationSuite,
  modelDigestOf,
  readModelRoot,
  readModelRootBytes,
} from '@evidence-poc/evidence-model-core';

import { loadFm, type FmIndex } from '../../src/adapter/fmAdapter.js';
import { loadDesign, type DesignDocument } from '../../src/loader/apiLoader.js';

/**
 * Helpers that stand in for the two stages around this one.
 *
 * The FM stage hands over a check report and the design stage hands over an
 * `api.json`; a test has to produce both, and producing them the way the real
 * stages do is what makes the fixture meaningful.
 */

export const API_FIXTURES = fileURLToPath(
  new URL('../../../../.agents/skills/evidence-api/tests/fixtures/', import.meta.url),
);

export const fullLifecycle = (): {
  modelRoot: string;
  designPath: string;
} => ({
  modelRoot: `${API_FIXTURES}full-lifecycle/fm`,
  designPath: `${API_FIXTURES}full-lifecycle/api.json`,
});

/** The report `check_fm` would have produced for a delivered scope. */
export const checkReportFor = async (
  modelRoot: string,
  scopes: readonly string[],
): Promise<Record<string, unknown>> => {
  const { bundle, files, issues } = await readModelRoot(modelRoot);
  const bytes = await readModelRootBytes(modelRoot);
  const { report } = buildFmCheckReport({
    model: bundle,
    suite: loadValidationSuite(files),
    sourceIssues: issues.map((issue) => `${issue.path}: ${issue.message}`),
    modelDigest: modelDigestOf(
      bytes.map((file) => ({ path: file.path, content: file.bytes })),
    ),
    scopeRefs: scopes,
  });

  return report as unknown as Record<string, unknown>;
};

let cachedIndex: FmIndex | undefined;
let cachedDesign: DesignDocument | undefined;

/** The checked model the full-lifecycle design was written against. */
export const fullLifecycleIndex = async (): Promise<FmIndex> => {
  if (cachedIndex === undefined) {
    const { modelRoot } = fullLifecycle();
    const check = await checkReportFor(modelRoot, ['context.product-procurement']);
    const { index, diagnostics } = await loadFm(modelRoot, check);

    if (index === null) {
      throw new Error(`fixture did not load: ${JSON.stringify(diagnostics)}`);
    }

    cachedIndex = index;
  }

  return cachedIndex;
};

/** The design document under test. */
export const fullLifecycleDesign = (): DesignDocument => {
  if (cachedDesign === undefined) {
    const { design, diagnostics } = loadDesign(fullLifecycle().designPath);

    if (design === null || diagnostics.length > 0) {
      throw new Error(`fixture did not load: ${JSON.stringify(diagnostics)}`);
    }

    cachedDesign = design;
  }

  return cachedDesign;
};
