import nx from '@nx/eslint-plugin';
import browserPlatform from '../../../tools/eslint/browser-platform.mjs';
import baseConfig from '../../../eslint.config.mjs';

export default [
  ...nx.configs['flat/react'],
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
            '{projectRoot}/vite.config.{js,ts,mjs,mts}',
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
            '{projectRoot}/**/*.spec.{ts,tsx}',
            '{projectRoot}/**/*.test.{ts,tsx}',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  {
    // Registry components are kept close to upstream for easy refreshes.
    files: ['src/assistant-ui/**/*.{ts,tsx}'],
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-empty-function': 'off',
      'jsx-a11y/heading-has-content': 'off',
      'jsx-a11y/anchor-has-content': 'off',
    },
  },
  {
    ignores: ['**/out-tsc'],
  },
];
