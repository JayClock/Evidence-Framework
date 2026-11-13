---
type: guide
title: Quickstart and task routing
description: What Evidence is, the one toolchain and its commands, the shape of a project, and which wiki page answers which question.
tags: [quickstart, onboarding, navigation, cli]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-13T21:43:57.154Z
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-c8d6c908e749a45544b1e625
    resource: repo://apps/desktop/src/main/deliveryIpc.ts
  - id: openwiki-source-5d33672c45ec58cd29dce507
    resource: repo://apps/desktop/src/main/main.ts
  - id: openwiki-source-e8d8a05aad1d7c63bcff6353
    resource: repo://apps/desktop/src/main/modelSource.ts
  - id: openwiki-source-c72ee53c66b83fbe248c4854
    resource: repo://apps/desktop/src/main/reviewPreview.ts
  - id: openwiki-source-270805b20d9cb08472812372
    resource: repo://apps/desktop/src/main/simulationIpc.ts
  - id: openwiki-source-18fab4844d8695b257bd644b
    resource: repo://docs/workspace-layout.md
  - id: openwiki-source-0c1cc5dc86ad401eb9678504
    resource: repo://ENVIRONMENT.md
  - id: openwiki-source-062416ee8e7e3d6d3b09aaad
    resource: repo://libs/evidence-api/package.json
  - id: openwiki-source-df757265b9e1070807ea34fe
    resource: repo://libs/evidence-api/src/cli.ts
  - id: openwiki-source-dda93af372b2aced5e221a86
    resource: repo://libs/evidence-api/src/projection.spec.ts
  - id: openwiki-source-65cec3fa94938b2f2b5d4a29
    resource: repo://libs/evidence-api/src/renderer/outputRenderer.ts
  - id: openwiki-source-aac6631a251b846350b2d550
    resource: repo://libs/evidence-mcp/src/server/toolset.ts
  - id: openwiki-source-7c4f607b2d42287b8ffedc0c
    resource: repo://libs/evidence-model-core/package.json
  - id: openwiki-source-0c64dc07d9b0704fe44ee9f4
    resource: repo://libs/evidence-model-core/src/adapters/modelFileAdapter.ts
  - id: openwiki-source-9e1c9e40521fc9e802e78473
    resource: repo://libs/evidence-model-core/src/cli.ts
  - id: openwiki-source-b4346df05e97fe887faf2dc3
    resource: repo://libs/evidence-visualization/package.json
  - id: openwiki-source-7a2d89c223533648b5710a12
    resource: repo://libs/evidence-visualization/src/cli.ts
  - id: openwiki-source-3ae8adf574661c7d35742fbe
    resource: repo://libs/evidence-visualization/src/generate/collectWorkbench.ts
  - id: openwiki-source-25991f0e9374ce7206572f30
    resource: repo://libs/evidence-visualization/src/generate/generateWorkbench.ts
  - id: openwiki-source-28ab8d38fd5d45f412609ea7
    resource: repo://libs/evidence-visualization/src/publish/workbenchPublisher.ts
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
generated: { by: "openwiki/0.9.0", at: "2026-11-13T21:43:57.154Z" }
---

# Quickstart and task routing

Evidence is a workbench for backend business models. Instead of binding entities
to an ORM and endpoints to a framework, it models **responsibilities**: who claims
an obligation, which evidence discharges it, which facts must exist, and which
rules derive amounts and deadlines. One document — a `.evidence/fm` source tree or
a single `*.evidence.json` bundle — is read by the canvas, the checks, the agent
tools, the API projection and the offline review page. There is no database behind
it: every surface reads those files.

The repository is one pnpm workspace: `apps/desktop` (Electron) and eight
TypeScript libraries under `libs/`. Setup is `pnpm install`; there is no
interpreter, virtualenv or skill tree to install, because prompts, schemas and page
assets ship inside the libraries that read them
([ENVIRONMENT.md](../ENVIRONMENT.md), [AGENTS.md](../AGENTS.md)).

## Toolchain

```bash
pnpm install                     # the whole setup
pnpm test                        # every Vitest project via nx run-many
pnpm desktop                     # nx start desktop — the only runnable app
pnpm build                       # nx run-many --target=build --all
```

Root scripts are thin Nx wrappers, so the target graph decides what runs
([package.json](../package.json)); `docs/workspace-layout.md` has the target,
tag and `@evidence-poc/source` resolution rules before you add a package.

### Command surfaces

The three CLI packages ship a `bin` entry that points at a built `dist/cli.js`, so
from a checkout they need `pnpm build` (or `npx nx run-many -t build`) first. The root `model:pack`, `model:unpack` and
`model:inspect` scripts invoke the built model CLI directly.

| Command | Verbs | Notes |
| --- | --- | --- |
| `evidence-model` | `pack`, `unpack`, `inspect`, `check`, `compile`, `lineage`, `timeline`, `simulate`, `role-play` | `pack`/`unpack`/`inspect` accept a tree or a bundle; `check` and the derived verbs read a `.evidence/fm` directory only and refuse a bundle (unpack it first) |
| `evidence-api` | `inspect`, `check`, `project`, `deliver`, `diff` | absolute paths required; `--out` must live inside `--project-root` and may not overlap an input |
| `evidence-workbench` | `generate` | defaults to `.evidence/views/index.html`; a failed run leaves the previous page in place |
| desktop binary | `pnpm desktop`, `--mcp-stdio` | `--mcp-stdio` runs the MCP server headless and forwards tool calls over the local socket to the already running app; it opens no window and reads no project store |

```bash
# one consistency report, the same one the app and the agent tools read
npx evidence-model check .evidence/fm --scope context.product-procurement

# project a checked design into routes, OpenAPI and deployment files
npx evidence-api check   --project-root "$PWD" --fm "$PWD/.evidence/fm"
npx evidence-api project --project-root "$PWD" --fm "$PWD/.evidence/fm" \
  --fm-check check.json --api "$PWD/.evidence/api/api.json"

# the offline, read-only review page
npx evidence-workbench generate --project-root "$PWD"
```

Exit codes matter more than stdout:

- `evidence-model check` — `0` clean, `1` blocking error, `2` usage problem. It
  never writes a file.
- `evidence-api` — `1` on any error, `3` when the only findings are gaps, `0`
  clean. `inspect` and `check` write nothing; `project` and `deliver` write the
  file set unless the projection has errors, so a gap-only export still lands
  (exit `3`, `complete: false`) with a current draft rather than hiding it.
- `evidence-workbench generate` — `0` written, `1` not written.

The check report keeps consistency, scope completeness, advisories and the
`modelDigest` apart, so an exit code is a summary and not the whole answer; the
digests are part of the report contract, so refreshing a pinned value is a
deliberate act, not a formatting fix.

## What a project looks like

```text
my-project/
  .evidence/
    fm/
      model.json          # manifest: id, name, version, schemaVersion, entry contexts
      entities/
      relationships/
      rules/
      validation/         # instances + scenarios (optional)
      generated/          # derived output, never packed
    api/
      api.json            # optional design overlay
      generated/          # default evidence-api output directory
    views/
      index.html          # offline review page this tool owns
```

The same document also travels as one portable file:

```text
procurement.evidence.json     # model.json + the three source trees, in one bundle
```

Both forms feed the same readers: the desktop resolves a project root to either
the model directory or the bundle file in one place
([modelSource.ts](../apps/desktop/src/main/modelSource.ts)), and `--fm` accepts
either. Sources and derived output stay apart — packing skips `generated/`, and
`project`/`deliver` refuse an output directory that overlaps an input. See
[Source tree and bundle adapters](./model/source-formats.md).

## Where to go

| Question | Page |
| --- | --- |
| How do the packages fit together, and which way do dependencies point? | [System map and dependency direction](./architecture/overview.md) |
| What can I write in a model, and what is forbidden? | [The Fulfillment Modeling DSL (FM v5)](./language/fm-dsl.md) |
| What makes an amount legal? Where do business time and provenance live? | [Key data, business time and provenance](./language/key-data-and-provenance.md) |
| How is a model stored, packed and written without churn? | [Source tree and bundle adapters](./model/source-formats.md) |
| How does an edit become an invertible command, and why is undo reliable? | [Commands, guards and the model session](./model/commands-and-session.md) |
| What macro operators can an agent call instead of hand-writing commands? | [Modeling operators and generated command batches](./model/operators.md) |
| What does one check actually prove? | [The native check and simulation pipeline](./model/checks-and-simulation.md) |
| How are findings folded, and when may a scope move downstream? | [Sensors, severity folding and the stage gate](./agents/sensor-orchestration.md) |
| Which modeling method does the agent follow, step by step? | [The modeling method as code](./agents/modeling-method.md) |
| How does an in-app modeling turn run, and what tools does it get? | [The Pi agent harness and its tools](./agents/pi-harness.md) |
| How do Cursor/Claude reach the live model? | [External agents over MCP](./agents/mcp-integration.md) |
| How does a model become a deployable contract? | [API delivery projection](./contracts/api-projection.md) |
| How do I hand the contract files over from the app? | [Delivery hand-off: from model to deployable files](./workflows/delivery-handoff.md) |
| How do two snapshots become a reviewable contract change? | [Contract diff and evolution](./contracts/api-diff-and-evolution.md) |
| How is the offline review page produced, gated and published? | [The offline review workbench](./contracts/offline-workbench.md) |
| How does the in-app review loop (`Alt+R`) preview, go stale and export? | [The review hub and review export](./desktop/review-hub.md) |
| What owns the filesystem, the windows and the IPC surface? | [Desktop app shell and IPC surface](./desktop/app-shell.md) |
| How is the model drawn and edited? | [Canvas layout, inspector and diagnostics](./desktop/canvas-and-inspector.md) |
| How do prose/blueprint ingestion and agent patch review work? | [Ingestion and agent patch review](./desktop/ingestion-and-patch-review.md) |
| How is an exported trace read as drift, and who moves next? | [Production drift, replay and governance decisions](./workflows/production-governance.md) |
| How do I build, package and ship it? | [Workspace, build, packaging and release](./operations/build-and-package.md) |
| How does the repository test itself? | [Verification strategy and fixtures](./testing/verification-strategy.md) |

## Common first tasks

**Open an existing model.** `pnpm desktop`, then pick the project folder or the
`*.evidence.json` file. Opening reads the saved source; nothing is generated on
open and no instructions are discovered from the working copy.

**Review what you have before handing it off.** `Alt+R` opens the review hub, the
toolbar delivery button previews services, links, routes and limitations, and the
simulation button replays scenarios. The delivery preview and the replay read the
saved sources in the main process. The review hub previews the document in front of
you, states whether that snapshot is the saved model or an unsaved edit, and
refuses a preview whose disk inputs changed while it was assembled — so a page is
never exported as if it described a model it was not built from.

**Decide differently than the model.** Export the page, deliver the contract
bundle, or take the reverse direction and audit an OTLP/JSON trace against the
model — see
[Production drift, replay and governance decisions](./workflows/production-governance.md).

**Connect an external agent.** The app registers `evidence-desktop` in Cursor and
Claude Desktop when those clients exist and serves a per-user local socket. Of the
fourteen tools, only `apply_model_patch` and the three operator tools change the
model, and all four dispatch through the same undo history a human edit uses (see
[External agents over MCP](./agents/mcp-integration.md)).

## Three boundaries worth knowing on day one

1. **The model is the source of truth.** Canvas, CLI, sensors and generators read
   the same document. A check report or export is only as current as what was
   saved — which is why a preview says whether it describes the saved model or an
   unsaved edit.
2. **Consistency is not delivery readiness.** A consistent model can still owe a
   key-data decision, lack a scope, or leave the HTTP contract incomplete. Gaps
   and advisories are reported separately from errors, and they do not stop a
   projection from being written.
3. **Nothing is installed beside the app.** Prompts, JSON Schemas and page assets
   live in the libraries; the agent runs with `noSkills: true`, so a project is
   its `.evidence/` sources and nothing else ([ENVIRONMENT.md](../ENVIRONMENT.md)).

## Related pages

- [System map and dependency direction](./architecture/overview.md)
- [Workspace, build, packaging and release](./operations/build-and-package.md)
- [Verification strategy and fixtures](./testing/verification-strategy.md)
