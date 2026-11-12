import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The static presentation assets the workbench page is built from.
 *
 * They live with the skill, not with this package: the same files drive the
 * browser regression test under `.agents/skills/evidence-visualization/tests`,
 * and a copy here would let the two drift. The compiler reads them; the skill
 * owns them.
 */

/** Directory of the assets inside the skill package. */
export const ASSETS_DIRECTORY = path.join(
  'evidence-visualization',
  'assets',
);

export class WorkbenchAssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkbenchAssetError';
  }
}

export interface WorkbenchAssets {
  /** Graph renderer plus the workbench wiring, joined into one script. */
  app: string;
  style: string;
  template: string;
}

export interface ResolveAssetsDirectoryInput {
  /** Directory holding skill packages, i.e. `…/.agents/skills`. */
  skillsRoot?: string | undefined;
  /** Project root that may vendor the skill. */
  projectRoot?: string | undefined;
  /** Where the fallback search climbs from; defaults to `process.cwd()`. */
  searchStartDirectory?: string;
  /** Only for a caller that already knows whether the page template exists. */
  fileExists?: (candidate: string) => boolean;
}

/**
 * Finds the asset directory from a skill root, a project, or the workspace.
 *
 * The order keeps three promises: a packaged app reads the tree it ships, a
 * project that vendors the skill reads its own copy, and a developer in this
 * repository reads the workspace skill. Nothing found is an error naming every
 * path that was tried, because a bare `ENOENT` sends a reader hunting.
 */
export const resolveAssetsDirectory = ({
  skillsRoot,
  projectRoot,
  searchStartDirectory = process.cwd(),
  fileExists = (candidate) => existsSync(path.join(candidate, 'workbench.html')),
}: ResolveAssetsDirectoryInput): string => {
  const candidates: string[] = [];
  const add = (base: string): void => {
    const candidate = path.join(path.resolve(base), ASSETS_DIRECTORY);

    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  };

  if (skillsRoot !== undefined && skillsRoot !== '') {
    add(path.resolve(skillsRoot));
  }

  if (projectRoot !== undefined && projectRoot !== '') {
    add(path.join(path.resolve(projectRoot), '.agents', 'skills'));
  }

  // Climb from the caller's directory and from this module, so a CLI installed
  // with the workspace finds the skill whether it runs from `src` or `dist`.
  for (const start of [
    path.resolve(searchStartDirectory),
    path.dirname(fileURLToPath(import.meta.url)),
  ]) {
    let current = start;

    for (let depth = 0; depth < 8; depth += 1) {
      add(path.join(current, '.agents', 'skills'));

      const parent = path.dirname(current);

      if (parent === current) {
        break;
      }

      current = parent;
    }
  }

  const found = candidates.find((candidate) => fileExists(candidate));

  if (found === undefined) {
    throw new WorkbenchAssetError(
      `找不到工作台静态资源，已尝试：${candidates.join('、')}`,
    );
  }

  return found;
};

/**
 * Reads the four assets and joins the two scripts into one.
 *
 * A missing asset is an error rather than a silently smaller page: a workbench
 * without its graph renderer loads blank, which reads as a broken model.
 */
export const loadWorkbenchAssets = (
  assetsDirectory: string,
  readFile: (target: string) => string = (target) => readFileSync(target, 'utf8'),
): WorkbenchAssets => {
  const read = (name: string): string => {
    try {
      return readFile(path.join(assetsDirectory, name));
    } catch (error) {
      throw new WorkbenchAssetError(
        `无法读取工作台资源 ${name}：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  return {
    app: [read('business-graph.js'), read('workbench.js')].join('\n'),
    style: read('workbench.css'),
    template: read('workbench.html'),
  };
};
