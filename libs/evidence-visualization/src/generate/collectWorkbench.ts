import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildDelivery,
  buildProjection,
  loadDesign,
  loadFmFromDocument,
  type Projection,
} from '@evidence-poc/evidence-api';
import {
  buildFmCheckReport,
  compiledDocument,
  isModelBundlePath,
  loadValidationSuite,
  modelDigestOf,
  readModelRootBytes,
  type FmCheckReport,
  type ValidationSuite,
} from '@evidence-poc/evidence-model-core';

import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { projectWorkbenchDiff } from '../projection/workbenchDiff.js';
import { readWorkbenchModel } from './readWorkbenchModel.js';
import { deliveryViewOf } from '../projection/deliveryView.js';
import { workbenchLayoutOf } from '../projection/workbenchLayout.js';
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
      const insideTree = relative.slice(relativeRoot.length + 1).split('/');

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
  modelRoot?: string,
): Promise<string> => {
  const root = path.resolve(projectRoot);
  const source =
    modelRoot === undefined
      ? path.join(root, MODEL_TREE)
      : path.resolve(modelRoot);
  let files: FingerprintFile[];
  if (source === path.join(root, MODEL_TREE)) {
    files = await collectFiles(root, MODEL_TREE);
  } else {
    const stats = await lstat(source);
    if (!stats.isFile() || stats.isSymbolicLink())
      throw new WorkbenchInputError('替代模型输入必须是普通快照文件');
    files = [{ path: path.basename(source), bytes: await readFile(source) }];
  }
  const design = path.join('.evidence', 'api', 'api.json');

  if (await exists(path.join(root, design))) {
    files.push({
      path: design,
      bytes: await readFile(path.join(root, design)),
    });
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
  /** Optional portable model bundle instead of the project's default FM tree. */
  modelRoot?: string;
  /** An explicitly chosen baseline; used only for the optional diff projection. */
  baselineDocument?: DomainModelDocument;
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

/**
 * Reads the project and projects the page data.
 *
 * The order is the promise: fingerprint first, then the check, then the API
 * projection, then the same fingerprint again. If the two disagree the caller
 * gets no data, because the page would describe a model that no longer exists.
 */
export const collectWorkbench = async ({
  projectRoot,
  modelRoot,
  baselineDocument,
  scopeRefs,
  requireApi = false,
  generatedAt,
  fingerprint = (root) => workbenchFingerprint(root, modelRoot),
}: CollectWorkbenchInput): Promise<CollectedWorkbench> => {
  const root = path.resolve(projectRoot);
  const fmRoot =
    modelRoot === undefined
      ? path.join(root, MODEL_TREE)
      : path.resolve(modelRoot);
  const apiPath = path.join(root, API_DESIGN_PATH);
  const before = await fingerprint(root);
  const apiExists = await exists(apiPath);

  const includeApi = apiExists || requireApi;
  if (includeApi && (scopeRefs === undefined || scopeRefs.length === 0)) {
    throw new WorkbenchInputError(
      '联合审核需要显式 --scope，不能用一致性结果冒充范围完整性',
    );
  }

  const [{ bundle, issues, files }, bytes] = await Promise.all([
    readWorkbenchModel(fmRoot),
    isModelBundlePath(fmRoot)
      ? readFile(fmRoot).then((bytes) => [
          { path: path.basename(fmRoot), bytes },
        ])
      : readModelRootBytes(fmRoot),
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
  if (includeApi && !check.complete) {
    throw new WorkbenchInputError('FM 范围未闭环，不生成联合审核视图');
  }
  const loaded = includeApi
    ? loadFmFromDocument(bundle, { checkReport: check, modelDigest, suite })
    : null;

  if (loaded !== null && loaded.index === null) {
    throw new WorkbenchInputError(
      `FM 未通过，不生成视图：${loaded.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join('；')}`,
    );
  }

  let projection: Projection | null = null;
  let api: WorkbenchApiInput | null = null;

  if (includeApi) {
    const content = apiExists
      ? await readFile(apiPath, 'utf8').catch((error: unknown) => {
          throw new WorkbenchInputError(
            `无法读取 API 设计：${error instanceof Error ? error.message : String(error)}`,
          );
        })
      : '{}';
    const design = loadDesign(apiPath, content);

    if (design.design === null || design.diagnostics.length > 0) {
      throw new WorkbenchInputError(
        `API 设计不可用：${design.diagnostics
          .map((diagnostic) => diagnostic.message)
          .join('；')}`,
      );
    }

    const built = buildProjection({
      design: design.design,
      index: loaded!.index!,
    });
    if (built.projection.digests.model !== check.modelDigest) {
      throw new WorkbenchInputError('FM 在投影期间变化');
    }
    if (built.diagnostics.some((item) => item.severity === 'error')) {
      throw new WorkbenchInputError(
        `API 投影不可用：${built.diagnostics.map((item) => item.message).join('；')}`,
      );
    }
    projection = built.projection;
    api = {
      resources: [
        ...new Map(
          projection.routes.map((route) => [
            route.entityRef,
            {
              id: `resource.${route.entityRef}`,
              entityRef: route.entityRef,
              businessName: route.summary,
            },
          ]),
        ).values(),
      ],
      capabilities: projection.routes.map((route) => ({
        id: route.id,
        method: route.method,
        uri: route.path,
        resourceRef: `resource.${route.entityRef}`,
        businessCapability: route.summary,
        effect: { targetRef: route.entityRef },
      })),
      http: {
        complete: built.diagnostics.length === 0,
        operations: projection.routes.map((route) => ({
          capabilityRef: route.id,
          request: { fields: route.fields },
          responses: route.responses,
        })),
      },
    };
  }

  if ((await fingerprint(root)) !== before) {
    throw new WorkbenchInputError('输入在生成期间变化，保留已有视图');
  }

  const data = projectWorkbenchData({
    model: compiledDocument(bundle) as unknown as CompiledModel,
    // The page carries the placement the canvas computed, from the same
    // document the check accepted, so the drawing and the review agree.
    layout: workbenchLayoutOf(bundle),
    scenarios: suite.scenarios as unknown as readonly Record<string, unknown>[],
    instances: suite.instances as unknown as readonly Record<string, unknown>[],
    simulation: {
      scenarioResults: check.scenarioResults as unknown as readonly Record<
        string,
        unknown
      >[],
    },
    api,
    delivery: deliveryViewOf(projection ?? buildDelivery(bundle)),
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
  });
  if (baselineDocument !== undefined) {
    data.diff = projectWorkbenchDiff(baselineDocument, bundle, data);
  }
  return {
    data,
    check,
    suite,
    projection,
  };
};
