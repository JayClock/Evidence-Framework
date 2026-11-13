import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/evidence-visualization',
  resolve: { conditions: ['@evidence-poc/source', 'node', 'import'] },
  test: {
    name: 'evidence-visualization',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // `tests/node` and `tests/browser` hold `node:test` harnesses that drive the
    // page assets in a VM or a real Chrome; they run through `node --test`, not
    // through Vitest, and would otherwise be collected here and fail to load.
    exclude: ['tests/node/**', 'tests/browser/**'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
