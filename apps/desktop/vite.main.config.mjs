import path from 'node:path';

import { defineConfig } from 'vite';

/**
 * Workspace packages resolve to their `src` entry so `electron-forge start`
 * never needs a prebuilt `dist`.
 */
const workspaceAliases = {
  '@evidence-poc/evidence-schema': path.resolve(
    import.meta.dirname,
    '../../packages/evidence-schema/src/index.ts',
  ),
  '@evidence-poc/evidence-model-core/browser': path.resolve(
    import.meta.dirname,
    '../../packages/evidence-model-core/src/browser.ts',
  ),
  '@evidence-poc/evidence-model-core': path.resolve(
    import.meta.dirname,
    '../../packages/evidence-model-core/src/index.ts',
  ),
  '@evidence-poc/evidence-canvas-interaction': path.resolve(
    import.meta.dirname,
    '../../packages/evidence-canvas-interaction/src/index.ts',
  ),
};

export default defineConfig({
  resolve: { alias: workspaceAliases },
});
