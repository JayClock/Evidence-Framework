import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import {
  WorkbenchAssetError,
  loadWorkbenchAssets,
  resolveAssetsDirectory,
} from '../render/workbenchAssets.js';
import { renderWorkbenchHtml } from '../render/workbenchRenderer.js';
import { publishWorkbench } from '../publish/workbenchPublisher.js';

import {
  collectWorkbench,
  workbenchFingerprint,
  type CollectWorkbenchInput,
  type CollectedWorkbench,
} from './collectWorkbench.js';
import type { WorkbenchData } from '../projection/workbenchProjection.js';

/**
 * Generating the page: read, render, publish.
 *
 * A page is regenerated far more often than it is read from scratch, so a failed
 * run must be uneventful — the previous snapshot stays, the directory keeps its
 * contents, and the next attempt starts from the same inputs.
 */

/** Where a project keeps the page this tool owns. */
export const reviewPagePath = (projectRoot: string): string =>
  path.join(path.resolve(projectRoot), '.evidence', 'views', 'index.html');

export interface GenerateWorkbenchInput extends CollectWorkbenchInput {
  /** Absolute path of the page to write. */
  output: string;
  /** Asset directory; defaults to the skill beside the project or the workspace. */
  assetsDirectory?: string;
  /** Extra input read by {@link collectWorkbench}; defaults to the filesystem. */
  collect?: typeof collectWorkbench;
  render?: (data: WorkbenchData, assets: ReturnType<typeof loadWorkbenchAssets>) => string;
}

export interface GenerateWorkbenchResult {
  output: string;
  data: WorkbenchData;
  collected: CollectedWorkbench;
}

/**
 * Generates the page for one project and writes it only if the inputs held.
 *
 * The fingerprint is taken before the collection and again after rendering, so a
 * model edited while the page was assembled cannot be published as if it were
 * the model that was checked.
 */
export const generateWorkbench = async ({
  output,
  assetsDirectory,
  collect = collectWorkbench,
  render = renderWorkbenchHtml,
  fingerprint = workbenchFingerprint,
  ...input
}: GenerateWorkbenchInput): Promise<GenerateWorkbenchResult> => {
  const root = path.resolve(input.projectRoot);
  const target = path.resolve(output);

  if (path.dirname(target) === target) {
    throw new WorkbenchAssetError('输出必须是文件路径');
  }

  const before = await fingerprint(root);
  const assets = loadWorkbenchAssets(
    assetsDirectory ??
      resolveAssetsDirectory({ projectRoot: root, searchStartDirectory: root }),
  );
  const collected = await collect({ ...input, projectRoot: root, fingerprint });
  const html = render(collected.data, assets);

  if ((await fingerprint(root)) !== before) {
    throw new WorkbenchAssetError('发布前输入变化，保留已有视图');
  }

  await mkdir(path.dirname(target), { recursive: true });
  await publishWorkbench(target, html);

  return { output: target, data: collected.data, collected };
};
