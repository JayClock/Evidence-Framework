import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BUNDLED_ASSETS_DIRECTORY,
  resolveReviewAssetsDirectory,
} from './installAssets';

const RESOURCES = '/Applications/Evidence Modeling.app/Contents/Resources';
const PACKAGED_APP = path.join(RESOURCES, 'app.asar');
const DEV_APP = '/repo/apps/desktop';

describe('resolveReviewAssetsDirectory', () => {
  it('reads the directory an installer unpacked beside app.asar', () => {
    const bundled = path.join(RESOURCES, BUNDLED_ASSETS_DIRECTORY);

    expect(
      resolveReviewAssetsDirectory({
        isPackaged: true,
        resourcesPath: RESOURCES,
        appPath: PACKAGED_APP,
        fileExists: (candidate) => candidate === bundled,
      }),
    ).toBe(bundled);
  });

  it('falls back to dirname(appPath) when resourcesPath is not published', () => {
    const bundled = path.join(RESOURCES, BUNDLED_ASSETS_DIRECTORY);

    expect(
      resolveReviewAssetsDirectory({
        isPackaged: true,
        appPath: PACKAGED_APP,
        fileExists: (candidate) => candidate === bundled,
      }),
    ).toBe(bundled);
  });

  it('prefers the copied directory and then the workspace package while developing', () => {
    const copied = path.join(DEV_APP, 'resources', BUNDLED_ASSETS_DIRECTORY);
    const workspace = path.join(
      '/repo',
      'libs',
      'evidence-visualization',
      BUNDLED_ASSETS_DIRECTORY,
    );

    expect(
      resolveReviewAssetsDirectory({
        isPackaged: false,
        appPath: DEV_APP,
        fileExists: (candidate) => candidate === copied,
      }),
    ).toBe(copied);

    expect(
      resolveReviewAssetsDirectory({
        isPackaged: false,
        appPath: DEV_APP,
        fileExists: (candidate) => candidate === workspace,
      }),
    ).toBe(workspace);
  });

  it('reports nothing found so the library can name the paths it tried', () => {
    expect(
      resolveReviewAssetsDirectory({
        isPackaged: false,
        appPath: DEV_APP,
        fileExists: () => false,
      }),
    ).toBeUndefined();
  });
});
