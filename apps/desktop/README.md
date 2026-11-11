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
nx package desktop      # unpacked app in apps/desktop/out
```

`electron-forge start` needs a display; the test targets do not.

## Layout

```text
apps/desktop/
├── client/            # main process: windows, IPC, ProjectStore, watcher,
│                      # agentRuntime (Pi session), sensorRuntime (debounce)
├── shared/            # IPC channel names and payload contracts (project, agent)
├── renderer/          # React 19 UI: canvas, inspector, sidebar, agent panel,
│                      # PromptDock, sensor status bar and diagnostics drawer
└── tests/             # integration tests against the product-procurement fixture
```

Renderer modules map onto the four packages built earlier:

| Renderer concern                       | Source of truth                                |
| -------------------------------------- | ---------------------------------------------- |
| documents, undo, commands              | `@evidence-poc/evidence-model-core/browser`    |
| inspector groups and fields            | `@evidence-poc/evidence-schema`                |
| layout, viewport, rulers, highlighting | `@evidence-poc/evidence-canvas-interaction`    |
| agent session, pinned interpreter      | `@evidence-poc/evidence-agent-core`            |
| sensors, tools, frontier               | `@evidence-poc/evidence-modeling-orchestrator` |

`/browser` is the model-core entry that excludes `node:fs`, so the renderer
bundle never pulls a Node built-in.

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
- Sensors run with the pinned interpreter only. A missing environment reports
  `SENSOR_UNAVAILABLE` blocks with a `./init.sh` hint rather than a silent pass.
- Key data that still owes a provider decision is a warning, not a static error,
  but it keeps `isStageGateReady` false — the model can be saved, the gate stays
  shut.
- `PromptDock` sends when idle and steers the live run when busy, so a wrong
  assumption is corrected in place instead of restarting the round.

## Not implemented yet

The MCP sidecar belongs to Phase 4; the main process already owns the IPC
surface and the tool layer it will expose.
