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
  the model ledger. Select it again to return to the previous canvas layout.
- Use **Cmd/Ctrl+K** to search for business objects and jump to them.
- **业务流放映** runs on the canvas. Open **剧情详情** for narration, scene details
  and What-If questions without adding a second viewport.

## AI configuration (no Pi CLI required)

Use the **AI** badge on the dashboard/editor, **Cmd/Ctrl+,**, or search for
**配置大模型 / AI Settings** in the editor's **Cmd/Ctrl+K** command palette.
Select a provider, enter its API key and model, optionally customize Base URL
and thinking level, then **测试连通性** or **保存并生效**. Testing sends a small
completion request (possibly billable), uses a temporary runtime and times out
after 15 seconds; it does not save the draft key or change the active model.

- Presets cover DeepSeek, Qwen/DashScope, Anthropic, OpenAI, Gemini, OpenRouter,
  MiniMax, Kimi and custom OpenAI-compatible gateways. Built-in model metadata
  and wire protocols come from the pinned Pi SDK. DashScope and custom model
  IDs use an explicit OpenAI-completions provider with conservative text-only
  metadata (32K context / 4K output); they do not discover server capabilities.
- For Ollama, choose the custom endpoint, enter an installed model ID and
  `http://localhost:11434/v1`. Loopback custom endpoints can be keyless;
  remote endpoints require a key. Blank API-key input retains the stored key;
  **清空输入** clears only the form, not the saved credential.
- Without configuration, Copilot offers setup instead of sending. Story mode
  uses **仅模型事实** offline; AI narration and What-If offer setup. Contract,
  blueprint and rule-based text import remain available without a model.
- Saving replaces the shared runtime, aborts/disposes old Copilot sessions and
  resumes their persisted transcript on the next prompt. Canvas edits, undo
  history and sensor state stay intact. Story AI projectors are invalidated;
  already-running one-shot ingestion requests keep their captured runtime.
- The app never automatically reads or writes `~/.pi/agent/auth.json` or
  `models.json`. When an auth file exists, settings offers **一键导入现有配置**:
  explicit, read-only credential import, no overwrite of existing desktop keys,
  no execution of shell-backed API keys. CLI model definitions are not imported.
  SDK environment credentials are supported without importing; DashScope accepts
  `DASHSCOPE_API_KEY` / `QWEN_API_KEY`. Launch the app from the appropriate
  environment when using this developer path.

All desktop AI state lives beneath Electron's `app.getPath('userData')`:

| Path                   | Contents                                                             |
| ---------------------- | -------------------------------------------------------------------- |
| `ai-auth.bin`          | OS `safeStorage` encrypted credentials; atomic writes with mode 0600 |
| `ai-settings.json`     | Provider, model, Base URL and thinking level; **no API keys**        |
| `ai-models.json`       | Optional app-private SDK model definitions, not the CLI file         |
| `ai-models-store.json` | SDK catalog cache                                                    |
| `ai-agent/`            | SDK settings/resources and persisted Copilot transcripts             |

The renderer only receives public model/status data, never saved keys. Keys are
password-masked, submitted via the restricted preload API and cleared from the
form after save/provider change/close. Only send credentials to trusted Base
URLs. On Linux, unavailable keyrings or the insecure `basic_text` backend **do
not fall back to plaintext**: enable a system keyring or use environment
credentials. Corrupt/undecryptable auth files fail closed and are preserved;
there is no silent reset that could overwrite them.

This intentionally tightens two contradictory examples in the original plan:
CLI auth is explicit import rather than a hidden runtime fallback, and lack of
OS encryption is an actionable error rather than plaintext persistence.

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

| Renderer concern                         | Source of truth                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| documents, undo, commands                | `@evidence-poc/evidence-model-core` (universal)                                                       |
| IPC DTOs and channel constants           | `@evidence-poc/desktop-contracts`                                                                     |
| layout, viewport, rulers                 | `@evidence-poc/evidence-canvas-interaction`                                                           |
| canvas and inspector UI                  | `@evidence-poc/desktop-feature-canvas`, `desktop-feature-inspector`                                   |
| story, delivery, drift, Copilot UI/hooks | `desktop-feature-story`, `desktop-feature-delivery`, `desktop-feature-drift`, `desktop-feature-agent` |
| browser sensor/event DTOs and labels     | `@evidence-poc/evidence-agent/browser`                                                                |
| inline acceptance compilation            | `@evidence-poc/evidence-acceptance/projection`                                                        |
| shared scripted API/renderer fixtures    | `@evidence-poc/desktop-testing` (tests only)                                                          |

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

- The renderer never receives saved model credentials (only transient settings
  form input) and never runs Python; it asks the
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
