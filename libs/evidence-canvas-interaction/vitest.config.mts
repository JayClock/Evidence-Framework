import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  resolve: {
    conditions: ['@evidence-poc/source'],
  },
  cacheDir: '../../node_modules/.vite/libs/evidence-canvas-interaction',
  test: {
    name: '@evidence-poc/evidence-canvas-interaction',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
