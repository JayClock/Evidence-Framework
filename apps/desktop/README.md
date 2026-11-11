# @evidence-poc/desktop

Electron desktop workspace for the Fulfillment Modeling source tree. It opens a
local `<project>/.evidence/fm` directory, draws the model as an interactive
canvas and writes edits back to the same JSON files that Git and the skills
already read.

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

## Bundled skills, no interpreter

The sensors run in-process, so the installer works on a machine with no Python
and no checkout of this repository. `build` and `make` first run
`scripts/prepare-desktop-resources.mjs` (`prepare-resources` target), which
copies the modeling skills into the tree Forge ships through `extraResource` —
next to `app.asar` rather than inside it, because Pi lists the skill directory
with `node:fs` and opens fixtures by path:

```text
resources/
└── skills/            # .agents/skills/evidence-* copied verbatim
```

- `resolveSkillsRoot` prefers `<project>/.agents/skills`, then
  `<resources>/skills`, then the workspace tree while developing.
- Every sensor — consistency, key data, interview trace, timeline, scenarios and
  the stage gate — is TypeScript. `@evidence-poc/evidence-modeling-orchestrator`
  reads the model once per run and decides from that one read.
- `EVIDENCE_SENSORS_ENGINE=python|native|shadow` picks the implementation:
  `native` is the default, `python` runs the locked scripts (it needs the
  repository's virtual environment), and `shadow` runs both and reports every
  field they disagree about as a `SENSOR_DRIFT` warning.
- The agent's shell gets `EVIDENCE_SKILLS_ROOT`, `SKILL_DIR` and one
  `*_SKILL_DIR` per package, re-asserted before each prompt, so the paths the
  skill guides quote resolve without the model guessing. `PYTHON` is published
  only when an interpreter actually resolves; a native run needs none. Per-project
  paths stay out of the environment — several project windows share one process —
  and come from the shell's working directory instead.

See [ENVIRONMENT.md](../../ENVIRONMENT.md) for the pins the skill packages are
still developed against.

## Layout

```text
apps/desktop/
├── src/
│   ├── main/          # main process: windows, IPC, ProjectStore, watcher,
│   │                  # agentRuntime (Pi session), sensorRuntime (debounce)
│   ├── preload/       # the only `contextBridge` surface (index.ts)
│   ├── renderer/      # React 19 UI: canvas, inspector, sidebar, agent panel,
│   │                  # PromptDock, sensor status bar and diagnostics drawer
│   └── shared/        # IPC channel names and payload contracts (project, agent)
├── resources/         # build output: the bundled skill tree (gitignored)
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
| sensors, tools, frontier               | `@evidence-poc/evidence-modeling-orchestrator` |

`/browser` is the model-core entry that excludes `node:fs`, so the renderer
bundle never pulls a Node built-in.

## Module resolution

Workspace libraries are consumed **from source**, not from their built `dist`.
Each `packages/*/package.json` exports a `@evidence-poc/source` condition and
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
PromptDock ──IPC: agent:prompt──▶ agentRuntime (main)
                                    │ Pi AgentSession + .agents/skills
                                    │ custom tools: run_sensors,
                                    │   apply_model_patch, get_canvas_selection
                                    ▼
                     IPC: agent:apply-patch ──▶ ModelSession (renderer)
                                    ▲
                                    └─ respondPatch(result) — same undo stack
                     IPC: sensor:model-changed ──▶ debounced sensorRuntime
                                    ▼
                     IPC: sensor:report ──▶ status bar + diagnostics drawer
```

- The renderer holds no model credentials and never runs Python; it asks the
  main process and applies patches through its live session.
- A patch is plain JSON (`ModelPatchCommand`), decoded into real commands by
  `evidence-model-core` so guards and `Cmd/Ctrl+Z` behave exactly as for a human
  edit.
- Sensors run in-process. `EVIDENCE_SENSORS_ENGINE=python` still runs the locked
  scripts, and a missing environment then reports `SENSOR_UNAVAILABLE` blocks
  with a `./init.sh` hint rather than a silent pass.
- Key data that still owes a provider decision is a warning, not a static error,
  but it keeps `isStageGateReady` false — the model can be saved, the gate stays
  shut.
- `PromptDock` sends when idle and steers the live run when busy, so a wrong
  assumption is corrected in place instead of restarting the round.

## Key data, CEL and fulfillment editing (phase 4)

- The attribute table edits through commands (`add-attribute`,
  `remove-attribute`, `update-attribute`), so structural edits share the undo
  stack with text edits.
- Each key data row shows the provider the pinned checker would classify:
  contract term, domain source, negotiation source, result fact, request formation
  input, derived rule — or "decision owed". Nothing is stored for it; the badge is
  derived from the model, so it cannot drift from `audit_key_data.py`.
- The inline CEL editor completes aliases and attributes from the graph and
  pre-checks unbalanced brackets, undeclared identifiers and unknown attributes
  while typing. The pinned Python checker stays the authority; the editor only
  prevents obviously broken rules from being saved.
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

## Interview branches (phase 5)

```text
.evidence/fm                        <- the checkout every skill and sensor reads
.evidence/traces/interview-trace.json
.evidence/branches/manifest.json    <- which branch is checked out
.evidence/branches/<id>/fm          <- that branch's own source tree
.evidence/branches/<id>/traces      <- that branch's own interview trace
.evidence/branches/<id>/session.jsonl <- transcript forked at a checkpoint
.evidence/branches/<id>/branch.json <- lineage, status, last verdict
```

- Branching stays model-level on purpose: `.evidence/fm` is still the only tree
  the skills, the sensors, the MCP tools and Git read, so an assumption is a
  checkout, not a second dialect of the project layout.
- `main` is a branch too. Forking, switching and merging all snapshot the
  checkout back to its own branch first, so moving between assumptions cannot
  drop an edit; `nx test desktop` proves the round trip both ways.
- A fork copies the model tree, the interview trace and — when a transcript
  exists — a transcript forked at the chosen entry. The fork keeps the ancestry
  of that entry and leaves the abandoned siblings in the source file, so a branch
  cannot inherit a conclusion it never reached.
- A checkout drops the agent runtime and re-resolves the branch transcript, so
  the next prompt continues that lineage instead of the previous one.
- The inspector panel compares the checkout with one other branch: object and
  attribute movement, the key data provider that moved, and the two stored
  verdicts. A branch that never ran its sensors reports as *not comparable*, not
  as healthy.
- The canvas draws objects only the compared branch models as dashed ghosts at
  that branch's own layout position, and rings removed objects red and changed
  ones amber. The active layout is never recomputed, so reading a diff does not
  move the model being edited.
- Merging writes the winning tree to both the checkout and the `main` snapshot and
  marks the source branch `merged`; `keepSourceBranch: false` discards it instead.
  The checkout keeps the same atomic, byte-stable writes as a normal save, so
  `git diff` only shows the files the decision actually changed.

## Not implemented yet

- A branch comparison cannot show a branch's findings by message: only the stored
  verdict snapshot (counts and gate movement) travels with the branch metadata.
- The packaged app has not been signed or notarized on this machine.
