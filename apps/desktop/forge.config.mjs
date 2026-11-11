import { fileURLToPath } from 'node:url';

import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';

/**
 * Resources `scripts/prepare-desktop-runtime.mjs` writes before packaging.
 *
 * They must live outside `app.asar`: the app runs both the Python interpreter
 * and the skill scripts as subprocesses, which cannot read through the archive.
 * `extraResource` unpacks them into `Contents/Resources` (macOS) / `resources`
 * (Windows, Linux), i.e. the `process.resourcesPath` the resolvers read.
 */
const resourcePath = (name) =>
  fileURLToPath(new URL(`./resources/${name}`, import.meta.url));

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
const config = {
  packagerConfig: {
    name: 'Evidence Modeling',
    appBundleId: 'dev.evidence.modeling',
    asar: true,
    extraResource: [
      resourcePath('skills'),
      resourcePath('python-runtime'),
    ],
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
