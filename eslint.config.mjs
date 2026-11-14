import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // Apps compose libraries; a library never reaches into an app.
            // Without this the workspace-wide `*` rule accepted any edge, so a
            // package could import the Electron main process.
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: ['type:lib'],
            },
            {
              sourceTag: 'type:lib',
              onlyDependOnLibsWithTags: ['type:lib'],
            },

            // The architectural rings, outermost last. Each ring may only
            // depend on the rings below it, and on itself: `canvas-interaction`
            // composes `model-core`, `evidence-visualization` composes
            // `evidence-api`. Nothing below may reach upward, which is what
            // kept failing silently before: `tsc` resolves the path, so only
            // this rule notices a schema importing a projection.
            {
              // The vocabulary and the AST every other ring reads.
              sourceTag: 'layer:schema',
              onlyDependOnLibsWithTags: [],
            },
            {
              // Pure in-memory engines: the graph, CEL, simulation, geometry.
              sourceTag: 'layer:domain',
              onlyDependOnLibsWithTags: ['layer:schema', 'layer:domain'],
            },
            {
              // Disk and file adapters: Node only, but never a projection.
              sourceTag: 'layer:io',
              onlyDependOnLibsWithTags: ['layer:domain', 'layer:schema'],
            },
            {
              // Stateless presentational controls; a feature composes them,
              // they never compose a feature.
              sourceTag: 'layer:ui',
              onlyDependOnLibsWithTags: ['layer:ui', 'layer:schema'],
            },
            {
              // Delivery projections: API contracts and the review page.
              sourceTag: 'layer:projection',
              onlyDependOnLibsWithTags: [
                'layer:projection',
                'layer:domain',
                'layer:io',
                'layer:schema',
              ],
            },
            {
              // The agent harness, its sensors and the MCP bridge.
              sourceTag: 'layer:orchestration',
              onlyDependOnLibsWithTags: [
                'layer:orchestration',
                'layer:projection',
                'layer:domain',
                'layer:io',
                'layer:schema',
              ],
            },
            {
              // Feature libraries assemble the rings below them for one screen.
              sourceTag: 'layer:feature',
              onlyDependOnLibsWithTags: [
                'layer:feature',
                'layer:ui',
                'layer:orchestration',
                'layer:projection',
                'layer:domain',
                'layer:schema',
                'layer:testing',
              ],
            },
            {
              // Fixtures and render harnesses: read-only for the rings above,
              // and never a place to put production behaviour.
              sourceTag: 'layer:testing',
              onlyDependOnLibsWithTags: [
                'layer:domain',
                'layer:ui',
                'layer:schema',
              ],
            },
            {
              // The shell assembles anything; nothing may import it.
              sourceTag: 'layer:app',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];
