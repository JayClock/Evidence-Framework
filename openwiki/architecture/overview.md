---
type: architecture
title: System map and dependency direction
description: How the one desktop app and eight TypeScript libraries compose, which way dependencies point, and how a model travels from source text to a checked verdict, an API contract and an offline review page.
tags: [architecture, workspace, dependencies, data-flow]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-12T12:33:13.984Z
sources:
  - id: openwiki-source-310af6f70610151f6693b6d6
    resource: repo://apps/desktop/src/main/reviewIpc.ts
  - id: openwiki-source-9459ee1a8fc917f2d94619ce
    resource: repo://apps/desktop/src/renderer/screens/EditorScreen.tsx
  - id: openwiki-source-18fab4844d8695b257bd644b
    resource: repo://docs/workspace-layout.md
  - id: openwiki-source-0c1cc5dc86ad401eb9678504
    resource: repo://ENVIRONMENT.md
  - id: openwiki-source-7dad3c227e7d6e118c34b56a
    resource: repo://libs/evidence-api/src/projector.ts
  - id: openwiki-source-7c4f607b2d42287b8ffedc0c
    resource: repo://libs/evidence-model-core/package.json
  - id: openwiki-source-852b747ca0a21fd5f6e30960
    resource: repo://libs/evidence-model-core/README.md
  - id: openwiki-source-11bd8ad0e59bddff7011666d
    resource: repo://libs/evidence-modeling-orchestrator/src/sensors/sensorsEngine.ts
  - id: openwiki-source-dd948eb74e58734da3b37ea9
    resource: repo://libs/evidence-schema/package.json
  - id: openwiki-source-7cec040a39708538d0a3d57b
    resource: repo://libs/evidence-schema/README.md
  - id: openwiki-source-3ae8adf574661c7d35742fbe
    resource: repo://libs/evidence-visualization/src/generate/collectWorkbench.ts
  - id: openwiki-source-25991f0e9374ce7206572f30
    resource: repo://libs/evidence-visualization/src/generate/generateWorkbench.ts
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
generated: { by: "pi", at: "2026-11-12T12:33:13.984Z" }
---

# System map and dependency direction

Evidence is one pnpm workspace with one runnable app and eight libraries. The
shape is not arbitrary: the language and its checks sit at the bottom, the
contract generators and the agent orchestration sit above them, and the Electron
shell sits on top. A library never imports the app, and the two contract
generators never import each other.

```text
apps/desktop  (Electron main + preload + React renderer)
   │
   ├── evidence-model-core ── evidence-schema
   ├── evidence-modeling-orchestrator ── evidence-model-core ── evidence-schema
   ├── evidence-agent-core  (Pi SDK only)
   ├── evidence-canvas-interaction ── evidence-model-core ── evidence-schema
   ├── evidence-mcp ── evidence-model-core ── evidence-schema
   ├── evidence-api ── evidence-model-core ── evidence-schema
   └── evidence-visualization ── evidence-api ── evidence-model-core
```

`docs/workspace-layout.md` states the rule directly: `apps/` holds runnable entry
points, `libs/` holds the packages the app composes, and the modeling CLI and MCP
server are libraries with a `bin`/`cli` entry rather than separate apps
(`repo://docs/workspace-layout.md#L1-L15`).

## The dependency ladder

Each package's `dependencies` block is the authoritative edge list:

| Package | Depends on | Owns |
| --- | --- | --- |
| `evidence-schema` | `tslib` only | FM v5 AST, identifier grammars, strict validation, inspector metadata |
| `evidence-model-core` | schema | graph, commands, session, adapters, checks, CEL, key data, diff, ingestion |
| `evidence-modeling-orchestrator` | core, schema, Pi SDK, typebox | sensors, stage gate, agent tools, frontier, verdict diff |
| `evidence-agent-core` | Pi SDK | session harness, instruction text, event projection, transcript fork |
| `evidence-canvas-interaction` | core, schema | layout, viewport, ruler and selection maths |
| `evidence-mcp` | core, schema, MCP SDK, zod | tool surface, stdio server, local bridge |
| `evidence-api` | core, schema, ajv | design validation, API projection, HTTP contract, OpenAPI |
| `evidence-visualization` | api, core | workbench projection, renderer, atomic publisher |

Two properties of this ladder matter:

- `evidence-schema` has **no runtime dependency** and never mutates its input
  (`repo://libs/evidence-schema/README.md#L1-L16`). Every other package can depend
  on it without dragging a runtime along.
- `evidence-visualization` is the only package that depends on `evidence-api`.
  The API projection is an input to the review page, not the other way round
  (`repo://libs/evidence-visualization/src/generate/collectWorkbench.ts#L6-L21`).

The dependency direction is also visible in the type system: the root
`tsconfig.json` lists eight project references and no app reference, because
`apps/desktop` is type-checked by its own Forge-owned targets
(`repo://tsconfig.json#L1-L31`).

## What each layer actually does

### Language and static contract

`evidence-schema` is the executable form of the shipped JSON Schemas. It exports
the AST types and their narrow guards, the identifier patterns, the key-data
vocabulary, `strictValidateDomainModel` for static FM checks, and declarative
inspector metadata
(`repo://libs/evidence-schema/src/index.ts#L1-L60`,
`repo://libs/evidence-schema/README.md#L6-L14`). It deliberately does not evaluate
CEL, resolve scopes or audit providers — those are later passes.

### One document, two source forms

`evidence-model-core` turns a `.evidence/fm` tree or a `*.evidence.json` bundle
into one `DomainModelDocument`, then offers the only sanctioned way to change it:
immutable commands with inverses, a session with undo/redo, and adapters that
write back without churn
(`repo://libs/evidence-model-core/README.md#L1-L17`). It also owns the check
pipeline — strict validation, scope selection, CEL evaluation, scenario
simulation, timeline and traceability — and the key-data ledger that the
orchestrator audits.

Its export surface is split by environment: `.` and `./browser` expose the graph,
commands, session, diff and ingestion without Node built-ins, while `./cli`
exposes the `evidence-model` command. That split is why the renderer can import
`@evidence-poc/evidence-model-core/browser` and never touch `node:fs`.

### Orchestration

`evidence-modeling-orchestrator` composes core checks into one verdict, decides
the downstream gate, and exposes the tools an agent may call. It knows about Pi
only for tool registration; the sensor layer itself is plain Node code
(`repo://ENVIRONMENT.md#L12-L21`).

### The two contract generators

`evidence-api` reads a checked FM index and a design document, then projects
resources, capabilities, scenario and model coverage, HTTP contracts, OpenAPI and
test vectors. The order is fixed in `buildProjection`: references, resources,
bindings, capabilities, scenario coverage, model coverage, diagnostics, then HTTP
(`repo://libs/evidence-api/src/projector.ts#L302-L380`). Nothing is projected when
a basis reference dangles.

`evidence-visualization` takes that projection plus the checked model and emits a
single self-contained page. It collects and fingerprints the inputs, renders HTML
with a hash-based CSP, and publishes atomically
(`repo://libs/evidence-visualization/src/generate/generateWorkbench.ts#L20-L85`).
The desktop's review export calls exactly this generator, in the main process,
from the sources on disk rather than from the canvas
(`repo://apps/desktop/src/main/reviewIpc.ts#L20-L45`).

### The shell

`apps/desktop` is the composition root. The main process owns filesystem access,
project state, sensor runs, the agent runtime and the local MCP bridge; the
preload script exposes a typed, narrow API; the renderer owns the live
`ModelSession` and everything drawn from it. `EditorScreen` imports from every
library layer — the model document type, the browser-safe sensor types, the
canvas components and the MCP bridge hook — which is what makes it the integration
point rather than a fourth layer of logic
(`repo://apps/desktop/src/renderer/screens/EditorScreen.tsx#L1-L28`).

## End-to-end flow

```text
business text / blueprint ──> IngestionDraft ──> DomainModelDocument
                                                       │
                              (commands + session) ────┤
                                                       ▼
                                          .evidence/fm or *.evidence.json
                                                       │
                                          readModelRoot + validation suite
                                                       │
                                          FM check + key data + trace
                                                       │
                                             SensorReport + stage gate
                                              │                  │
                                   evidence-api projection   evidence-visualization
                                              │                  │
                                        OpenAPI / HTTP      offline review page
```

Three checkpoints hold this flow together:

1. **The document is the only source of truth.** The canvas, the CLI, the sensors
   and the generators all read the same `DomainModelDocument`; there is no second
   representation to keep in sync.
2. **The gate reads saved evidence.** A scope may only move to API or page
   generation with a version-5 check report, complete scope, no gaps and a
   recorded human closure — see [Sensors, stage gate and the dependency
   frontier](./sensor-orchestration.md).
3. **A downstream artifact names its inputs.** The API projection records FM, API
   and source digests; the workbench re-fingerprints before publishing. Neither
   can silently mix two versions of the model.

## One toolchain

There is no second runtime. Every check, derived document and generator is a
TypeScript command; the app runs the same code, so a terminal and a window cannot
disagree (`repo://ENVIRONMENT.md#L1-L4`,
`repo://ENVIRONMENT.md#L35-L45`). The four commands are `evidence-model`,
`evidence-api`, `evidence-workbench` and the desktop binary itself, which doubles
as the MCP stdio server.

## Where to go next

- [The Fulfillment Modeling DSL (FM v5)](../language/fm-dsl.md) — the language all
  of this operates on.
- [Source tree and bundle adapters](../model/source-formats.md) — the two forms and
  their round-trip rules.
- [Desktop app shell and IPC surface](../desktop/app-shell.md) — how the shell is
  wired.
- [Workspace, build and packaging](../operations/build-and-package.md) — the Nx,
  pnpm and Forge mechanics behind the map above.
