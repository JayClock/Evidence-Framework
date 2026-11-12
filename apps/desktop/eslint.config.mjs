import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  {
    // `resources/` is `scripts/prepare-desktop-resources.mjs` output: the page
    // assets copied out of `libs/evidence-visualization`, not written here.
    ignores: ['out/**', '.vite/**', 'dist/**', 'node_modules/**', 'resources/**'],
  },
  ...nx.configs['flat/react'],
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
];
