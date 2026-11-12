import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildProjection,
  loadDesign,
  loadFm,
  type DesignDocument,
  type Projection,
} from '@evidence-poc/evidence-api';
import {
  buildFmCheckReport,
  loadValidationSuite,
  modelDigestOf,
  readModelRoot,
  readModelRootBytes,
  type FmCheckReport,
  type ValidationSuite,
} from '@evidence-poc/evidence-model-core';

import {
  projectWorkbenchData,
  type CompiledModel,
  type WorkbenchApiInput,
  type WorkbenchData,
} from '../projection/workbenchProjection.js';

/**
 * Reading one project into the data the workbench page shows.
 *
 * The page is only built from inputs that agree: the check must pass, the digest
 * the API projection recorded must be the digest the check proved, and nothing
 * may change while the page is assembled. A snapshot that quietly mixed two
 * versions of the model would be the most convincing kind of wrong.
 */

/** The model tree the page describes. */
export const MODEL_TREE = path.join('.evidence', 'fm');

/** The API design a joint review adds to the page. */
export const API_DESIGN_PATH = path.join('.evidence', 'api', 'api.json');

/** The recorded interview, which attaches to the Evidence it cites. */
export const TRACE_PATH = path.join('.evidence', 'traces', 'interview-trace.json');

/** Trees and caches the fingerprint ignores, because nothing there is input. */
const IGNORED_TREES = new Set(['generated']);
const IGNORED_PARTS = new Set(['__pycache__']);

export class WorkbenchInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkbenchInputError';
  }
}

interface FingerprintFile {
  /** POSIX path relative to the project root. */
  path: string;
  bytes: Buffer;
}

const isMissing = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';

/**
 * Every input file below one tree, as a path and its bytes.
 *
 * A symbolic link is refused rather than followed: the page describes one
 * project, and a link would let it carry a file the reader was never given.
 */
const collectFiles = async (
  projectRoot: string,
  relativeRoot: string,
): Promise<FingerprintFile[]> => {
  const files: FingerprintFile[] = [];

  const walk = async (relativeDirectory: string): Promise<void> => {
    let entries: Dirent[];

    try {
      entries = await readdir(path.join(projectRoot, relativeDirectory), {
        withFileTypes: true,
      });
    } catch (error) {
      if (isMissing(error)) {
        return;
      }

      throw error;
    }

    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const relative = `${relativeDirectory}/${entry.name}`;
      const insideTree = relative
        .slice(relativeRoot.length + 1)
        .split('/');

      if (insideTree.some((part) => IGNORED_PARTS.has(part))) {
        continue;
      }
      if (insideTree.length > 1 && IGNORED_TREES.has(insideTree[0] as string)) {
        continue;
      }

      const absolute = path.join(projectRoot, relative);
      const stats = await lstat(absolute);

      if (stats.isSymbolicLink()) {
        throw new WorkbenchInputError('输入不能链接到项目外部或使用符号链接');
      }

      if (stats.isDirectory()) {
        await walk(relative);
        continue;
      }

      if (stats.isFile()) {
        files.push({ path: relative, bytes: await readFile(absolute) });
      }
    }
  };

  await walk(relativeRoot);

  return files;
};

const exists = async (target: string): Promise<boolean> => {
  try {
    await lstat(target);

    return true;
  } catch (error) {
    if (isMissing(error)) {
      return false;
    }

    throw error;
  }
};

/**
 * One digest over every input the page depends on.
 *
 * The model tree and the API design both count: regenerating after a design edit
 * must not look like a no-op. `generated/` and `__pycache__` do not count,
 * because the page never reads them and a previous run would otherwise change
 * its own input.
 */
export const workbenchFingerprint = async (
  projectRoot: string,
): Promise<string> => {
  const root = path.resolve(projectRoot);
  const files = await collectFiles(root, path.join('.evidence', 'fm'));
  const design = path.join('.evidence', 'api', 'api.json');

  if (await exists(path.join(root, design))) {
    files.push({ path: design, bytes: await readFile(path.join(root, design)) });
  }

  const digest = createHash('sha256');
  const ordered = [...files].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );

  for (const file of ordered) {
    digest.update(file.path);
    digest.update('\u0000');
    digest.update(file.bytes);
    digest.update('\u0000');
  }

  return digest.digest('hex');
};

export interface CollectWorkbenchInput {
  /** Absolute project root that owns `.evidence/`. */
  projectRoot: string;
  /** Independent Context IDs the review covers; required once an API exists. */
  scopeRefs?: readonly string[];
  /** Refuse to fall back to a model-only page when an API is expected. */
  requireApi?: boolean;
  /** ISO timestamp the page prints; defaults to the moment of generation. */
  generatedAt?: string;
  /** Injected by a test that must observe the change detection. */
  fingerprint?: (projectRoot: string) => Promise<string>;
}

/** What one collection produced, with the reports it was allowed to use. */
export interface CollectedWorkbench {
  data: WorkbenchData;
  check: FmCheckReport;
  suite: ValidationSuite;
  projection: Projection | null;
}

const readJsonFile = async (target: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(target, 'utf8')) as unknown;
  } catch (error) {
    throw new WorkbenchInputError(
      `无法读取 JSON：${target}（${error instanceof Error ? error.message : String(error)}）`,
    );
  }
};

const bindingsOf = (design: DesignDocument): readonly Record<string, unknown>[] =>
  Array.isArray(design['bindings'])
    ? design['bindings'].filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      )
    : [];

/** The recorded traces, or none when the project has not interviewed anyone. */
const readTraces = async (
  projectRoot: string,
): Promise<readonly Record<string, unknown>[]> => {
  const target = path.join(projectRoot, TRACE_PATH);

  if (!(await exists(target))) {
    return [];
  }

  const document = await readJsonFile(target);
  const traces =
    typeof document === 'object' &&
    document !== null &&
    Array.isArray((document as Record<string, unknown>)['traces'])
      ? (document as Record<string, unknown>)['traces']
      : null;

  return Array.isArray(traces)
    ? traces.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      )
    : [];
};

/**
 * Reads the project and projects the page data.
 *
 * The order is the promise: fingerprint first, then the check, then the API
 * projection, then the same fingerprint again. If the two disagree the caller
 * gets no data, because the page would describe a model that no longer exists.
 */
export const collectWorkbench = async ({
  projectRoot,
  scopeRefs,
  requireApi = false,
  generatedAt,
  fingerprint = workbenchFingerprint,
}: CollectWorkbenchInput): Promise<CollectedWorkbench> => {
  const root = path.resolve(projectRoot);
  const fmRoot = path.join(root, MODEL_TREE);
  const apiPath = path.join(root, API_DESIGN_PATH);
  const before = await fingerprint(root);
  const apiExists = await exists(apiPath);

  if (requireApi && !apiExists) {
    throw new WorkbenchInputError(
      '联合审核需要当前 .evidence/api/api.json，不生成 FM 单独页面',
    );
  }

  if (apiExists && (scopeRefs === undefined || scopeRefs.length === 0)) {
    throw new WorkbenchInputError(
      '联合审核需要显式 --scope，不能用一致性结果冒充范围完整性',
    );
  }

  const [{ bundle, issues, files }, bytes] = await Promise.all([
    readModelRoot(fmRoot),
    readModelRootBytes(fmRoot),
  ]);
  const modelDigest = modelDigestOf(
    bytes.map((file) => ({ path: file.path, content: file.bytes })),
  );
  const suite = loadValidationSuite(files);
  const checked = buildFmCheckReport({
    model: bundle,
    suite,
    sourceIssues: issues.map((issue) => `${issue.path}: ${issue.message}`),
    modelDigest,
    ...(scopeRefs === undefined ? {} : { scopeRefs }),
  });

  if (!checked.report.valid || checked.report.inputChanged) {
    throw new WorkbenchInputError('FM 未通过，不生成视图');
  }

  const check = checked.report;
  const loaded = await loadFm(fmRoot, check);

  if (loaded.index === null) {
    throw new WorkbenchInputError(
      `FM 未通过，不生成视图：${loaded.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join('；')}`,
    );
  }

  let projection: Projection | null = null;
  let api: WorkbenchApiInput | null = null;

  if (apiExists) {
    const content = await readFile(apiPath, 'utf8').catch((error: unknown) => {
      throw new WorkbenchInputError(
        `无法读取 API 设计：${error instanceof Error ? error.message : String(error)}`,
      );
    });
    const design = loadDesign(apiPath, content);

    if (design.design === null) {
      throw new WorkbenchInputError(
        `API 设计不可用：${design.diagnostics
          .map((diagnostic) => diagnostic.message)
          .join('；')}`,
      );
    }

    const built = buildProjection({
      design: design.design,
      index: loaded.index,
      projectRoot: root,
      apiContent: content,
    });
    const summary = built.projection.fmCheckSummary;
    const projected =
      typeof summary === 'object' && summary !== null
        ? (summary as Record<string, unknown>)['modelDigest']
        : undefined;

    if (projected !== check.modelDigest) {
      throw new WorkbenchInputError('FM 在投影期间变化');
    }

    projection = built.projection;
    api = {
      resources: projection.resources as readonly Record<string, unknown>[],
      capabilities: projection.capabilities as readonly Record<string, unknown>[],
      bindings: bindingsOf(design.design),
      http: projection.http as WorkbenchApiInput['http'],
    };
  }

  const traces = await readTraces(root);

  if ((await fingerprint(root)) !== before) {
    throw new WorkbenchInputError('输入在生成期间变化，保留已有视图');
  }

  return {
    data: projectWorkbenchData({
      model: loaded.index.compiled as unknown as CompiledModel,
      scenarios: suite.scenarios as unknown as readonly Record<string, unknown>[],
      instances: suite.instances as unknown as readonly Record<string, unknown>[],
      simulation: {
        scenarioResults: check.scenarioResults as unknown as readonly Record<
          string,
          unknown
        >[],
      },
      api,
      traces,
      check: {
        consistent: check.consistent,
        complete: check.complete,
        scopeRefs: check.scopeRefs,
        contextRefs: check.contextRefs,
        gaps: check.gaps,
        simulationLimitations: check.simulationLimitations,
        simulationPassed: check.simulationPassed,
        timelineSummary: check.timelineSummary,
      },
      ...(generatedAt === undefined ? {} : { generatedAt }),
    }),
    check,
    suite,
    projection,
  };
};
