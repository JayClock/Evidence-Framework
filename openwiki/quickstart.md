---
type: guide
title: Quickstart
description: What Evidence is, how to run it from a fresh clone, and which wiki page answers which question.
tags: [quickstart, onboarding, navigation, commands]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-12T12:33:13.984Z
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-5d33672c45ec58cd29dce507
    resource: repo://apps/desktop/src/main/main.ts
  - id: openwiki-source-18fab4844d8695b257bd644b
    resource: repo://docs/workspace-layout.md
  - id: openwiki-source-0c1cc5dc86ad401eb9678504
    resource: repo://ENVIRONMENT.md
  - id: openwiki-source-df757265b9e1070807ea34fe
    resource: repo://libs/evidence-api/src/cli.ts
  - id: openwiki-source-aac6631a251b846350b2d550
    resource: repo://libs/evidence-mcp/src/server/toolset.ts
  - id: openwiki-source-9e1c9e40521fc9e802e78473
    resource: repo://libs/evidence-model-core/src/cli.ts
  - id: openwiki-source-7a2d89c223533648b5710a12
    resource: repo://libs/evidence-visualization/src/cli.ts
  - id: openwiki-source-28ab8d38fd5d45f412609ea7
    resource: repo://libs/evidence-visualization/src/publish/workbenchPublisher.ts
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
generated: { by: "pi", at: "2026-11-12T12:33:13.984Z" }
---

# Quickstart

Evidence is a language-independent workbench for backend business models. Instead
of binding entities to an ORM and endpoints to a framework, it models
**responsibilities**: who claims an obligation, which evidence discharges it, which
facts must exist, and which rules derive amounts and deadlines. The model is a
`.evidence/fm` source tree (or one `.evidence.json` bundle), edited on a canvas,
checked by an in-process engine, and projected into an API contract and an offline
review page.

The repository is one pnpm workspace with an Electron app and eight TypeScript
libraries. There is no interpreter, no Python environment and no skill tree to
install (`repo://ENVIRONMENT.md#L1-L10`, `repo://README.md#L1-L20`).

## Run it

```bash
pnpm install          # the whole setup
pnpm test             # every Vitest project
pnpm desktop          # nx start desktop
```

Equivalent explicit forms:

```bash
npx nx run-many -t test typecheck lint
npx nx start desktop
```

`pnpm` scripts are thin wrappers around `nx run-many`, so the target graph decides
what runs (`repo://package.json#L5-L17`). The desktop is the only runnable app;
libraries are consumed from `src` through the `@evidence-poc/source` export
condition (`repo://docs/workspace-layout.md#L1-L15`).

## What a project looks like

```text
my-project/
  .evidence/
    fm/
      model.json              # manifest: id, name, version, entry Contexts
      entities/
      relationships/
      rules/
      validation/             # instances + scenarios (optional)
    api/api.json              # API design (optional)
    traces/interview-trace.json
    branches/                 # interview lineages
```

Or one portable file:

```text
procurement.evidence.json     # same document, one bundle
```

Both forms feed the same readers; `modelRoot` points at the tree or the file
(`repo://AGENTS.md#L8-L16`). See
[Source tree and bundle adapters](./model/source-formats.md).

## The four commands

| Command | What it does |
| --- | --- |
| `npx evidence-model check .evidence/fm [--scope <context>]...` | runs the same FM report the app and agent tools use; exits 1 on a blocking issue |
| `npx evidence-model pack/unpack/inspect` | converts and inspects the two storage forms |
| `npx evidence-api project --project-root "$PWD" --fm .evidence/fm --fm-check check.json --api .evidence/api/api.json` | projects a checked design into resources, capabilities, HTTP, OpenAPI and vectors |
| `npx evidence-workbench generate --project-root "$PWD"` | writes the self-contained offline review page |

`ENVIRONMENT.md` shows the same four invocations
(`repo://ENVIRONMENT.md#L39-L44`); `evidence-model --help` lists the derived
commands (`compile`, `lineage`, `timeline`, `simulate`, `role-play`)
(`repo://libs/evidence-model-core/src/cli.ts#L29-L60`).

## Where to go

Ask the question, follow the page.

| Question | Page |
| --- | --- |
| How do the packages fit together, and which way do dependencies point? | [System map and dependency direction](./architecture/overview.md) |
| What can I write in a model, and what is forbidden? | [The Fulfillment Modeling DSL (FM v5)](./language/fm-dsl.md) |
| What makes an amount legal? Where do business time and provenance live? | [Key data, business time and provenance](./language/key-data-and-provenance.md) |
| How is a model stored, packed and diffed without churn? | [Source tree and bundle adapters](./model/source-formats.md) |
| How do edits happen, and why is undo reliable? | [Commands, guards and the model session](./model/commands-and-session.md) |
| What does one check actually prove? | [The native check and simulation pipeline](./model/checks-and-simulation.md) |
| How are findings folded, and when may a scope move downstream? | [Sensors, stage gate and the dependency frontier](./agents/sensor-orchestration.md) |
| How does the in-app agent work, and what tools does it get? | [The Pi agent harness and its tools](./agents/pi-harness.md) |
| How do Cursor/Claude reach the live model? | [External agents over MCP](./agents/mcp-integration.md) |
| How does a design become an API contract? | [API contract projection](./contracts/api-projection.md) |
| How is the offline review page produced and published? | [The offline review workbench](./contracts/offline-workbench.md) |
| What owns the filesystem, the windows and the IPC surface? | [Desktop app shell and IPC surface](./desktop/app-shell.md) |
| How is the model drawn and edited? | [Canvas layout, viewport and inspector](./desktop/canvas-and-inspector.md) |
| How do prose/blueprint ingestion and agent patch review work? | [Ingestion and agent patch review](./desktop/ingestion-and-patch-review.md) |
| How do interview branches, transcripts and verdict comparison work? | [Interview branches and lineage](./desktop/branches-and-lineage.md) |
| How do I build, package and ship it? | [Workspace, build and packaging](./operations/build-and-package.md) |
| How does the repository test itself? | [Verification strategy and fixtures](./testing/verification-strategy.md) |

## Common first tasks

**Open an existing model.** Start `pnpm desktop`, choose the project folder (or the
`*.evidence.json` file), and the canvas opens with the saved model. Nothing is
generated on open; the app parses the source it was given.

**Check without the app.**

```bash
npx evidence-model check .evidence/fm --scope context.product-procurement
```

Exit `0` means no blocking error; the printed report still distinguishes
consistency from scope completeness and shows the model digest.

**Project an API.**

```bash
npx evidence-model check .evidence/fm --scope context.product-procurement > check.json
npx evidence-api check --project-root "$PWD" --fm .evidence/fm --fm-check check.json --api .evidence/api/api.json
npx evidence-api project --project-root "$PWD" --fm .evidence/fm --fm-check check.json --api .evidence/api/api.json
```

`check` exits `3` while questions are open; `project` writes nothing unless the
design is complete.

**Export a review page.**

```bash
npx evidence-workbench generate --project-root "$PWD"
```

The default output is `.evidence/views/index.html`; the page is offline, read-only
and refuses to overwrite a file it did not write.

**Connect an external agent.** The app keeps a per-user local socket and registers
`evidence-desktop` in Cursor and Claude Desktop when those clients are installed.
`apply_model_patch` is the only write tool, and it dispatches into the same undo
history a human uses (see [External agents over MCP](./agents/mcp-integration.md)).

## Three boundaries worth knowing on day one

1. **The model is the source of truth.** Canvas, CLI, sensors and generators all
   read the same document; there is no database or hidden cache.
2. **Consistency is not delivery readiness.** A consistent model can still owe a
   key-data decision, lack a scope, or miss a human closure. See
   [Sensors, stage gate and the dependency frontier](./agents/sensor-orchestration.md).
3. **There is no skill tree or interpreter to install.** Instructions, schemas and
   page assets ship inside the libraries
   (`repo://ENVIRONMENT.md#L23-L33`).

## Related pages

- [System map and dependency direction](./architecture/overview.md)
- [Workspace, build and packaging](./operations/build-and-package.md)
- [Verification strategy and fixtures](./testing/verification-strategy.md)
