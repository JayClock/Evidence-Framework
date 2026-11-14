# @evidence-poc/desktop

Electron desktop workspace for the Fulfillment Modeling source tree. It opens a
local `<project>/.evidence/fm` directory, draws the model as an interactive
canvas and writes edits back to the same JSON files that Git, the sensors and
the MCP tools already read.

## Run

```bash
nx start desktop        # Electron Forge dev (Vite HMR for the renderer)
nx test desktop         # vitest: node project store + jsdom renderer
nx typecheck desktop    # tsc for app and spec configs
nx build desktop        # Vite bundles in .vite/ + unpacked app in out/
nx package desktop      # alias for build, kept for muscle memory
nx make desktop         # installers in apps/desktop/out/make
```

`build` is the Nx contract entry point: it is cached, declares `.vite` and
`out` as outputs and is what `nx run-many -t build --all` runs. `package` and
`make` depend on it instead of re-invoking Electron Forge from scratch.

`electron-forge start` needs a display; the test targets do not.

## Bundled instructions and assets, no interpreter

The sensors run in-process, so the installer works on a machine with no Python
and no checkout of this repository. Nothing is discovered from the project
either: an opened folder only has to hold its `.evidence/` sources.

- The instructions the session starts with are code —
  `@evidence-poc/evidence-agent-core/src/prompts/` (role, modeling red lines,
  the turn loop). They are appended to Pi's prompt, and the session asks for
  `noSkills: true`, so no working copy is scanned for `SKILL.md` and the model is
  never invited to go looking for one.
- Every sensor — consistency, key data, timeline, scenarios and the stage gate —
  is TypeScript. `@evidence-poc/evidence-modeling-orchestrator`
  reads the model once per run and decides from that one read.
- `build` and `make` first run `scripts/prepare-desktop-resources.mjs`
  (`prepare-resources` target), which copies the review page assets into the
  tree Forge ships through `extraResource` — next to `app.asar` rather than
  inside it, because the page compiler reads them with `node:fs`:

```text
resources/
└── assets/            # libs/evidence-visualization/assets copied verbatim
```

`installAssets.ts` reads `<resources>/assets` when packaged and, in development,
`apps/desktop/resources/assets` after the copy or the workspace package directly.
No interpreter variable and no skill directory are published to the agent's
environment: nothing starts a script and no path is left to guess.

See [ENVIRONMENT.md](../../ENVIRONMENT.md) for the workspace the checks, the API
projection and the review page all come from.

## Layout

```text
apps/desktop/
├── src/
│   ├── main/          # main process: windows, IPC, ProjectStore, watcher,
│   │                  # agentRuntime (Pi session), sensorRuntime (debounce)
│   ├── preload/       # the only `contextBridge` surface (index.ts)
│   ├── renderer/      # React 19 UI: canvas, inspector, outline, agent copilot,
│   │                  # docked console and status bar
│   └── shared/        # IPC channel names and payload contracts (project, agent)
├── resources/         # build output: the bundled page assets (gitignored)
├── tests/             # integration tests against the product-procurement fixture
└── forge.config.mjs   # entries: src/main/main.ts, src/preload/index.ts
```

The folder per process mirrors Electron's runtime boundaries: `main/` may import
`node:*`, `preload/` only talks to `electron` + `shared/`, `renderer/` is plain
DOM and reaches the main process exclusively through `window.evidenceAPI`.
Forge names the preload bundle after its entry, so `vite.preload.config.mjs`
pins `preload.js` — the name `windows.ts` loads.

Renderer modules map onto the four packages built earlier:

| Renderer concern                       | Source of truth                                |
| -------------------------------------- | ---------------------------------------------- |
| documents, undo, commands              | `@evidence-poc/evidence-model-core/browser`    |
| inspector groups and fields            | `@evidence-poc/evidence-schema`                |
| layout, viewport, rulers, highlighting | `@evidence-poc/evidence-canvas-interaction`    |
| agent session, sensor engine mode      | `@evidence-poc/evidence-agent-core`            |
| sensors, tools                         | `@evidence-poc/evidence-modeling-orchestrator` |

`/browser` is the model-core entry that excludes `node:fs`, so the renderer
bundle never pulls a Node built-in.

## Module resolution

Workspace libraries are consumed **from source**, not from their built `dist`.
Each `libs/*/package.json` exports a `@evidence-poc/source` condition and
`tsconfig.base.json` sets `customConditions` to the same value, so TypeScript,
the three Vite configs and the Vitest config all resolve a package to its
`src/index.ts`. Adding a library therefore means adding a path mapping nowhere —
only the package's own `exports` field.

Electron is strict about the two runtimes: the main and preload configs add the
`node` condition, the renderer config adds `browser`, and renderer code imports
a library's `/browser` entry whenever a Node-only adapter exists.

## Data flow

```text
.evidence/fm  ──readModelDirectory──▶  ProjectStore.main
      ▲                                     │ IPC: project:open
      │ writeModelDirectory                 ▼
      └──────── project:save ──────  ModelSession (renderer)
                                            │ dispatch(command)
                                            ▼
                                    DomainGraph → createGraphLayout → canvas
```

- Every edit is a command with an inverse, so `Cmd/Ctrl+Z` and the canvas never
  disagree.
- `project:save` rewrites only changed files through a temp file plus atomic
  rename; unchanged files stay byte-identical, which keeps `git diff` quiet.
- A debounced watcher on `.evidence/fm` reports external writes (Git checkout,
  agent, script) and the status bar offers a reload instead of silently
  overwriting.
- The renderer sees only `window.evidenceAPI` (open, save, recent, dialog,
  changed); there is no `ipcRenderer`, `fs` or Node access.

## Interaction contract

- Context cards are containers: nested, titled, never selectable business
  objects; empty shells are dropped before drawing.
- One dashed boundary wraps each Request with its confirmations and proofs;
  Request and results stay horizontally aligned.
- Evidence is a rectangle, participants and roles are rounded cards, text is
  horizontally centred and vertically centred as a block, responsibility is a
  corner badge fed only by `responsibleRoleRef`.
- Hover or keyboard focus highlights the object plus one hop; a Context hover
  emphasises its subtree and only the edges fully inside it.
- Edges are dashed across Context boundaries and arrowed only for
  `plays_role`; cardinality appears in standard mode.
- Wheel pans, Ctrl/Cmd+wheel zooms at the pointer, space+drag pans, dragging the
  background draws a marquee selection.

## Agent and sensors (phase 3)

```text
AgentCopilot ──IPC: agent:prompt──▶ agentRuntime (main)
                                    │ Pi AgentSession + built-in instructions
                                    │ custom tools: run_sensors,
                                    │   apply_model_patch, get_canvas_selection
                                    ▼
                     IPC: agent:apply-patch ──▶ ModelSession (renderer)
                                    ▲
                                    └─ respondPatch(result) — same undo stack
                     IPC: sensor:model-changed ──▶ debounced sensorRuntime
                                    ▼
                     IPC: sensor:report ──▶ status bar + docked console
```

- The renderer holds no model credentials and never runs Python; it asks the
  main process and applies patches through its live session.
- A patch is plain JSON (`ModelPatchCommand`), decoded into real commands by
  `evidence-model-core` so guards and `Cmd/Ctrl+Z` behave exactly as for a human
  edit.
- Sensors run in-process and are the only implementation: there is no mode to
  select and no interpreter to install.
- Key data that still owes a provider decision is a warning, not a static error,
  but it keeps `isStageGateReady` false — the model can be saved, the gate stays
  shut.
- `AgentCopilot` sends when idle and steers the live run when busy, so a wrong
  assumption is corrected in place instead of restarting the round. It shares
  the right rail with the inspector: reasoning folds away, each tool call opens
  for its input, and a pending patch is reviewed inline with a click that pans
  the canvas to the object it touched.

## Key data, CEL and fulfillment editing (phase 4)

- The attribute table edits through commands (`add-attribute`,
  `remove-attribute`, `update-attribute`), so structural edits share the undo
  stack with text edits.
- Each key data row shows the provider the sensor engine classifies: contract
  term, domain source, negotiation source, result fact, request formation input,
  derived rule — or "decision owed". Nothing is stored for it; the badge is derived
  from the model, so it cannot drift from the ledger.
- The inline CEL editor completes aliases and attributes from the graph and
  pre-checks unbalanced brackets, undeclared identifiers and unknown attributes
  while typing. The sensor engine stays the authority; the editor only prevents
  obviously broken rules from being saved.
- A `fulfillment_request` exposes its completion condition, the confirmation that
  decides it and the breach condition. Pairing only offers confirmations in the
  same Contract Context, and a rejected guard is shown in the panel instead of
  crashing the window.

## MCP bridge (phase 4)

```text
Cursor / Claude Code / CLI ──stdio──▶ evidence (--mcp-stdio, headless)
                                        │ local socket (0600 / named pipe)
                                        ▼
                              main process: bridge + capture
                                        │ IPC: mcp:request / mcp:response
                                        ▼
                              renderer: ModelSession + projections
```

- `nx build evidence-mcp` builds the protocol package; the desktop declares it as
  a dependency and Vite aliases it in tests.
- Seven tools: `get_app_state`, `get_domain_model`, `get_selected_entity`,
  `get_key_data_audit`, `get_canvas_screenshot`, `apply_model_patch`,
  `run_stage_gate`.
- `apply_model_patch` is the only writer and it decodes into the same commands a
  human edit uses, so an external agent's change is one ⌘Z step.
- Screenshots are captured with selection rings and the zoom control hidden, so a
  multimodal agent reviews the model, not the editor.
- The app merges its server entry into `~/.cursor/mcp.json` and the Claude Desktop
  config when those directories already exist; the merge is idempotent and keeps
  every other server.

## Not implemented yet

- The packaged app has not been signed or notarized on this machine.
