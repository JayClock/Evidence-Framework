import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Workspace packages resolve from `src` via the `@evidence-poc/source` export
 * condition instead of a hand-maintained alias table.
 *
 * The renderer must stay Node-free, so it imports the `/browser` entry of every
 * library that also ships a disk or MCP adapter.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Override Forge's default so linked workspace packages stay source, not optimized deps.
    preserveSymlinks: false,
    conditions: [
      '@evidence-poc/source',
      'module',
      'browser',
      'development|production',
    ],
  },
  build: {
    outDir: '.vite/renderer/main_window',
    emptyOutDir: true,
  },
  server: {
    port: 4200,
    strictPort: true,
  },
});
