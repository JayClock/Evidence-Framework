import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const workspaceAliases = {
  '@evidence-poc/evidence-schema': path.resolve(
    import.meta.dirname,
    '../../packages/evidence-schema/src/index.ts',
  ),
  '@evidence-poc/evidence-agent-core': path.resolve(
    import.meta.dirname,
    '../../packages/evidence-agent-core/src/index.ts',
  ),
  '@evidence-poc/evidence-modeling-orchestrator': path.resolve(
    import.meta.dirname,
    '../../packages/evidence-modeling-orchestrator/src/browser.ts',
  ),
  '@evidence-poc/evidence-modeling-orchestrator/browser': path.resolve(
    import.meta.dirname,
    '../../packages/evidence-modeling-orchestrator/src/browser.ts',
  ),
  '@evidence-poc/evidence-model-core/browser': path.resolve(
    import.meta.dirname,
    '../../packages/evidence-model-core/src/browser.ts',
  ),
  '@evidence-poc/evidence-canvas-interaction': path.resolve(
    import.meta.dirname,
    '../../packages/evidence-canvas-interaction/src/index.ts',
  ),
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: workspaceAliases },
  build: {
    outDir: '.vite/renderer/main_window',
    emptyOutDir: true,
  },
  server: {
    port: 4200,
    strictPort: true,
  },
});
