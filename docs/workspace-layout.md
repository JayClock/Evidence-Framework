# Workspace layout

The repository is one pnpm workspace driven by Nx. Two directories carry code;
each answers a different question.

| Directory | Holds                                                                                                                                                                                   | Listed in `pnpm-workspace.yaml` |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `apps/`   | Runnable entry points: `desktop` (Electron Forge)                                                                                                                                       | yes (`apps/*`)                  |
| `libs/`   | TypeScript libraries the app composes: `evidence-schema`, `evidence-model-core`, `evidence-canvas-interaction`, `evidence-agent-core`, `evidence-modeling-orchestrator`, `evidence-mcp` | yes (`libs/*`)                  |

Nothing is a library in two toolchains: every `libs/*` entry is a TypeScript
package consumed through pnpm, and no Java or Gradle module lives in this
repository. A new workspace library goes under `libs/`, never under `apps/`.
`apps/desktop` is the only application; the modeling CLI and the MCP server are
libraries with a `bin`/`cli` entry rather than separate apps.

## Dependency declarations

- A runtime dependency is declared in the `package.json` of the project that
  imports it. `apps/desktop` owns its Electron and React stack,
  `libs/evidence-mcp` owns the MCP SDK and zod.
- The root `package.json` holds dev tooling only (Nx, TypeScript, ESLint,
  Vitest, Vite plugins) and the `packageManager` pin. Adding a runtime
  dependency there hides it from every consumer that actually needs it.
- A dependency on a workspace package uses the `workspace:*` protocol — pnpm
  refuses to resolve `0.0.1` against the registry, and the protocol is rewritten
  to a real version if the package is ever published.
- `@nx/dependency-checks` enforces both directions on the JSON manifests:
  an import without a declaration and a declaration without an import both fail
  `nx lint`.

## Package manager

pnpm is pinned in `package.json` (`"packageManager": "pnpm@12.16.1"`); the
lockfile is `pnpm-lock.yaml` and CI should install with
`pnpm install --frozen-lockfile`.

`pnpm-workspace.yaml` is the only place workspace settings live — pnpm 10 moved
them out of `.npmrc` and `package.json`, and an `.npmrc` setting is silently
ignored. Every key in it is there for a reason:

| Key                        | Value                                                                       | Why                                                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodeLinker`               | `hoisted`                                                                   | Electron Forge walks the app's runtime tree with `flora-colossus`, which does not follow pnpm's symlinks; Forge's docs require a hoisted linker. This also keeps `apps/desktop` packaging working.  |
| `blockExoticSubdeps`       | `false`                                                                     | `electron-winstaller` depends on `@electron/node-gyp` through a git URL, and pnpm refuses transitive exotic dependencies by default.                                                                |
| `allowBuilds`              | electron, nx, `@swc/core`, protobufjs, `@google/genai`, electron-winstaller | pnpm blocks lifecycle scripts unless approved; these need one (Electron downloads its binary, nx and swc fetch platform artifacts).                                                                 |
| `minimumReleaseAgeExclude` | the `@earendil-works/pi-*@1.5.2` set                                        | pnpm 12 refuses packages published inside a quarantine window. The Pi SDK is the modeling runtime and is pinned exactly, so the exemption is per version: a newer release has to be reviewed again. |

Because the linker is hoisted, an undeclared import can still resolve locally;
the `@nx/dependency-checks` rule, not the installer, is the guard. The Python
virtualenv lives in `node_modules/.cache/evidence-fm-runtime`, so deleting
`node_modules` also deletes it — run `./init.sh` afterwards.

## How imports resolve

Workspace packages are consumed from source, not from `dist`:

1. Each `libs/*/package.json` exports its entry twice, once per condition:

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
   `apps/desktop/vite.*.config.mjs`, `apps/desktop/vitest.config.mts`, and each
   `libs/*/vitest.config.mts`.

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

Project names are short (`desktop`, `evidence-mcp`) even where the package is
scoped (`@evidence-poc/desktop`); the `nx.name` field in each `package.json` or
`project.json` is what sets it. Use the short name on the command line.

Tags drive `@nx/enforce-module-boundaries` in `eslint.config.mjs`:

- `type:app` may depend on `type:lib`, never on another app.
- `type:lib` may depend on `type:lib`.
- `scope:*` records the owner (`scope:desktop`, `scope:evidence`) so a future
  rule can separate the desktop shell from the modeling libraries without
  touching the linter config.

## Common commands

```bash
pnpm install                                 # from the lockfile
pnpm install --frozen-lockfile               # what CI runs
pnpm add --filter @evidence-poc/desktop zustand     # add a dep to one project
pnpm add -Dw vitest                          # add root dev tooling

nx graph                                     # dependency graph
nx run-many --target=lint --all              # what `pnpm lint` runs
nx run-many --target=build --all             # the app and every library
nx run-many --target=test --all              # every Vitest project
nx affected --target=test --base=main        # only what a branch touched
```

Root scripts are thin wrappers: `pnpm build`, `pnpm test`, `pnpm lint` all call
`nx run-many`, so the target graph — not the script — decides what runs. There is
no `dev` script: `pnpm desktop` starts the only runnable app.

`apps/desktop` keeps hand-written `build`, `package`, `make`, `start` and
`typecheck` targets because Electron Forge owns those steps; `lint` and `test`
are inferred from `eslint.config.mjs` and `vitest.config.mts` by
`@nx/eslint/plugin` and `@nx/vitest`. Do not re-declare an inferred target — a
second definition silently wins and loses the per-file `test-ci--*` targets.

## Adding a library

```bash
nx g @nx/js:lib evidence-foo --directory=libs/evidence-foo
```

Then check the five places a new package must appear: the `exports` block with
the source condition, `"@evidence-poc/foo": "workspace:*"` in each consumer's
`dependencies`, the `references` array of the consuming `tsconfig*.json`, the
`references` list in the root `tsconfig.json`, and its `nx.tags`.
