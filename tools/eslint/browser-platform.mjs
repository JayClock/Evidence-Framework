/**
 * The browser projects stay off the Node platform.
 *
 * `@nx/enforce-module-boundaries` checks npm packages against the project
 * graph and workspace projects against their tags, but Node builtins are
 * neither: `node:fs` is not an external node, so a renderer import of it
 * passed every rule. This block closes that gap.
 *
 * It also keeps the two Node packages a browser library may consume on their
 * browser-safe entries. A project-level rule cannot see a subpath, so the
 * package root stays restricted here: `…/delivery` and `…/browser` are the
 * entries whose module graph never reaches disk.
 */

/** Node packages that ship a browser-safe entry and may be imported from one. */
const NODE_PACKAGES_WITH_BROWSER_ENTRY = [
  '@evidence-poc/evidence-api',
  '@evidence-poc/evidence-agent',
];

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'child_process', 'os', 'stream'],
              message:
                'This project is tagged platform:browser. Ask the process over IPC instead of importing a Node builtin; the renderer bundle cannot resolve it.',
            },
          ],
          paths: NODE_PACKAGES_WITH_BROWSER_ENTRY.map((name) => ({
            name,
            message:
              'Import the browser-safe subpath (`…/delivery`, `…/browser`). The package root re-exports Node-only modules.',
          })),
        },
      ],
    },
  },
];
