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
├── client/            # main process: windows, IPC, ProjectStore, watcher
├── shared/            # IPC channel names and payload contracts
├── renderer/          # React 19 UI: canvas, inspector, sidebar, status bar
└── tests/             # integration tests against the product-procurement fixture
```

Renderer modules map onto the four packages built earlier:

| Renderer concern                       | Source of truth                             |
| -------------------------------------- | ------------------------------------------- |
| documents, undo, commands              | `@evidence-poc/evidence-model-core/browser` |
| inspector groups and fields            | `@evidence-poc/evidence-schema`             |
| layout, viewport, rulers, highlighting | `@evidence-poc/evidence-canvas-interaction` |

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

## Not implemented yet

Agent orchestration (PromptDock, activity stream) and the MCP sidecar belong to
Phases 3 and 4; the window shell and IPC surface already leave room for both.
