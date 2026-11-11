import { fileURLToPath } from 'node:url';

import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';

/**
 * Resources `scripts/prepare-desktop-resources.mjs` writes before packaging.
 *
 * Only the skill tree travels: the sensors run in-process, so the app needs no
 * interpreter beside `app.asar`. It must still live outside the archive, because
 * Pi lists the skill directory with `node:fs` and opens the fixtures by path.
 * `extraResource` unpacks it into `Contents/Resources` (macOS) / `resources`
 * (Windows, Linux), i.e. the `process.resourcesPath` the resolver reads.
 */
const resourcePath = (name) =>
  fileURLToPath(new URL(`./resources/${name}`, import.meta.url));

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
const config = {
  packagerConfig: {
    name: 'Evidence Modeling',
    appBundleId: 'dev.evidence.modeling',
    asar: true,
    extraResource: [resourcePath('skills')],
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
