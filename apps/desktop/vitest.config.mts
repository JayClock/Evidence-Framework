import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const workspaceAliases = {
  '@evidence-poc/evidence-schema': path.resolve(
    import.meta.dirname,
    '../../packages/evidence-schema/src/index.ts',
  ),
  '@evidence-poc/evidence-model-core/browser': path.resolve(
    import.meta.dirname,
    '../../packages/evidence-model-core/src/browser.ts',
  ),
  '@evidence-poc/evidence-model-core': path.resolve(
    import.meta.dirname,
    '../../packages/evidence-model-core/src/index.ts',
  ),
  '@evidence-poc/evidence-canvas-interaction': path.resolve(
    import.meta.dirname,
    '../../packages/evidence-canvas-interaction/src/index.ts',
  ),
};

export default defineConfig({
  test: {
    watch: false,
    projects: [
      {
        resolve: { alias: workspaceAliases },
        plugins: [react()],
        test: {
          name: 'renderer',
          root: import.meta.dirname,
          globals: true,
          environment: 'jsdom',
          include: ['renderer/**/*.spec.{ts,tsx}', 'shared/**/*.spec.ts'],
          setupFiles: ['renderer/test-setup.ts'],
        },
      },
      {
        resolve: { alias: workspaceAliases },
        test: {
          name: 'client',
          root: import.meta.dirname,
          globals: true,
          environment: 'node',
          include: ['client/**/*.spec.ts', 'tests/**/*.spec.ts'],
        },
      },
    ],
  },
});
