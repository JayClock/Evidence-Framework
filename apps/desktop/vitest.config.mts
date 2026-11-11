import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * One project on purpose: the root `vitest.config.mts` discovers workspace
 * configs, and react tests need jsdom while the store tests only use Node APIs
 * that stay available inside the jsdom environment.
 *
 * Workspace packages resolve through the `@evidence-poc/source` export
 * condition, the same way `vite.*.config.mjs` and `tsconfig.base.json` do.
 */
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/desktop',
  plugins: [react()],
  resolve: {
    conditions: [
      '@evidence-poc/source',
      'module',
      'browser',
      'development|production',
    ],
  },
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
