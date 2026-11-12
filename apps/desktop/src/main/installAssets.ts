import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Directory `extraResource` unpacks beside the archive (`forge.config.mjs`).
 *
 * It sits outside `app.asar` because the page compiler reads the four files with
 * `node:fs` and joins two of them into one script before writing HTML.
 */
export const BUNDLED_ASSETS_DIRECTORY = 'assets';

/** Directory a development run copies them into, relative to the app root. */
export const DEVELOPMENT_ASSETS_DIRECTORY = path.join(
  'resources',
  BUNDLED_ASSETS_DIRECTORY,
);

/** The package that owns the assets a development run reads. */
export const WORKSPACE_ASSETS_DIRECTORY = path.join(
  'libs',
  'evidence-visualization',
  BUNDLED_ASSETS_DIRECTORY,
);

export interface ReviewAssetsOptions {
  /** `app.isPackaged`: an installer reads the unpacked copy, a checkout does not. */
  isPackaged: boolean;
  /** `process.resourcesPath`; `dirname(appPath)` when a caller omits it. */
  resourcesPath?: string | undefined;
  /** `app.getAppPath()` — `apps/desktop` in development, `app.asar` when packaged. */
  appPath: string;
  /** Injected by a test that must not touch the filesystem. */
  fileExists?: (candidate: string) => boolean;
}

const hasPage = (candidate: string): boolean =>
  existsSync(path.join(candidate, 'workbench.html'));

/**
 * Where the review page assets are on this machine.
 *
 * There is no search up the tree: a packaged install reads the directory the
 * installer unpacked next to `app.asar`, and a development run reads either
 * `resources/assets` after `prepare-resources` copied it or the workspace
 * package it came from. Returning `undefined` lets the library name the paths it
 * tried instead of silently compiling an empty page.
 */
export const resolveReviewAssetsDirectory = ({
  isPackaged,
  resourcesPath,
  appPath,
  fileExists = hasPage,
}: ReviewAssetsOptions): string | undefined => {
  const root = path.resolve(appPath);
  const candidates = isPackaged
    ? [
        path.join(
          path.resolve(resourcesPath ?? path.dirname(root)),
          BUNDLED_ASSETS_DIRECTORY,
        ),
      ]
    : [
        path.join(root, DEVELOPMENT_ASSETS_DIRECTORY),
        path.join(root, '..', '..', WORKSPACE_ASSETS_DIRECTORY),
      ];

  return candidates.find((candidate) => fileExists(candidate));
};
