import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  {
    // `resources/` is `scripts/prepare-desktop-runtime.mjs` output: the bundled
    // skills tree and the portable interpreter, neither written by us.
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
