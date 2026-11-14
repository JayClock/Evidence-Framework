import { createHash } from 'node:crypto';
import { modelBundleSourceFiles } from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import {
  analyzeTraceability,
  buildFmCheckReport,
  loadValidationSuite,
  type FmCheckReport,
  type SimulationReport,
  type TraceabilityDocument,
  type ValidationSuite,
} from '@evidence-poc/evidence-model-core';
import {
  modelDigestOf,
  readModelRoot,
  readModelRootBytes,
} from '@evidence-poc/evidence-model-io';

/**
 * Reads a model root once for every sensor.
 *
 * Every sensor shares one read: the digest, the document and the validation
 * suite all describe the same bytes, which is what makes `inputChanged` honest.
 */
export interface ModelSources {
  model: DomainModelDocument;
  suite: ValidationSuite;
  /** Problems found while reading the sources, as `path: message`. */
  sourceIssues: readonly string[];
  /** `sha256:...` of everything under the root. */
  digest: string;
  /** Re-reads the digest so a source changing mid-check invalidates the result. */
  rereadDigest: () => Promise<string>;
}

export class ModelSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelSourceError';
  }
}

/** Reads a `.evidence/fm` tree, or one `*.evidence.json` bundle beside it. */
export const loadModelSources = async (
  modelRoot: string,
): Promise<ModelSources> => {
  if (modelRoot.endsWith('.evidence.json')) {
    throw new ModelSourceError(
      `native sensors read a model directory, not a bundle: ${modelRoot}`,
    );
  }

  const [{ bundle, issues, files }, bytes] = await Promise.all([
    readModelRoot(modelRoot),
    readModelRootBytes(modelRoot),
  ]);
  const digest = modelDigestOf(
    bytes.map((file) => ({ path: file.path, content: file.bytes })),
  );

  return {
    model: bundle,
    suite: loadValidationSuite(files),
    sourceIssues: issues.map((issue) => `${issue.path}: ${issue.message}`),
    digest,
    rereadDigest: async () => {
      const current = await readModelRootBytes(modelRoot);

      return modelDigestOf(
        current.map((file) => ({ path: file.path, content: file.bytes })),
      );
    },
  };
};

export const modelSourcesFromDocument = (
  model: DomainModelDocument,
): ModelSources => {
  const digest = `sha256:${createHash('sha256').update(JSON.stringify(model)).digest('hex')}`;
  return {
    model,
    suite: loadValidationSuite(modelBundleSourceFiles(model)),
    sourceIssues: [],
    digest,
    rereadDigest: async () => digest,
  };
};

export interface NativeFmCheckOptions {
  scopeRefs?: readonly string[];
  /** Skip the second read; only the desktop's debounced run does that. */
  detectInputChange?: boolean;
}

export interface NativeFmCheckOutcome {
  report: FmCheckReport;
  traceability: TraceabilityDocument;
  simulation: SimulationReport | null;
}

/**
 * Runs the consistency check and, when asked, the scope completeness check.
 *
 * The traceability document is returned beside the report because the key data
 * audit reads the same lineage: computing it twice would let the two disagree.
 */
export const runNativeFmCheck = async (
  sources: ModelSources,
  options: NativeFmCheckOptions = {},
): Promise<NativeFmCheckOutcome> => {
  const traceability = analyzeTraceability(sources.model).document;
  const currentDigest =
    options.detectInputChange === false
      ? undefined
      : await sources.rereadDigest();
  const outcome = buildFmCheckReport({
    model: sources.model,
    suite: sources.suite,
    sourceIssues: sources.sourceIssues,
    modelDigest: sources.digest,
    ...(currentDigest === undefined
      ? {}
      : { currentDigest: () => currentDigest }),
    ...(options.scopeRefs === undefined
      ? {}
      : { scopeRefs: options.scopeRefs }),
  });

  return {
    report: outcome.report,
    traceability,
    simulation: outcome.simulation,
  };
};
