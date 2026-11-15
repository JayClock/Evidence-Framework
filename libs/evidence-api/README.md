# Evidence API

Projects FM models into OpenAPI 3.1 contracts and compares their HTTP compatibility with oasdiff 1.38.0.

## Setup

```sh
pnpm install
pnpm api:setup
pnpm nx build evidence-api
```

`api:setup` downloads the official release for macOS, Linux or Windows (x64/arm64), verifies a pinned SHA-256 digest and executable version, and stores it under `node_modules/.cache/evidence/oasdiff/`. Extraction uses the operating system's `tar`. It needs network access only during installation; export and comparison run offline. No Go toolchain or Docker is required.

The runner selects `EVIDENCE_OASDIFF_BIN` first, then the workspace cache found above the working directory, then `oasdiff` on `PATH`. Outside a workspace, including a packaged desktop installation, configure an absolute executable path or install the pinned version on `PATH`. The desktop and Agent report an unavailable comparison rather than a compatible contract when the tool cannot run. No binary is downloaded during analysis.

## Commands

All model, overlay and output paths must be absolute. Export must remain inside the project root and cannot overlap inputs.

```sh
pnpm api:export --project-root "$PWD" --fm "$PWD/.evidence/fm" --out "$PWD/dist/api"
pnpm api:diff --base /absolute/v1.evidence.json --target /absolute/v2.evidence.json --format json
pnpm api:diff --base /absolute/v1.evidence.json --target /absolute/v2.evidence.json --format markdown
pnpm api:diff --help
```

`--base-api` and `--api` apply validated route overlays to the base and target respectively. The comparison uses the final contracts, not estimated model edits. Nx also exposes `evidence-api:export-openapi` and `evidence-api:diff`, with build dependencies and caching disabled.

Export validates the OpenAPI meta-schema before publishing `openapi.json` alongside the delivery projection and manifest. Comparison returns native oasdiff findings, a Markdown changelog and the full JSON diff. The JSON envelope also carries both model digests. Findings retain native numeric severity (`1=INFO`, `2=WARN`, `3=ERR`). Both WARN and ERR block the compatibility gate.

CLI `diff` exit codes:

- `0`: no WARN/ERR contract findings;
- `1`: contract findings at WARN/ERR;
- `2`: invalid arguments, model/contract errors, missing/wrong-version tool, timeout or tool failure. This is **not** a compatibility verdict.

JSON is written to stdout; execution failures preserve stdout/stderr diagnostics on stderr. Nx may normalize a nonzero command status, so use the direct CLI scripts when distinguishing exit codes.

## Inline examples

An entity's optional `examples` contains named **complete entity facts**, not workflow steps:

```json
{
  "examples": [
    {
      "label": "standard",
      "description": "One confirmed payment",
      "value": {
        "id": "payment-1",
        "proof_id": "proof-1",
        "total_amount": 42,
        "confirmed_at": "2026-01-01T00:00:00Z"
      }
    }
  ]
}
```

Values must satisfy the entity's response payload schema. The projection adds an empty HAL `_links` map for response examples. Request examples contain only caller-owned fields: derived values and service timestamps never enter request bodies. Examples do not execute CEL or assert complete business behavior. Invalid values block export; they are not silently turned into passing tests.

## Scope and verification

OpenAPI compatibility covers the declared HTTP surface. CEL expressions, business role authorization and fulfillment semantics need separate model review and behavioral acceptance tests; a zero exit status is not release authorization. Extensions and documentation edits remain visible in the full diff even when they produce no compatibility findings. Model digests identify model changes outside that surface.

```sh
pnpm nx test evidence-api
pnpm nx typecheck evidence-api
pnpm nx lint evidence-api --quiet
```

Tests invoke the pinned executable for contract evolution and use process mocks for failure handling. API, Agent and desktop test targets are uncached so an unavailable executable cannot be hidden by a cached passing test run.
