import { defineConfig } from 'vite';

/**
 * The preload bridge only imports types, but it resolves the same way as the
 * main process so a future runtime import of a workspace package keeps working.
 *
 * Electron Forge names the bundle after the entry file, so `src/preload/index.ts`
 * would emit `.vite/build/index.js`. Pin the name the window code loads.
 */
export default defineConfig({
  resolve: {
    conditions: [
      '@evidence-poc/source',
      'node',
      'module',
      'development|production',
    ],
  },
  build: {
    rollupOptions: {
      output: { entryFileNames: 'preload.js' },
    },
  },
});
