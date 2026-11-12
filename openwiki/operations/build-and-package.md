---
type: operations
title: Workspace, build and packaging
description: The operational rules of the repository — pnpm and Nx settings that change how code resolves, the @evidence-poc/source condition chain, inferred targets, CI verification, and the Electron Forge build that ships review assets beside app.asar.
tags: [build, workspace, nx, pnpm, forge, ci, packaging]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-12T12:33:13.984Z
sources:
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-afe88c3d8e9b032e5cd298f0
    resource: repo://.github/workflows/release-desktop.yml
  - id: openwiki-source-b9c537cd7841c97272e0ebfa
    resource: repo://apps/desktop/forge.config.mjs
  - id: openwiki-source-de5c5760d707be19e09eb7e3
    resource: repo://apps/desktop/project.json
  - id: openwiki-source-b5ea8c8713a5b04ee1c21d2d
    resource: repo://apps/desktop/vite.main.config.mjs
  - id: openwiki-source-5b2f4571b417c1f942c2db50
    resource: repo://apps/desktop/vite.preload.config.mjs
  - id: openwiki-source-71551420c3d7d5fd27827652
    resource: repo://apps/desktop/vite.renderer.config.mjs
  - id: openwiki-source-15aba07b973e26bd886a7db3
    resource: repo://apps/desktop/vitest.config.mts
  - id: openwiki-source-18fab4844d8695b257bd644b
    resource: repo://docs/workspace-layout.md
  - id: openwiki-source-0c1cc5dc86ad401eb9678504
    resource: repo://ENVIRONMENT.md
  - id: openwiki-source-2fda883e9b76745f69f487f7
    resource: repo://eslint.config.mjs
  - id: openwiki-source-7c4f607b2d42287b8ffedc0c
    resource: repo://libs/evidence-model-core/package.json
  - id: openwiki-source-6ba748254f38112b13d529da
    resource: repo://nx.json
  - id: openwiki-source-40275cb92c3610938f16ade3
    resource: repo://pnpm-workspace.yaml
  - id: openwiki-source-ee8a6eead7cfc4af5f46c4bd
    resource: repo://scripts/prepare-desktop-resources.mjs
  - id: openwiki-source-df1e4d0dc0a35c64fd0e652b
    resource: repo://tsconfig.base.json
generated: { by: "pi", at: "2026-11-12T12:33:13.984Z" }
---

# Workspace, build and packaging

The repository is one pnpm workspace driven by Nx. There is no second runtime, no
interpreter to install and no per-package build script to remember: the target
graph decides what runs, and CI runs the same targets a developer does
(`repo://ENVIRONMENT.md#L1-L10`).

Two directories carry code — `apps/` for the runnable Electron app, `libs/` for
the eight libraries — and the package manager settings live in
`pnpm-workspace.yaml`, not `.npmrc` (`repo://docs/workspace-layout.md#L1-L15`).

## pnpm settings and their consequences

Every key in `pnpm-workspace.yaml` exists for a reason, and each changes behavior
in a way a newcomer can trip over
(`repo://pnpm-workspace.yaml#L1-L35`):

| Setting | Value | Consequence |
| --- | --- | --- |
| `packages` | `apps/*`, `libs/*` | only those two trees are workspace members |
| `nodeLinker` | `hoisted` | Electron Forge resolves the runtime tree with flora-colossus, which does not follow symlinks; hoisting also means an undeclared import can still resolve locally, so the dependency lint rule — not the installer — is the guard |
| `blockExoticSubdeps` | `false` | `electron-winstaller` reaches `@electron/node-gyp` through a git URL |
| `allowBuilds` | electron, nx, `@swc/core`, protobufjs, `@google/genai`, electron-winstaller | pnpm blocks lifecycle scripts unless approved; these need one |
| `minimumReleaseAgeExclude` | `@earendil-works/pi-*@1.5.2` | pnpm 12 refuses packages inside a quarantine window; the Pi SDK is the modeling runtime and is exempted **by exact version**, so a newer release must be reviewed again |

The hoisted linker is the setting with the widest blast radius: it makes local
development forgiving and makes the lint rule load-bearing.

## Nx: inferred targets, not declared ones

`nx.json` configures four plugins
(`repo://nx.json#L17-L58`):

- `@nx/js/typescript` infers `typecheck` and `build` (with `tsconfig.lib.json`);
- `@nx/eslint/plugin` infers `lint` from each `eslint.config.mjs`;
- `@nx/vite/plugin` infers dev/preview targets where a Vite config exists;
- `@nx/vitest` infers `test` and per-file `test-ci--*` targets.

`targetDefaults.test.dependsOn: ["^build"]` means a test waits for the libraries
it imports to build. The `production` named input excludes specs, eslint configs
and test setup files, so a test-only change does not invalidate a production build
cache (`repo://nx.json#L4-L16`, `repo://nx.json#L60-L64`).

The docs warn against re-declaring an inferred target: a second definition silently
wins and loses the per-file CI targets
(`repo://docs/workspace-layout.md#L100-L125`).

`apps/desktop` is the exception: Electron Forge owns its steps, so `project.json`
declares `prepare-resources`, `build`, `package`, `make`, `start` and `typecheck`
explicitly (`repo://apps/desktop/project.json#L1-L75`).

## The source-condition chain

Workspace packages are consumed from `src`, not from `dist`, and this is the single
most fragile convention in the repo because a missing condition fails like a
missing module.

The chain has four links:

1. **Package exports.** Every `libs/*/package.json` lists
   `"@evidence-poc/source": "./src/index.ts"` before `types` and `import`.
2. **TypeScript.** `tsconfig.base.json` sets
   `customConditions: ["@evidence-poc/source"]`, so `tsc` reads sources without a
   `paths` table (`repo://tsconfig.base.json#L1-L20`).
3. **Bundlers and runners.** Each Vite/Vitest config repeats the condition in
   `resolve.conditions`: main, preload, renderer and the desktop test project all
   list `@evidence-poc/source` first, with `node` for main/preload and `browser`
   for the renderer
   (`repo://apps/desktop/vite.main.config.mjs#L1-L28`,
   `repo://apps/desktop/vite.renderer.config.mjs#L1-L25`,
   `repo://apps/desktop/vitest.config.mts#L1-L40`).
4. **Project references.** The root `tsconfig.json` references every library and
   each library references only what it imports.

If a new consumer config omits the condition, resolution silently falls back to
`dist`; the failure looks like an unbuilt package rather than a missing condition.
That is why every test runner's config is part of the convention, not an
implementation detail (`repo://docs/workspace-layout.md#L55-L84`).

The renderer additionally lists `browser`, and imports the `/browser` entry of
libraries that also ship disk or MCP adapters — which is why
`evidence-model-core` exports three subpaths (`.`, `./browser`, `./cli`).

## Names, tags and boundaries

Project names are short (`desktop`, `evidence-mcp`) even when the package is scoped;
`nx.name` in the manifest is what sets the command-line name.

Tags drive `@nx/enforce-module-boundaries`
(`repo://eslint.config.mjs#L18-L38`):

- `type:app` may depend only on `type:lib`, never on another app;
- `type:lib` may depend only on `type:lib`;
- `scope:*` records ownership for a future finer rule.

The comment explains why the rule exists at all: a workspace-wide wildcard used to
accept any edge, so a library could import the Electron main process.

## Desktop targets and packaging

The desktop target graph is ordered for a reason
(`repo://apps/desktop/project.json#L8-L75`):

```text
prepare-resources ──> build (electron-forge package) ──> make
                              │
                        package (nx:noop alias)
```

`prepare-resources` runs `node scripts/prepare-desktop-resources.mjs`, which copies
exactly four files — `workbench.html`, `workbench.css`, `workbench.js`,
`business-graph.js` — from `libs/evidence-visualization/assets` into
`apps/desktop/resources/assets`. It clears the destination first so a removed asset
cannot linger, and it keeps the browser test harnesses out
(`repo://scripts/prepare-desktop-resources.mjs#L20-L46`).

Forge then packages with
(`repo://apps/desktop/forge.config.mjs#L9-L70`):

- `asar: true` for the app code;
- `extraResource: [resources/assets]` so the review-page compiler can read the four
  files with `node:fs` from `process.resourcesPath`;
- Vite plugin entries for main, preload and the `main_window` renderer;
- code signing and notarization only when `APPLE_ID` is present, so a local build
  does not require Apple credentials;
- makers for Squirrel (Windows), ZIP (macOS), RPM and DEB (Linux).

The app ships no interpreter and no skill tree; the assets are the only thing that
must live outside `app.asar`.

### Why main/preload need `platform: 'node'`

`vite.main.config.mjs` sets `rolldownOptions.platform: 'node'` with an explicit
comment: Forge's Vite plugin emits CJS without `build.ssr`, so Vite 8 would
otherwise default to the browser platform and turn `import.meta.url` into
`undefined`, breaking `createRequire` in the main bundle. Preload pins the output
file name to `preload.js` because Forge names bundles after their entry file
(`repo://apps/desktop/vite.preload.config.mjs#L1-L25`).

## CI

`.github/workflows/ci.yml` runs on pushes and pull requests to `main` with
concurrency cancellation, on Node 22 and the lockfile:

1. `pnpm install --frozen-lockfile`
2. `pnpm nx run-many --target=lint --all`
3. `pnpm nx run-many --target=typecheck --all`
4. `pnpm nx run-many --target=test --all`
5. `pnpm nx build desktop`

Step 5 is the packaging smoke test: it runs `prepare-resources` and
`electron-forge package`, so a broken Vite config or missing asset fails CI without
producing installers.

`.github/workflows/release-desktop.yml` runs on `v*.*.*` tags or manual dispatch. It
builds a four-way matrix — macOS arm64, macOS x64, Windows x64, Linux x64 — installs
the Linux packaging dependencies (`rpm`, `fakeroot`, `dpkg`), runs
`pnpm nx run desktop:make -- --arch=<arch>`, collects `.zip`, `.exe`, `.nupkg`,
`RELEASES`, `.deb` and `.rpm`, and publishes a GitHub Release with generated notes.
Apple secrets are optional; without them the macOS build is unsigned.

## Commands worth knowing

```bash
pnpm install                          # from the lockfile
pnpm install --frozen-lockfile        # what CI runs
pnpm desktop                          # nx start desktop
pnpm build                            # nx run-many --target=build --all
pnpm test                             # nx run-many --target=test --all
pnpm lint                             # nx run-many --target=lint --all
nx graph                              # dependency graph
nx affected --target=test --base=main # only what a branch touched
```

Root scripts are thin wrappers around `nx run-many`; there is no `dev` script
because `desktop` is the only runnable app
(`repo://docs/workspace-layout.md#L100-L140`).

## Common failure modes

| Symptom | Likely cause |
| --- | --- |
| "cannot find module @evidence-poc/..." | the consumer's Vite/Vitest config omits `@evidence-poc/source`, so it resolved `dist` and the library was not built |
| tests pass locally but the packaged app cannot read page assets | `prepare-resources` did not run, or `extraResource` was removed |
| `import.meta.url` is undefined in main | `rolldownOptions.platform` is not `node` |
| `createRequire`/Electron install fails on a fresh checkout | lifecycle scripts were not approved in `allowBuilds` |
| a type-only import fails in a new app | `customConditions` is missing from the tsconfig that compiles it |
| a library imports Electron | module-boundary tags are wrong or the lint target was skipped |
| CI cannot install | `pnpm-lock.yaml` is stale relative to a manifest |

## Related pages

- [Quickstart](../quickstart.md) — the shortest path from clone to running app.
- [System map and dependency direction](../architecture/overview.md) — why the
  packages are ordered this way.
- [The offline review workbench](../contracts/offline-workbench.md) — what the
  four packaged assets produce.
- [Verification strategy and fixtures](../testing/verification-strategy.md) — what
  the CI test step actually runs.
