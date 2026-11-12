import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The static presentation assets the workbench page is built from.
 *
 * They ship inside this package (`assets/` beside `src/` and `dist/`), so the
 * page is generated from the install and never from a file the project happens
 * to keep. The same files drive the browser regression tests under `tests/`.
 */

/** Directory name, inside the package root, that holds the four assets. */
export const ASSETS_DIRECTORY = 'assets';

/**
 * The assets this package ships, or `undefined` when the module URL cannot name
 * them.
 *
 * It is resolved per call rather than at module load: a bundler may rewrite
 * `import.meta.url` (the desktop main bundle does), and a host that ships its own
 * copy passes one in. `src/render/` and `dist/render/` sit at the same depth, so
 * one expression covers a workspace consumer and an installed one.
 */
export const builtinAssetsDirectory = (): string | undefined => {
  try {
    return fileURLToPath(new URL('../../assets', import.meta.url));
  } catch {
    return undefined;
  }
};

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
  /** Explicit directory, for a host that ships its own copy or a test. */
  assetsDirectory?: string | undefined;
  /**
   * `process.resourcesPath` of a packaged Electron app.
   *
   * The desktop bundle carries its own path inside `app.asar`, so a packaged
   * install points the compiler at the `assets` directory unpacked beside the
   * archive instead of relying on the bundle's location.
   */
  resourcesPath?: string | undefined;
  /** Only for a caller that already knows whether the page template exists. */
  fileExists?: (candidate: string) => boolean;
}

const hasTemplate = (candidate: string): boolean =>
  existsSync(path.join(candidate, 'workbench.html'));

/**
 * Picks the asset directory: an explicit override, then the packaged copy, then
 * the one this package ships.
 *
 * There is no search up the filesystem and no project-local lookup: the assets
 * belong to the install, so the only thing that can vary is where an installer
 * put them. Naming the paths that were tried matters because a bare `ENOENT`
 * sends a reader hunting.
 */
export const resolveAssetsDirectory = ({
  assetsDirectory,
  resourcesPath,
  fileExists = hasTemplate,
}: ResolveAssetsDirectoryInput = {}): string => {
  // An explicit directory is the caller's statement about where its copy lives;
  // `loadWorkbenchAssets` names the missing file if the caller was wrong.
  if (assetsDirectory !== undefined && assetsDirectory.trim() !== '') {
    return path.resolve(assetsDirectory);
  }

  const candidates: string[] = [];

  if (resourcesPath !== undefined && resourcesPath.trim() !== '') {
    candidates.push(
      path.join(path.resolve(resourcesPath), ASSETS_DIRECTORY),
    );
  }

  const builtin = builtinAssetsDirectory();

  if (builtin !== undefined) {
    candidates.push(builtin);
  }

  const found = candidates.find((candidate) => fileExists(candidate));

  if (found === undefined) {
    throw new WorkbenchAssetError(
      `找不到工作台静态资源，已尝试：${candidates.join('、') || '（没有可用的候选路径）'}`,
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
