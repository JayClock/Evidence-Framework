import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

it('bundles the browser entry without Node built-ins', async () => {
  const builtins = new Set(builtinModules);

  await build({
    configFile: false,
    logLevel: 'silent',
    resolve: {
      conditions: ['@evidence-poc/source', 'module', 'browser'],
    },
    plugins: [
      {
        name: 'reject-node-builtins',
        enforce: 'pre',
        resolveId(id) {
          if (id.startsWith('node:') || builtins.has(id)) {
            throw new Error(`Browser entry imports Node built-in: ${id}`);
          }
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL('./browser.ts', import.meta.url)),
        formats: ['es'],
      },
    },
  });
});
