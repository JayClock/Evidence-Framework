import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  {
    // Local generated resources are never application source.
    ignores: [
      'out/**',
      '.vite/**',
      'dist/**',
      'node_modules/**',
      'resources/**',
    ],
  },
  ...nx.configs['flat/react'],
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
];
