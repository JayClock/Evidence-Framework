import { fileURLToPath } from 'node:url';

import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';

/**
 * Resources `scripts/prepare-desktop-resources.mjs` writes before packaging.
 *
 * The sensors and the page compiler run in-process, so the app needs no
 * interpreter beside `app.asar`. It does need the four files the review page is
 * assembled from, and they live outside the archive so the compiler can read
 * them with `node:fs`. `extraResource` unpacks the directory into
 * `Contents/Resources` (macOS) / `resources` (Windows, Linux), i.e. the
 * `process.resourcesPath` the resolver reads.
 */
const resourcePath = (name) =>
  fileURLToPath(new URL(`./resources/${name}`, import.meta.url));

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
const config = {
  packagerConfig: {
    name: 'Evidence Modeling',
    appBundleId: 'dev.evidence.modeling',
    asar: true,
    extraResource: [resourcePath('assets')],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.mjs',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.mjs',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mjs',
        },
      ],
    }),
  ],
};

export default config;
