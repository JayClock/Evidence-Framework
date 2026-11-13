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
  ssr: { resolve: { conditions: ['@evidence-poc/source', 'node', 'import'] } },
  test: {
    name: '@evidence-poc/desktop',
    server: { deps: { inline: [/@evidence-poc\//] } },
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: [
      'src/renderer/**/*.spec.{ts,tsx}',
      'src/shared/**/*.spec.ts',
      'src/main/**/*.spec.ts',
      'tests/**/*.spec.ts',
    ],
    setupFiles: ['src/renderer/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
});
