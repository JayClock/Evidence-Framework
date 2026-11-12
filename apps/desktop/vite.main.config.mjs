import { defineConfig } from 'vite';

/**
 * Workspace packages are consumed from `src` through the `@evidence-poc/source`
 * export condition declared in their `package.json`, mirroring
 * `customConditions` in `tsconfig.base.json`. That keeps this config free of a
 * package-by-package alias table that has to be updated on every new library.
 *
 * Electron Forge adds `node` to the condition list for the main target, and
 * every Node built-in stays external via its own config.
 */
const SOURCE_CONDITIONS = [
  '@evidence-poc/source',
  'module',
  'development|production',
];

export default defineConfig({
  resolve: { conditions: SOURCE_CONDITIONS },
  build: {
    // `@electron-forge/plugin-vite` emits CJS without `build.ssr: true`, so
    // Vite 8's Rolldown defaults to `platform: 'browser'` and turns
    // `import.meta.url` into `{}.url` (`undefined`), breaking `createRequire`.
    rolldownOptions: {
      platform: 'node',
    },
  },
});
