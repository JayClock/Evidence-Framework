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

## Editor navigation

- Select **总台账** in the left sidebar (Cmd/Ctrl+1) to replace the canvas with
  the read-only entity ledger. Filter by category, entity, context, or CEL
  invariant; **导出 CSV** downloads every matching entity, not just the visible
  rows. **定位画布**, or selecting **总台账** again, returns to the previous canvas
  layout. Use the inspector to edit fields or rules.
- Use **Cmd/Ctrl+K** to search for business objects and jump to them.
- **业务流放映** runs on the canvas. Open **剧情详情** for narration, scene details
  and What-If questions without adding a second viewport. The upper-left canvas
  toolbar controls zoom, fit and density; its **更多画布工具** contains the grid
  and scenario actions.
- Use **实体属性检查** in the right pane to edit the selected object. **返回画布**
  returns keyboard focus without dropping the selection. **Alt+L** opens the
  selected entity’s field ledger. Applying an edited CEL invariant updates the
  current model and can be undone; passing the inline syntax/reference check
  does not imply the model passed the gate. **Cmd/Ctrl+Shift+R** reruns checks.

## AI configuration

Evidence uses the Pi SDK to read the global Pi settings, model definitions and
credentials from `~/.pi/agent` or from `PI_CODING_AGENT_DIR` in the app's launch
environment. Set up credentials in Pi (for example, with `/login`) and define
custom endpoints in Pi's [`models.json`](https://pi.dev/docs/models-configuration).
Only providers and credentials the SDK can resolve are available; terminal-only
environment variables must also be present in the app's environment. Evidence
loads neither project settings nor user CLI extensions for its modeling sessions.

Open **配置大模型 / AI Settings** from the AI badge, **Cmd/Ctrl+,**, or the
editor command palette. The panel shows the effective model and groups the
available models by provider. **设为默认模型** updates the shared Pi default;
choosing a thinking level also updates Pi settings. **测试连通性** sends a small,
potentially billable completion request and times out after 15 seconds. It does
not change the model selection.

Selecting a model refreshes the agent and story sessions; canvas edits and undo
history are unaffected. Desktop transcripts are stored by project under
`sessions/` in Electron's `userData` directory. Without an available model,
canvas inquiries offer setup and offline story projection and import remain
available.

## Bundled instructions, no interpreter

The sensors run in-process, so the installer works on a machine with no Python
and no checkout of this repository. Nothing is discovered from the project
either: an opened folder only has to hold its `.evidence/` sources.

- The instructions the session starts with are code —
  `@evidence-poc/evidence-agent/src/prompts/` (role, modeling red lines,
  the turn loop). They are appended to Pi's prompt, and the session asks for
  `noSkills: true`, so no working copy is scanned for `SKILL.md` and the model is
  never invited to go looking for one.
- Every sensor — consistency, key data and the stage gate —
  is TypeScript. `@evidence-poc/evidence-agent` reads the model once per run
  and decides from that one read.

No interpreter variable and no skill directory are published to the agent's
environment: nothing starts a script and no path is left to guess.

See [ENVIRONMENT.md](../../ENVIRONMENT.md) for the workspace the checks and API
projection come from. The renderer composes native canvas, diagnostics, story and
delivery views from the feature libraries below.

## Layout

```text
apps/desktop/
├── src/
│   ├── main/          # main process: windows, IPC, ProjectStore, watcher,
│   │                  # agentRuntime (Pi session), sensorRuntime (debounce)
│   ├── preload/       # the only `contextBridge` surface (index.ts)
│   └── renderer/      # editor shell and remaining screens; composes Feature libs
├── tests/             # integration tests against the product-procurement fixture
└── forge.config.mjs   # entries: src/main/main.ts, src/preload/index.ts
```

The folder per process mirrors Electron's runtime boundaries: `main/` may import
`node:*`, `preload/` talks to `electron` and `desktop-contracts`, and `renderer/`
is plain DOM. Only the application shell reads `window.evidenceAPI`; feature hooks
receive narrow, typed API ports explicitly.
Forge names the preload bundle after its entry, so `vite.preload.config.mjs`
pins `preload.js` — the name `windows.ts` loads.

Renderer behavior is shared through Nx libraries:

| Renderer concern                         | Source of truth                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| documents, undo, commands                | `@evidence-poc/evidence-model-core` (universal)                              |
| IPC DTOs and channel constants           | `@evidence-poc/desktop-contracts`                                            |
| layout, viewport, rulers                 | `@evidence-poc/evidence-canvas-interaction`                                  |
| canvas and inspector UI                  | `@evidence-poc/desktop-feature-canvas`, `desktop-feature-inspector`          |
| story, delivery, modeling agent UI/hooks | `desktop-feature-story`, `desktop-feature-delivery`, `desktop-feature-agent` |
| browser sensor/event DTOs and labels     | `@evidence-poc/evidence-agent/browser`                                       |
| inline acceptance compilation            | `@evidence-poc/evidence-acceptance/projection`                               |
| shared scripted API/renderer fixtures    | `@evidence-poc/desktop-testing` (tests only)                                 |

The feature libraries own their colocated tests. `EditorScreen` still coordinates
selection, layout and cross-feature behavior; project services, window lifecycle
and IPC registration remain in the Electron main process. No library imports
application files. Node agent/acceptance implementations are never imported as
runtime code by a browser feature.

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

Type a business example on an empty canvas or press **Cmd/Ctrl+K** to open
**业务场景头脑风暴** on an existing canvas. The agent places evidence cards in
lifecycle order and the viewport frames the new cards. Command search is still
available from the header or **Cmd/Ctrl+Shift+K**.

Use **溯源** directly on an evidence card to ask where its unknown fields come
from. A paired request or confirmation also offers **What-If**. The opening
question is read-only; follow-up answers stay pinned to the initiating evidence
and can commit model patches. The right inspector only shows model properties,
key data and rules, or an overview when nothing is selected.

## Agent and sensors (phase 3)

```text
Canvas storming / node inquiry ──▶ agentRuntime (main) via agent:prompt
                                    │ Pi AgentSession + built-in instructions
                                    │ custom tools: get_focused_node_context,
                                    │   evidence growth, apply_model_patch
                                    ▼
                main commits an atomic PatchTransaction to its live model
                                    │
                                    ▼
                agent:patch-committed ──▶ ModelSession (renderer undo history)
                sensor:model-changed  ──▶ debounced sensors (human edits)
                sensor:report         ──▶ status bar + diagnostics
```

- The renderer never receives stored model credentials. During a turn, local
  document writes pause while main validates and commits AI patches against the
  published revision. Tool calls do not wait for a renderer acknowledgement.
- The editor replays versioned RFC 6902 transactions using the provided inverse
  patches. The result also carries committed transactions so missed broadcasts
  can be recovered in order. `Cmd/Ctrl+Z` undoes them alongside human edits.
- Sensors run in-process and are the only implementation: there is no mode to
  select and no interpreter to install.
- Key data that still owes a provider decision is a warning, not a static error,
  but it keeps `isStageGateReady` false — the model can be saved, the gate stays
  shut.
- Modeling turns run one at a time. A node inquiry shows reasoning, tool activity
  and its patch review on the card. Storming patches and reviews whose inquiry
  closed are shown in a canvas banner. Applying the review keeps the committed
  edits; undo takes the latest edit back. Saving remains explicit.

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
