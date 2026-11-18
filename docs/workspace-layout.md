# Workspace layout

The repository is one pnpm workspace driven by Nx. Two directories carry code;
each answers a different question.

| Directory       | Holds                                                                                                | Listed in `pnpm-workspace.yaml` |
| --------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------- |
| `apps/`         | Runnable entry points: `desktop` (Electron Forge) and `cli` (the unified `evidence` command)         | yes (`apps/*`)                  |
| `libs/`         | Model/schema/interaction engines, model I/O, shared tools, API projection, acceptance, Agent and MCP | yes (`libs/*`)                  |
| `libs/desktop/` | Desktop contracts, UI kit, canvas/inspector/story/delivery/drift/agent features and test support     | yes (`libs/desktop/*`)          |

Nothing is a library in two toolchains: every `libs/*` entry is a TypeScript
package consumed through pnpm, and no Java or Gradle module lives in this
repository. A new workspace library goes under `libs/`, never under `apps/`.
`apps/desktop` and `apps/cli` compose libraries. Deprecated library CLIs remain
thin adapters; the legacy `evidence-api` binary is owned by `evidence-acceptance`
because it includes diff and acceptance export commands.

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
`pnpm install --frozen-lockfile`, then run `pnpm api:setup` before API
compatibility checks and their tests. The latter provisions the pinned native
`oasdiff`; it is an explicit setup step, not a pnpm install hook.

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
the `@nx/dependency-checks` rule, not the installer, is the guard.
`node_modules/.cache` holds the build caches (Nx, Vite, the desktop resource
tree) and the provisioned `oasdiff` binary. After deleting `node_modules`, rerun
`pnpm install` and `pnpm api:setup` before API compatibility checks or their tests.

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
- `layer:*` enforces dependency direction: schema → domain → I/O/projection →
  orchestration; UI controls, desktop contracts and features have explicit
  allowed inputs. Apps compose the layers; libraries cannot import apps.
- `platform:universal` cannot import Node/browser projects; browser features
  may consume Node libraries only through declared browser-safe surfaces.
  `tools/eslint/browser-platform.mjs` also prohibits Node builtins and the
  unsafe package roots.
- `scope:*` records business ownership and disallows reverse edges (for example,
  acceptance may consume API projection but may not consume Agent or desktop).
- `pnpm boundaries:drill` proves seven forbidden imports still fail lint.

## Current extraction boundaries

- `desktop-contracts` owns desktop IPC channels and DTOs. Its runtime consists
  of constants; dependencies on Node libraries are type-only. It is not a new
  general-purpose RPC protocol. Feature hooks take narrow API ports as arguments;
  only the application shell reads `window.evidenceAPI`.
- `desktop-feature-story`, `desktop-feature-delivery`, `desktop-feature-drift`
  and `desktop-feature-agent` own their UI, hooks and colocated tests. Cross-feature
  coordination, window handling and project services stay in `apps/desktop`.
  Shared renderer fixtures live in `desktop-testing`, never in an app import.
- `evidence-tools` is a universal domain library: one registry of validated
  patch/recipe operations and write-safety metadata. Pi and MCP adapt it, while
  the host still owns atomic application, static guards and undo. These tools
  are **not** idempotent. Transport-specific read/sensor tools remain in their
  respective adapters.
- `evidence-api` owns contract projection; it has no acceptance dependency and
  does not load the Bruno CLI or spawn `oasdiff`. `evidence-acceptance` depends
  on it and owns test compilation, HTTP execution, drift and native contract diff.
  Browser scenario editors use `evidence-acceptance/projection`; Node callers
  use its root, `/runner` or `/commands`. API fixtures are shared through the
  test-only `evidence-api/testing` export.
- Public API imports moved: `renderDeliverables`, renderers, contract comparison
  and the old API command adapter now come from `evidence-acceptance`, not
  `evidence-api`. Unified CLI command names and exit codes are unchanged.

## Common commands

```bash
pnpm install                                 # from the lockfile
pnpm install --frozen-lockfile               # dependency install in CI
pnpm api:setup                              # pinned oasdiff for API diff/tests
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
pnpm exec nx g @nx/js:library libs/evidence-foo \
  --name=evidence-foo --importPath=@evidence-poc/evidence-foo \
  --bundler=tsc --unitTestRunner=vitest --linter=eslint \
  --tags=type:lib,layer:domain,platform:universal,scope:model
pnpm exec nx g @nx/react:library libs/desktop/feature-foo \
  --name=desktop-feature-foo --importPath=@evidence-poc/desktop-feature-foo \
  --bundler=none --unitTestRunner=vitest --component=false \
  --tags=type:lib,layer:feature,platform:browser,scope:desktop
pnpm exec nx sync
pnpm exec nx sync:check
```

`pnpm install` links the new workspace package and updates the lockfile. Nx's
TypeScript sync generator manages project references; do not hand-maintain a
second dependency graph. Check the `exports` source condition, `workspace:*`
dependencies in each consumer, the generated references, and the new project's
`nx.tags`. React library configs must repeat the source export condition and
apply `tools/eslint/browser-platform.mjs`; copy the established Feature config
rather than relying on the generator's generic Vite defaults.
