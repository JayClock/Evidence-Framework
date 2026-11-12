---
type: architecture
title: Desktop app shell and IPC surface
description: How the Electron main process, the typed preload bridge and the React renderer divide ownership — project storage, model paths, windows, external-change watching, review export and MCP stdio mode.
tags: [desktop, electron, ipc, preload, project-store, windows]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-12T12:33:13.984Z
sources:
  - id: openwiki-source-29a03c686cfbb53a357cc349
    resource: repo://apps/desktop/src/main/installAssets.ts
  - id: openwiki-source-5d33672c45ec58cd29dce507
    resource: repo://apps/desktop/src/main/main.ts
  - id: openwiki-source-e8d8a05aad1d7c63bcff6353
    resource: repo://apps/desktop/src/main/modelSource.ts
  - id: openwiki-source-934367cee5dc2ef07c9fb835
    resource: repo://apps/desktop/src/main/modelWatcher.ts
  - id: openwiki-source-7bb156d03ddba2cff4399f8b
    resource: repo://apps/desktop/src/main/projectIpc.ts
  - id: openwiki-source-7d6301f8bedb09df7ce20329
    resource: repo://apps/desktop/src/main/projectStore.ts
  - id: openwiki-source-310af6f70610151f6693b6d6
    resource: repo://apps/desktop/src/main/reviewIpc.ts
  - id: openwiki-source-96631daa0b2c8e332a97ecb3
    resource: repo://apps/desktop/src/main/windows.ts
  - id: openwiki-source-e7883d7e0923e51ae8b6bf50
    resource: repo://apps/desktop/src/preload/index.ts
  - id: openwiki-source-9907bd51adc4e23040fa45e9
    resource: repo://apps/desktop/src/shared/ipc.ts
generated: { by: "pi", at: "2026-11-12T12:33:13.984Z" }
---

# Desktop app shell and IPC surface

`apps/desktop` is the only runnable application, and it is deliberately thin as a
*product*: almost every decision belongs to a library. What the shell owns is
process boundaries — where the filesystem lives, where the live model lives, and
which of the two may talk to the other.

The split is stated in one place and enforced by the runtime:
`contextIsolation: true`, `nodeIntegration: false`, and a preload script that
exposes a typed `evidenceAPI` object
(`repo://apps/desktop/src/main/windows.ts#L38-L48`,
`repo://apps/desktop/src/preload/index.ts#L32-L36`). The renderer never receives
`ipcRenderer`, `fs` or any Node module.

## Startup order

`startApplication` runs after Electron is ready and assembles the process graph in
a fixed order (`repo://apps/desktop/src/main/main.ts#L57-L142`):

1. Create the project store, pointed at `recent-projects.json` under Electron's
   `userData`.
2. Create the branch store and register the agent IPC, giving it the active
   branch's transcript and a report sink.
3. Register project, ingestion, review and branch IPC.
4. Derive the MCP endpoint, synchronize client configs, start the local bridge and
   register its renderer IPC.
5. Open the dashboard window.

A failure to start the MCP bridge is reported to stderr and swallowed: the app
continues without external-agent access rather than refusing to open
(`repo://apps/desktop/src/main/main.ts#L125-L140`).

The same executable has a second mode. With `--mcp-stdio` it opens no window,
reads no project store and registers nothing; it runs the stdio MCP server against
the derived endpoint and exits
(`repo://apps/desktop/src/main/main.ts#L30-L55`,
`repo://apps/desktop/src/main/main.ts#L145-L146`).

## Windows

There are two kinds of window:

- **Dashboard** (`1024×680`, min 900×600) lists recent projects and starter
  templates.
- **Editor** (`1440×900`, min 1180×760) opens one project root.

`openEditorWindow` keeps a `Map<rootPath, BrowserWindow>` and focuses the existing
window instead of stacking duplicates for the same tree; a `closed` listener
removes the entry
(`repo://apps/desktop/src/main/windows.ts#L67-L95`). `listEditorWindows` returns
the map's values, which is how the MCP bridge decides which renderer owns the live
model.

Both windows are frameless with a hidden title bar; on macOS the shell uses
vibrancy and transparent traffic lights. Routing is hash-based so the packaged
`file://` build works without a server:
`#/dashboard` and `#/editor?rootPath=<encoded>`
(`repo://apps/desktop/src/main/windows.ts#L18-L36`, `App.tsx` parses the same
form).

## The preload surface is the whole renderer API

`EvidenceDesktopApi` declares exactly six groups
(`repo://apps/desktop/src/shared/ipc.ts#L55-L115`):

| Group | Calls |
| --- | --- |
| `projects` | open/create dialogs, create, list templates, open, save, recent, open editor window, external-change subscription, review export |
| `agent` | prompt, steer, abort, trigger sensors, model-changed notification, latest report, interview trace, canvas context, event/report/patch subscriptions |
| `mcp` | status, request subscription, response, capture-mode subscription |
| `branches` | list, create, switch, merge, remove, compare, changed subscription |
| `ingestion` | draft, compile |
| `system` | `platform` |

Channel names live in one place per domain (`evidence:project:*`,
`evidence:agent:*`, `evidence:mcp:*`), and the preload maps each method to
`ipcRenderer.invoke` or `ipcRenderer.on` and returns an unsubscribe function for
subscriptions. `contextBridge.exposeInMainWorld('evidenceAPI', api)` is the only
global the renderer gets (`repo://apps/desktop/src/preload/index.ts#L203-L205`).

The payoff is a narrow, testable contract: the renderer test support provides a
fake `window.evidenceAPI`
(`apps/desktop/src/renderer/test-support/desktopApi.ts`), so UI tests never boot
Electron, and a renderer cannot accidentally read a file.

## Project storage: no hidden model cache

`createProjectStore` is file-backed by design. The store never keeps a model in
memory: `open` parses the current source, `save` writes the document the renderer
holds. That is what lets an external agent or a script keep editing the same files
without fighting a stale cache
(`repo://apps/desktop/src/main/projectStore.ts#L173-L180`).

### Opening either source form

`open` accepts a folder containing `.evidence/fm/model.json` or a
`*.evidence.json` bundle:

- a bundle is parsed with `readModelBundle` and summarized with `kind: 'file'`,
  where `modelRoot` points at the file itself;
- a folder is required to contain `model.json`, then parsed with
  `readModelDirectory`;
- a freshly created, empty tree is accepted, because the parser's only finding is
  `model.empty`; anything else with no entities is refused.

Those decisions are in `isBlankStart` / `isReadableSource` and the two branches of
`open` (`repo://apps/desktop/src/main/projectStore.ts#L108-L135`,
`repo://apps/desktop/src/main/projectStore.ts#L271-L338`). A successful open
updates the recent list (max 20, deduplicated by `rootPath`).

### Saving without churn

`save` dispatches on the source form:

- a bundle is rewritten through `writeModelBundle`; the in-memory document already
  carries `validation` and `readme`, so the round trip is lossless;
- a tree is written through `writeModelDirectory`, which reports `written`,
  `unchanged` and `removed` file names.

The result echoes those three lists back to the renderer
(`repo://apps/desktop/src/main/projectStore.ts#L341-L372`). Writing only changed
files is what keeps a save from producing Git churn.

### Creating refuses to overwrite

`writeProject` refuses an existing bundle file and an existing
`.evidence/fm/model.json`, with a message naming the path to open instead
(`repo://apps/desktop/src/main/projectStore.ts#L205-L240`). A new project is
either a starter template or an already-compiled document handed over by the
ingestion flow.

### Fingerprinting for external edits

`fingerprint` hashes either the bundle's bytes or every model source file's path
and content with NUL separators
(`repo://apps/desktop/src/main/projectStore.ts#L375-L403`). The renderer uses it to
distinguish its own save from a write it did not make.

## Model paths are resolved once

Both source forms appear throughout the shell, so path resolution lives in one
module (`repo://apps/desktop/src/main/modelSource.ts#L15-L37`):

| Function | Tree project | Bundle project |
| --- | --- | --- |
| `isBundleProject` | false | `*.evidence.json` path |
| `projectDirectoryOf` | the project root | the bundle's parent directory |
| `modelSourceOf` | `<root>/.evidence/fm` | the bundle file |
| `tracePathOf` | `<root>/.evidence/traces/interview-trace.json` | `<parent>/.evidence/traces/interview-trace.json` |

Every sensor, MCP call, review export and agent runtime reads these functions
instead of concatenating paths. That is why a bundle project keeps its traces and
branches *beside* the file rather than inside it.

## Watching external writes

Opening or creating a project starts a watcher keyed by `WebContents` id. A newer
open stops the previous watcher; a destroyed window stops its own
(`repo://apps/desktop/src/main/projectIpc.ts#L39-L64`).

The watcher itself differs by source form:

- a tree watches `.` plus `entities/`, `relationships/`, `rules/` with
  non-recursive watchers (which keeps Windows working) and debounces 200 ms;
- a bundle watches its **directory**, not the file, because an editor that saves
  through a rename would otherwise detach the watcher after the first write.

Both debounce, then emit `evidence:project:changed` with `{rootPath, changedAt,
paths}` (`repo://apps/desktop/src/main/modelWatcher.ts#L6-L45`,
`repo://apps/desktop/src/main/modelWatcher.ts#L94-L134`). The renderer turns that
into a reload prompt rather than silently replacing the canvas.

## Review export

`exportReview` runs entirely in the main process
(`repo://apps/desktop/src/main/reviewIpc.ts#L90-L153`):

1. Resolve the project directory, model source and installed asset directory.
2. Ask for a save path; cancel returns `{status: 'cancelled'}`.
3. If `.evidence/api/api.json` exists, derive scope refs from the model's entry
   Contexts, so a joint review names the independent Contexts it delivers.
4. Call `generateWorkbench` with the chosen output and asset directory.
5. Return `{status: 'saved', path, counts}` or `{status: 'failed', error}`.

The page is generated from the sources on disk, not from the canvas: a review
someone mails to a colleague has to describe what was saved. The asset directory
comes from `installAssets.ts`, which prefers the unpacked copy beside `app.asar`
when packaged and either `resources/assets` or the workspace package in
development (`repo://apps/desktop/src/main/installAssets.ts#L22-L68`).

## Failure behaviour

| Situation | Behaviour |
| --- | --- |
| folder without `.evidence/fm/model.json` | open fails with a message naming the expected path (`repo://apps/desktop/src/main/projectStore.ts#L300-L320`) |
| source parses to no entities and is not a blank start | open fails with every parse finding |
| create target already holds a model | refusal naming the existing path |
| external write | debounced `evidence:project:changed`, renderer decides whether to reload |
| renderer window closed during an agent patch | `{success: false, error: '编辑器窗口已关闭。'}` (`apps/desktop/src/main/agentIpcHandlers.ts`) |
| MCP bridge cannot start | stderr message, app continues (`repo://apps/desktop/src/main/main.ts#L125-L131`) |
| review generation fails | `{status: 'failed', error}` instead of throwing across IPC |
| asset directory not found | `undefined` returned so the library names the paths it tried (`repo://apps/desktop/src/main/installAssets.ts#L22-L68`) |

## Tests that protect this contract

- `projectStore.spec.ts` opens tree and bundle projects, refuses a folder without
  `model.json`, writes only changed files idempotently, fingerprints both forms,
  creates starter trees and bundles, refuses overwrite, and accepts a blank start
  (`repo://apps/desktop/src/main/projectStore.spec.ts#L58-L207`,
  `repo://apps/desktop/src/main/projectStore.spec.ts#L320-L470`).
- `modelSource.spec.ts` pins the four path functions for both forms.
- `reviewIpc.spec.ts` asserts a cancelled dialog generates nothing, a successful
  export reports the page counts, scope refs are the non-child entry Contexts, and
  a generation failure returns `status: 'failed'`
  (`repo://apps/desktop/src/main/reviewIpc.spec.ts#L62-L140`).
- `installAssets.spec.ts` pins packaged, development and "nothing found"
  resolution (`repo://apps/desktop/src/main/installAssets.spec.ts#L14-L68`).
- `apps/desktop/tests/integration.spec.ts` copies the `product-procurement` fixture
  into a temporary project, opens it through the store, and lays it out through the
  canvas library — an end-to-end check of path resolution plus rendering.

## Related pages

- [Canvas layout, viewport and inspector](./canvas-and-inspector.md) — the
  renderer half of the editor window.
- [Ingestion and agent patch review](./ingestion-and-patch-review.md) — the
  assisted write paths behind these IPC groups.
- [Interview branches and lineage](./branches-and-lineage.md) — the branch store
  wired at startup.
- [External agents over MCP](../agents/mcp-integration.md) — the bridge and the
  stdio mode.
- [The offline review workbench](../contracts/offline-workbench.md) — what the
  export produces.
