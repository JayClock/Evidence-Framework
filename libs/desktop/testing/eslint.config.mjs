import browserPlatform from '../../../tools/eslint-rules/browser-platform.mjs';
import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  // The renderer-side half of this project's `platform:browser` tag: Node
  // builtins are not project-graph nodes, so the tag rule cannot see them.
  ...browserPlatform,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
            '{projectRoot}/vite.config.{js,ts,mjs,mts}',
            '{projectRoot}/vitest.setup.ts',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  {
    ignores: ['**/out-tsc'],
  },
];
