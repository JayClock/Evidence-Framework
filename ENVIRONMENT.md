# Environment

One toolchain: Node.js and pnpm. `pnpm install` installs the workspace dependencies;
run `pnpm api:setup` separately to provision the pinned native `oasdiff` used by
API compatibility checks and their tests. There is no interpreter to pin, no
virtualenv to repair and no lockfile for a second runtime. The prebuilt binary
needs neither a Go toolchain nor Docker.

```bash
pnpm install
pnpm api:setup
npx nx run-many -t test typecheck lint
npx nx start desktop
```

## What runs where

| Concern                                                      | Lives in                                                  | Runs in                                 |
| ------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------- |
| model parsing, CEL example oracle, scope, static FM report   | `libs/evidence-model-core/src/validation/`                | process                                 |
| lineage projection (model I/O CLI owns `check` / `compile`)  | `libs/evidence-model-core/src/derive/`                    | process                                 |
| agent session, sensors, stage gate, agent tools              | `libs/evidence-agent`                                     | process                                 |
| shared guarded model mutations for Pi / MCP                  | `libs/evidence-tools`                                     | universal                               |
| API contract projection, OpenAPI, HTTP journeys              | `libs/evidence-api`                                       | process + browser-safe delivery entry   |
| acceptance generation, HTTP gates, native compatibility diff | `libs/evidence-acceptance` (legacy `evidence-api` binary) | process + browser-safe projection entry |
| interview and modeling prompts                               | `libs/evidence-agent/src/prompts/`                        | prompt layer                            |

There is no skill tree. The agent's instructions are code, and the data they
used to point at belongs to the library that consumes it:

| What the agent or a generator needs | Where it lives                                                |
| ----------------------------------- | ------------------------------------------------------------- |
| the prompt the session starts with  | `libs/evidence-agent/src/prompts/`                            |
| the FM and API JSON Schemas         | `libs/evidence-schema/schemas/`, `libs/evidence-api/schemas/` |

The agent session asks Pi for `noSkills: true`, so a working copy is never
scanned for instructions: opening a project reads its model, nothing else.

The Python scripts these packages used to carry are gone; the checks, the derived
documents and the generators are the TypeScript commands listed above. A command
is the same code the app runs, so a terminal and a window cannot disagree:

```bash
npx evidence-model check .evidence/fm --scope context.product-procurement
npx evidence-model compile .evidence/fm --out .evidence/fm/generated/model.json
npx evidence-api project --project-root "$PWD" --fm .evidence/fm --fm-check check.json --api .evidence/api/api.json
```

## Unified contracts and acceptance CLI

Build once, then use the same `evidence` entry point for model checks, contract
export, API evolution and HTTP acceptance (the older model and API library CLIs
remain available as deprecated adapters):

```bash
pnpm exec nx build cli
pnpm evidence --help
pnpm evidence check .evidence/fm --json
pnpm evidence export --model examples/acceptance/procurement.evidence.json --out dist/acceptance
node examples/dogfood-backend/server.mjs --port 8085
# In another terminal:
pnpm evidence test --target http://127.0.0.1:8085 --scenarios dist/acceptance --verbose
pnpm evidence diff api old.evidence.json new.evidence.json --format markdown
```

`export` validates OpenAPI 3.1 and atomically replaces its dedicated output
directory. Without `--openapi`/`--tests`, it exports both OpenAPI and standard
Step CI YAML; `--tests --format hurl` exports Hurl instead. `test` uses the official
Step CI Runner in-process (no separate runner installation), accepts a YAML file
or a directory of `*.stepci.yml` suites, and exits 0 only when every step passes.
`--json` emits a machine-readable report without terminal formatting. Hurl suites
run through the Hurl CLI, not a private interpreter.

Generated request clocks default to the model examples. `test --as-of <UTC>`
overrides request clocks, **not the compiled expected values**. Only trusted test
backends should consume `x-evidence-asof`; production clocks and authorization
must not trust client headers. See `examples/dogfood-backend/README.md` for
request-scoped Node/Go/Spring/Python templates and red/green fault demonstrations.
The Go/Java/Python files are integration references, not repository runtimes.

API diff uses the pinned native `oasdiff` provisioned explicitly by
`pnpm api:setup`, not by `pnpm install`. Setup downloads the official release and
verifies its archive checksum and executable version; a matching cached binary
is reused. Rerun setup after deleting `node_modules` or the tool cache. See
[Acceptance setup](libs/evidence-acceptance/README.md#setup) for details.

The runner resolves the cache relative to the installed Evidence package even
when the caller's working directory is elsewhere, then falls back to `oasdiff`
on `PATH`. `EVIDENCE_OASDIFF_BIN` takes precedence to select an explicitly installed
matching binary. Missing/incompatible tools fail closed with full diagnostics;
comparison never downloads a binary.

## Fixtures and pins

- `libs/evidence-model-core/tests/fixtures/` holds the golden models the checks
  are tested against; `libs/evidence-api/tests/fixtures/` holds the API designs.
  Shared API fixture builders are exported by `evidence-api/testing`; acceptance
  tests consume that surface rather than private source paths or copies. Other
  fixture trees remain shared by relative path.
- `libs/evidence-schema/tests/fixtures/product-procurement/` is a snapshot of a
  real model tree, copied so schema tests stay stable when the API fixture moves.
- Digests printed by the checks (`modelDigest`, `timelineSummary.sha256`) are
  part of the report contract. A change to canonical serialization is a change to
  the contract, not a formatting detail: refresh the pinned values in the specs
  deliberately and say why in the commit message.

## Workspace

One pnpm workspace, two directories: `apps/` (runnable) and `libs/` (TypeScript
libraries). Package-manager settings live in `pnpm-workspace.yaml`, not
`.npmrc`. See [docs/workspace-layout.md](docs/workspace-layout.md) before adding a
package or a target.

Workspace packages resolve from `src` through the `@evidence-poc/source` export
condition, so a bundler or test runner that omits it in `resolve.conditions`
silently falls back to `dist`.

## Desktop packaging

`nx build desktop` bundles the main process, preload and renderer through
Electron Forge. The desktop uses its native canvas, diagnostics and delivery
views. No interpreter, virtualenv or skill tree is packaged — the app decides
everything in-process.
