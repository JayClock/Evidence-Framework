import { defineConfig } from 'vite';

/**
 * The preload bridge only imports types, but it resolves the same way as the
 * main process so a future runtime import of a workspace package keeps working.
 */
export default defineConfig({
  resolve: {
    conditions: ['@evidence-poc/source', 'node', 'module', 'development|production'],
  },
});
