import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/evidence-api',
  resolve: {
    conditions: ['@evidence-poc/source', 'node', 'import', 'default'],
  },
  ssr: {
    resolve: {
      conditions: ['@evidence-poc/source', 'node', 'import', 'default'],
    },
  },
  test: {
    name: 'evidence-api',
    server: { deps: { inline: [/@evidence-poc\//] } },
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
