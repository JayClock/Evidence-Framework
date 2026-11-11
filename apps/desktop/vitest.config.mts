import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

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

/**
 * One project on purpose: the root `vitest.config.mts` discovers workspace
 * configs, and react tests need jsdom while the store tests only use Node APIs
 * that stay available inside the jsdom environment.
 */
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/desktop',
  resolve: { alias: workspaceAliases },
  plugins: [react()],
  test: {
    name: '@evidence-poc/desktop',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: [
      'renderer/**/*.spec.{ts,tsx}',
      'shared/**/*.spec.ts',
      'client/**/*.spec.ts',
      'tests/**/*.spec.ts',
    ],
    setupFiles: ['renderer/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
});
