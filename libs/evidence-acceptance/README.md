# Contract compatibility and HTTP acceptance

Nx project: `evidence-acceptance`; package: `@evidence-poc/evidence-acceptance`.

Consumes [`evidence-api`](../evidence-api/README.md) projections and owns:

- Compilation of inline `examples[].test` flows to a native Bruno collection.
- Combined contract/test export (`renderDeliverables`) and atomic suite publishing.
- Execution via the pinned Bruno CLI, flow selection, regression/DoD gates and
  response-schema validation and drift reporting.
- Native `oasdiff` comparisons of final validated OpenAPI contracts.
- The deprecated `evidence-api` binary and command adapter; the unified
  `apps/cli` remains the preferred user entry point.

## Entry points and migration

| Entry         | Intended consumer                                                    |
| ------------- | -------------------------------------------------------------------- |
| root          | Node callers: renderers, combined export, contract comparison, drift |
| `/runner`     | HTTP execution and gate/report types                                 |
| `/commands`   | Unified CLI / legacy API command execution                           |
| `/cli`        | Deprecated `evidence-api` executable shim                            |
| `/projection` | Browser-safe acceptance compilation only                             |

Bruno is the only acceptance format. `evidence export`, `evidence api export-tests`
and the deprecated `evidence-api export-tests` no longer take `--format`. Re-export
existing suites; `evidence test --scenarios` takes one generated collection directory,
not a Step CI YAML or Hurl file. The output format options for `diff` are unchanged.

The `/projection` entry may use `evidence-api/delivery` and the universal model
engines, but must not import the Node package root, HTTP runner or native diff.
Browser lint rules and the desktop production build exercise this boundary.

### Running the collection

A generated collection contains `bruno.json`, `environments/test.bru` and ordered
requests grouped by flow. From the collection directory, `bru run -r --env test`
(or Bruno Desktop) runs native HTTP checks. The renderer accepts single-node
JSONPaths for assertions and captures; multi-node queries are rejected.

`evidence test` additionally reads `evidence-acceptance.json`, verifies that the
native requests match the generated metadata, and executes the selected flows
sequentially in Bruno's safe sandbox. The metadata supports flow-level filters,
baseline comparison and JSON Schema 2020-12 response validation. Schema failure
blocks by default; `--detect-drift` makes it advisory and `--strict-drift` makes
it blocking again. Direct Bruno runs do not perform Evidence's schema validation
or gate selection. Keep the entire generated directory under version control.

## Setup

```bash
pnpm install
pnpm api:setup
```

Setup explicitly provisions pinned native `oasdiff` 1.38.0 under
`node_modules/.cache/evidence/oasdiff`. It verifies the release archive checksum
and executable version, and reuses a matching cached binary. It is not an install
hook. `pnpm install` provisions the pinned `@usebruno/cli`; Evidence does not use
a globally installed `bru`. No Go toolchain or Docker is needed. Rerun setup
after deleting `node_modules` or the tool cache.

`EVIDENCE_OASDIFF_BIN` takes precedence. Otherwise the runner searches from the
installed package for the provisioned cache, even if the caller's working
directory is elsewhere, then falls back to `oasdiff` on `PATH`. Missing/wrong-
version tools fail closed; comparisons never download a binary.

## Commands

```bash
pnpm exec nx build cli
pnpm evidence export --model .evidence/fm --out dist/acceptance
pnpm evidence export --model .evidence/fm --out dist/acceptance --verify
pnpm evidence test --target http://localhost:8080 --scenarios dist/acceptance --json
pnpm evidence diff /absolute/v1.evidence.json /absolute/v2.evidence.json --format json
```

`evidence-acceptance:export-tests` and `evidence-acceptance:diff` are uncached Nx
command targets that build the unified CLI first. `evidence-api:export-openapi`
remains the projection target. `pnpm api:diff` and `pnpm api:export` still invoke
the same unified CLI routes.

`--base-api` and `--api` overlays apply to the respective baseline/target before
compatibility comparison. Results include both model digests, native severity
(`1=INFO`, `2=WARN`, `3=ERR`), Markdown changelog and full JSON diff. WARN/ERR
findings block the compatibility gate.

Diff exit codes remain `0` (no WARN/ERR), `1` (compatibility findings) and `2`
(invalid input/contract or tool failure, **not** a compatibility verdict).
Failures preserve native stdout/stderr diagnostics. For exact exit codes, use the
direct CLI rather than relying on Nx's normalized task status.

Static checks and compatibility only describe the declared surface: they do not
prove that a backend implements CEL semantics, role authorization or fulfillment
behavior. Test against a real backend before claiming acceptance. Pending DoD is
not success, and a drift failure never overrides unrelated failed assertions.

## Verification

```bash
pnpm api:setup
pnpm exec nx run-many -t lint,typecheck,test -p evidence-api,evidence-acceptance,cli
```

Tests cover real HTTP servers and backend subprocesses, exact generated suites,
native contract evolution, timeout/version/tool failures, drift and both gate
policies. Acceptance tests are uncached so a missing executable cannot be hidden
by a previously passing run. API fixture builders are shared through
`evidence-api/testing` rather than copied or imported through private paths.
