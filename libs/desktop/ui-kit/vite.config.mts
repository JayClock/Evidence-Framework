import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Workspace packages resolve from `src` through the `@evidence-poc/source`
 * export condition, the same way the app and the other libraries resolve them.
 */
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/desktop/ui-kit',
  plugins: [react()],
  resolve: {
    conditions: ['@evidence-poc/source', 'module', 'browser'],
  },
  test: {
    name: 'desktop-ui-kit',
    watch: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['../testing/vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
