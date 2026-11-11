# Workspace layout

The repository is one npm workspace driven by Nx. Three directories carry code;
each answers a different question.

| Directory       | Holds                                                                                                                                                                                   | Included in npm workspaces                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `apps/`         | Runnable entry points: `frontend` (Vite + React), `desktop` (Electron Forge), `backend` (Spring Boot, Gradle)                                                                           | yes (`apps/*`)                               |
| `packages/`     | TypeScript libraries the apps compose: `evidence-schema`, `evidence-model-core`, `evidence-canvas-interaction`, `evidence-agent-core`, `evidence-modeling-orchestrator`, `evidence-mcp` | yes (`packages/*`)                           |
| `libs/backend/` | Java modules of the backend (`domain`, `api`, `persistent`)                                                                                                                             | no — Gradle only, wired in `settings.gradle` |

`packages/*` and `libs/backend/*` are both "libraries", but they belong to
different toolchains and never depend on each other across the language
boundary. A TypeScript package must not be placed under `libs/`, and a Java
module must not be placed under `packages/`.

## Dependency declarations

- A runtime dependency is declared in the `package.json` of the project that
  imports it. `apps/frontend` owns its React stack, `packages/evidence-mcp` owns
  the MCP SDK and zod. Hoisting in `node_modules` makes an undeclared import
  work locally, so lint — not the installer — is what catches it.
- The root `package.json` holds dev tooling only (Nx, TypeScript, ESLint,
  Vitest, Vite plugins) plus the `workspaces` globs. Adding a runtime
  dependency there hides it from every consumer that actually needs it.
- `@nx/dependency-checks` enforces both directions on the JSON manifests:
  an import without a declaration and a declaration without an import both fail
  `nx lint`.
- Internal packages are versioned `0.0.1` because nothing is published; the
  workspace resolves them by name, not by registry.

## How imports resolve

Workspace packages are consumed from source, not from `dist`:

1. Each `packages/*/package.json` exports its entry twice, once per condition:

   ```json
   ".": {
     "@evidence-poc/source": "./src/index.ts",
     "types": "./dist/index.d.ts",
     "import": "./dist/index.js"
   }
   ```

2. `tsconfig.base.json` sets `customConditions: ["@evidence-poc/source"]`, so the
   type checker reads `src` and needs no `paths` table.
3. Every bundler and test runner repeats the condition in `resolve.conditions`:
   `apps/frontend/vite.config.mts`, `apps/desktop/vite.*.config.mjs`,
   `apps/desktop/vitest.config.mts`, and each `packages/*/vitest.config.mts`.

   A new consumer config that omits it falls back to `dist`, which is why the
   library had to be built first — the failure looks like a missing module
   rather than a missing condition.

4. `tsconfig.json` references every project so `tsc --build` and `typecheck`
   stay incremental, and each library's `tsconfig.lib.json` references only the
   libraries it imports.

Because of this, `nx run desktop:build` does not wait for library builds;
`^production` in the target inputs still invalidates the cache when a dependency
changes.

## Project names and tags

Project names are short (`frontend`, `desktop`, `backend`, `evidence-mcp`) even
where the package is scoped (`@evidence-poc/frontend`); `apps/frontend` sets
`nx.name` for that reason. Use the short name on the command line.

Tags drive `@nx/enforce-module-boundaries` in `eslint.config.mjs`:

- `type:app` may depend on `type:lib`, never on another app.
- `type:lib` may depend on `type:lib`.
- `scope:*` records the owner so a future rule can separate the frontend, the
  desktop shell and the backend without touching the linter config.

## Common commands

```bash
nx graph                                    # dependency graph
nx run-many --target=lint --all             # what `npm run lint` runs
nx run-many --target=build --all            # apps, packages and Gradle modules
nx run-many --target=test --all             # Vitest and Gradle tests
nx affected --target=test --base=main       # only what a branch touched
```

`apps/desktop` keeps hand-written `build`, `package`, `make`, `start` and
`typecheck` targets because Electron Forge owns those steps; `lint` and `test`
are inferred from `eslint.config.mjs` and `vitest.config.mts` by
`@nx/eslint/plugin` and `@nx/vitest`. Do not re-declare an inferred target — a
second definition silently wins and loses the per-file `test-ci--*` targets.

## Adding a library

```bash
nx g @nx/js:lib evidence-foo --directory=packages/evidence-foo
```

Then check the four places a new package must appear: the `exports` block with
the source condition, the `references` array of the consuming `tsconfig*.json`,
the `references` list in the root `tsconfig.json`, and its `nx.tags`.
