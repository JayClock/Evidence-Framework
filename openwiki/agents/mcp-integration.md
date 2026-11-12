---
type: integration
title: External agents over MCP
description: How external IDEs and CLI agents read and mutate the live Evidence model through an MCP tool surface, a stdio process and a per-user local socket bridge.
tags: [mcp, desktop, bridge, agent, ipc, security]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-12T12:33:13.984Z
sources:
  - id: openwiki-source-5d33672c45ec58cd29dce507
    resource: repo://apps/desktop/src/main/main.ts
  - id: openwiki-source-76f615743ac07abb0f83475e
    resource: repo://apps/desktop/src/main/mcpBridgeRuntime.ts
  - id: openwiki-source-3d668aeb794fcdd75110893f
    resource: repo://apps/desktop/src/main/mcpCapture.ts
  - id: openwiki-source-a16e36dd7202e7e51c3fdc77
    resource: repo://apps/desktop/src/main/mcpRegistration.ts
  - id: openwiki-source-f278221a7db6307920fce03f
    resource: repo://apps/desktop/src/main/mcpRequestHandler.ts
  - id: openwiki-source-d7831c2339a015b10b388720
    resource: repo://apps/desktop/src/main/mcpSensorService.ts
  - id: openwiki-source-034a304691f6c1f77f682d25
    resource: repo://apps/desktop/src/renderer/state/useMcpBridge.ts
  - id: openwiki-source-81469134c3e497ba45c34184
    resource: repo://apps/desktop/src/shared/mcpIpc.ts
  - id: openwiki-source-761175c9daae6ba4b731889e
    resource: repo://libs/evidence-mcp/src/bridge/bridge.spec.ts
  - id: openwiki-source-12552feb7d841ed4485ce9a4
    resource: repo://libs/evidence-mcp/src/bridge/client.ts
  - id: openwiki-source-549dec29444534dfdadbe736
    resource: repo://libs/evidence-mcp/src/bridge/endpoint.ts
  - id: openwiki-source-84e6441315cee138958f6890
    resource: repo://libs/evidence-mcp/src/bridge/server.ts
  - id: openwiki-source-77f78c07571bd5f81a39b9b1
    resource: repo://libs/evidence-mcp/src/server/toolset.spec.ts
  - id: openwiki-source-aac6631a251b846350b2d550
    resource: repo://libs/evidence-mcp/src/server/toolset.ts
generated: { by: "pi", at: "2026-11-12T12:33:13.984Z" }
---

# External agents over MCP

The desktop app models one project at a time, and `libs/evidence-mcp` exposes that
open model to agents that live outside the app — Cursor, Claude Desktop, a terminal
Pi session. The integration is deliberately split in two: a **tool surface** that
knows what an agent may ask, and a **transport** that never touches the model
itself. Every read and write ultimately runs inside the window that already holds
the `ModelSession`, so an external edit lands in the same undo history as a
modeler's keystroke.

## Topology

```text
external agent ──stdio JSON-RPC──> evidence-mcp stdio server (same binary, --mcp-stdio)
                                          │
                                          │ newline JSON over a local socket
                                          ▼
                                  desktop main process
                                          │  Electron IPC (correlated request/response)
                                          ▼
                                  editor renderer: ModelSession
```

Two facts make the picture concrete:

- The packaged executable is both the app and the MCP server. `main.ts` checks
  `process.argv` for `--mcp-stdio` before `app.whenReady()` does anything else; in
  that mode it opens no window, reads no project store and synchronizes no client
  configuration. It only resolves an endpoint and runs the stdio server
  (`repo://apps/desktop/src/main/main.ts#L30-L55`,
  `repo://apps/desktop/src/main/main.ts#L145-L146`).
- The stdio side is intentionally thin. `runEvidenceMcpStdio` starts an
  `McpServer` over `StdioServerTransport` with a `createEvidenceMcpBridgeClient`
  as its `EvidenceMcpAppClient`, and returns when stdin ends
  (`repo://libs/evidence-mcp/src/cli.ts#L10-L28`).

## Tool surface

`createEvidenceTools` returns the whole surface as plain objects, so it can be
tested without a transport and reused in-process. `createEvidenceMcpServer`
registers each one with the MCP SDK and wraps failures into an error result
(`repo://libs/evidence-mcp/src/server/toolset.ts#L132-L134`,
`repo://libs/evidence-mcp/src/server/mcpServer.ts#L46-L78`).

| Tool | Class | Reads/writes |
| --- | --- | --- |
| `get_app_state` | read | active project, revision, selection, sensor summary, bridge counters |
| `get_domain_model` | read | full `DomainModelDocument`, optionally filtered by context and rules |
| `get_selected_entity` | read | selected object, its context, relations, derivation rules, fulfillment pair |
| `get_key_data_audit` | read | key-data ledger and its `needsDecision` list |
| `get_canvas_screenshot` | read | PNG of the canvas or one node, without editor chrome |
| `run_stage_gate` | read | gate verdict for `api` or `visualization` |
| `apply_model_patch` | write | a `ModelCommand[]` batch, one undo step |
| `introduce_fulfillment_pair` | write (operator) | request + confirmation + optional proof |
| `add_breach_compensation` | write (operator) | breach condition + compensating pair |
| `roleify_and_invert_dependency` | write (operator) | capability role + supporting contract context |

The read/write split is not descriptive prose: two annotation constants mark every
tool, and only the four write tools carry `readOnlyHint: false` and
`destructiveHint: true`
(`repo://libs/evidence-mcp/src/server/toolset.ts#L12-L24`,
`repo://libs/evidence-mcp/src/server/toolset.ts#L45-L56`). A stale doc comment
still says "the seven tools"; `TOOL_NAMES` and the returned array contain ten,
because the three fulfillment operators were added after that sentence was
written (`repo://libs/evidence-mcp/src/server/toolset.ts#L125-L134`).

The server also ships an instruction block that tells the agent the intended
order — read state, read the model, prefer operators, otherwise patch, then check
the ledger and the gate — and explicitly forbids writing `.evidence/fm` files
directly (`repo://libs/evidence-mcp/src/server/toolset.ts#L391-L392`).

## The only write path

`apply_model_patch` is the sole tool that mutates the model. The three operators
are not a second write path: each one reads the current document with
`getDomainModel({ includeRules: true })`, builds an `OperatorPatch` locally, then
submits `patch.commands` through the same `applyModelPatch` call
(`repo://libs/evidence-mcp/src/server/toolset.ts#L84-L123`). Because the builders
throw on a dangling reference, an operator refusal is returned as an error result
and no patch is sent at all — the toolset spec asserts both halves of that
behaviour (`repo://libs/evidence-mcp/src/server/toolset.spec.ts#L275-L308`,
`repo://libs/evidence-mcp/src/server/toolset.spec.ts#L310-L330`).

This is what keeps external agents inside the framework's non-negotiable rules:
they cannot bypass the command guards, because the commands are decoded and
dispatched by the same `ModelSession` the UI uses.

## Transport and local trust boundary

The endpoint is derived, not configured:

- `getEvidenceMcpBridgeEndpoint` hashes the Electron `userData` path, keeps 12
  hex characters and builds `evidence-mcp-<digest>.sock` under the OS temp
  directory, or `\\.\pipe\evidence-mcp-<digest>` on Windows. Two user profiles or
  two checkouts therefore never share a socket
  (`repo://libs/evidence-mcp/src/bridge/endpoint.ts#L13-L33`).
- On Unix the server unlinks a stale path before listening, then `chmodSync`s the
  socket to `0600` after `listen` succeeds, and removes it on close. Named pipes
  are exempt because there is no file to remove
  (`repo://libs/evidence-mcp/src/bridge/server.ts#L59-L63`,
  `repo://libs/evidence-mcp/src/bridge/server.ts#L145-L176`).
- The protocol is one newline-delimited JSON request and one response per
  connection, correlated by a caller-supplied `id`. A JSON parse failure, a missing
  id, an oversized buffer or a socket error all end the connection with a
  structured error (`repo://libs/evidence-mcp/src/bridge/server.ts#L78-L142`).

Message size and latency are bounded on both sides: `MAX_MESSAGE_BYTES` is 64 MiB
(`repo://libs/evidence-mcp/src/bridge/client.ts#L13-L14`), the stdio client times
out after 10 s, and the desktop runtime times out a renderer round trip after 15 s
(`repo://libs/evidence-mcp/src/bridge/client.ts#L158-L187`,
`repo://apps/desktop/src/main/mcpBridgeRuntime.ts#L46-L60`).

The security model is filesystem permission, not authentication: there is no
token in the protocol and no network port is opened. Any process running as the
same OS user can connect to the socket — the guarantee is isolation between local
users and profiles, not between programs of one user.

## Request routing inside the desktop

The main process answers an `EvidenceMcpAppRequest` with a deliberately small
split (`repo://apps/desktop/src/main/mcpRequestHandler.ts#L68-L104`):

| Method | Handled by | Why |
| --- | --- | --- |
| `get_app_state`, `get_domain_model`, `get_selected_entity`, `apply_model_patch` | renderer | they read or write the live `ModelSession` |
| `get_capture_rect` | renderer | only the renderer knows the current layout geometry |
| `get_key_data_audit`, `run_stage_gate` | main process | they are the same in-process sensors the app uses |
| `get_canvas_screenshot` | main process | `capturePage` belongs to `WebContents` |

The sensor service is cached per project root, and it reports honestly when the
model cannot be read: `producedBy` becomes `unavailable` instead of an empty ledger
that looks clean, and a gate that cannot run returns `passed: false` with exit code
1 (`repo://apps/desktop/src/main/mcpSensorService.ts#L13-L37`,
`repo://apps/desktop/src/main/mcpSensorService.ts#L62-L105`).

Renderer-bound calls are correlated twice. The bridge runtime creates a UUID per
call, stores `{resolve, reject, timer}` in a `pending` map and sends
`evidence:mcp:request`; the renderer answers with the same `requestId`, and a
timeout rejects the call so a closed editor window cannot hang an agent
(`repo://apps/desktop/src/main/mcpBridgeRuntime.ts#L90-L110`,
`repo://apps/desktop/src/main/mcpBridgeRuntime.ts#L136-L145`,
`repo://apps/desktop/src/shared/mcpIpc.ts#L1-L38`). The IPC registrar accepts
responses and serves the status call; status is both pushed and pullable so a
window opened later does not show "not running" until some other event fires
(`repo://apps/desktop/src/main/mcpIpcHandlers.ts#L8-L40`).

Screenshots travel through a dedicated path: the renderer computes a capture
rectangle (whole viewport or one `data-node-id` node), the main process sends
`capture-mode` to hide selection rings and zoom controls, calls
`contents.capturePage(rect)`, and encodes PNG rather than JPEG because thin diagram
lines and small text would blur (`repo://apps/desktop/src/renderer/state/useMcpBridge.ts#L157-L185`,
`repo://apps/desktop/src/main/mcpBridgeRuntime.ts#L112-L134`,
`repo://apps/desktop/src/main/mcpCapture.ts#L3-L19`).

## Patch semantics in the renderer

The renderer's answer to `apply_model_patch` is where the undo guarantee lives:

1. Decode the wire commands with `decodeModelPatch`.
2. Call `session.dispatchAll(decoded, 'mcp-patch')` once, so a multi-command patch
   is one history entry.
3. Run `session.validate()` and return the issues as `severity: 'block'`
   diagnostics, together with `revision`, `appliedCommands` and `undoable`.

If decoding or a command guard throws, the result is `success: false`, no commands
are recorded, and the error code from the guard is surfaced as the diagnostic code
(`repo://apps/desktop/src/renderer/state/useMcpBridge.ts#L296-L346`).

Two consequences deserve to be stated plainly, because the library README
overstates one of them:

- Guards run *during* dispatch. A red-line violation that a command guard enforces
  rejects the whole batch atomically — the "破坏红线即整体拒绝" behaviour in
  `libs/evidence-mcp/README.md` refers to this.
- `session.validate()` runs *after* dispatch and its findings are reported, not
  used to roll back. A patch that guards accept but strict FM validation dislikes
  stays applied and returns blocking diagnostics. The modeler, not the bridge,
  decides whether to undo it.

## Client registration and status

On startup the main process derives the endpoint, synchronizes client configs, and
then starts the bridge with `registeredClients` from the sync result
(`repo://apps/desktop/src/main/main.ts#L93-L124`). Registration is conservative:

- It targets `~/.cursor/mcp.json` always, plus Claude Desktop's
  `claude_desktop_config.json` on macOS and Windows; Linux has no known Claude path
  and is skipped (`repo://apps/desktop/src/main/mcpRegistration.ts#L14-L52`).
- A client is touched only if its config *directory* already exists, so the app
  never creates a `.cursor` folder for someone who does not use Cursor
  (`repo://apps/desktop/src/main/mcpRegistration.ts#L113-L150`).
- The written entry is the same executable with `--mcp-stdio` and
  `EVIDENCE_MCP_ENDPOINT` in the environment
  (`repo://apps/desktop/src/main/mcpRegistration.ts#L94-L105`).
- The merge spreads the existing config and existing `mcpServers`, replacing only
  the `evidence-desktop` key, so other servers and settings survive
  (`repo://apps/desktop/src/main/mcpRegistration.ts#L147-L173`).

The header's `McpStatusPill` distinguishes three states — not started, standby, and
connected with the registered client names — and shows the socket path and served
call count in its tooltip (`repo://apps/desktop/src/renderer/components/McpStatusPill.tsx#L5-L17`,
`repo://apps/desktop/src/renderer/components/McpStatusPill.tsx#L27-L68`).

## Failure behaviour

The bridge is written so that "no answer" is never mistaken for "empty model":

| Situation | Result |
| --- | --- |
| desktop app not running | `get_app_state` returns `isRunning: false` and an empty project; every other method throws `APP_NOT_RUNNING` (`repo://libs/evidence-mcp/src/bridge/client.ts#L152-L187`) |
| no editor window | renderer call rejects with `RENDERER_UNAVAILABLE`; the runtime rejects the pending call immediately (`repo://apps/desktop/src/main/mcpBridgeRuntime.ts#L76-L99`) |
| no project open | sensor calls throw `NO_ACTIVE_PROJECT` before reading anything (`repo://apps/desktop/src/main/mcpRequestHandler.ts#L53-L66`) |
| renderer stops answering | 15 s timeout in main, 10 s in the stdio client (`repo://apps/desktop/src/main/mcpBridgeRuntime.ts#L46-L60`, `repo://libs/evidence-mcp/src/bridge/client.ts#L13-L14`) |
| model unreadable | ledger reports `unavailable`, gate reports `passed: false` (`repo://apps/desktop/src/main/mcpSensorService.ts#L20-L37`, `repo://apps/desktop/src/main/mcpSensorService.ts#L74-L105`) |
| bridge cannot start | main writes the failure to stderr, returns `null`, and the app continues without MCP (`repo://apps/desktop/src/main/main.ts#L125-L134`) |

## Tests that protect this contract

- `libs/evidence-mcp/src/bridge/bridge.spec.ts` round-trips a request over a real
  Unix socket, asserts the socket mode is `0o600`, checks that an unanswered call
  times out with `RENDERER_UNAVAILABLE`, and proves the endpoint can be reused
  after `close` (`repo://libs/evidence-mcp/src/bridge/bridge.spec.ts#L78-L113`,
  `repo://libs/evidence-mcp/src/bridge/bridge.spec.ts#L220-L240`).
- `libs/evidence-mcp/src/server/toolset.spec.ts` uses a fake `EvidenceMcpAppClient`
  to assert the tool names, that only writers are marked destructive, that the
  screenshot comes back as text metadata plus a PNG attachment, and that operators
  submit their generated commands through `applyModelPatch`
  (`repo://libs/evidence-mcp/src/server/toolset.spec.ts#L159-L188`,
  `repo://libs/evidence-mcp/src/server/toolset.spec.ts#L275-L308`).
- `apps/desktop/src/main/mcpRequestHandler.spec.ts` pins the routing split: renderer
  calls are forwarded verbatim, sensors run against the active project root, and
  sensor work is refused when no project is open
  (`repo://apps/desktop/src/main/mcpRequestHandler.spec.ts#L61-L156`).
- `apps/desktop/src/main/mcpRegistration.spec.ts` asserts the per-platform client
  list, the server entry shape, and that merging preserves unrelated servers.

## Related pages

- [The Pi agent harness and its tools](./pi-harness.md) — the in-app agent that uses
  the same operators and sensors without a socket.
- [Sensors, stage gate and the dependency frontier](./sensor-orchestration.md) — what
  `get_key_data_audit` and `run_stage_gate` actually evaluate.
- [Desktop app shell and IPC surface](../desktop/app-shell.md) — window ownership,
  preload bridge and startup order.
- [Commands, guards and the model session](../model/commands-and-session.md) — the
  transition layer that `apply_model_patch` reaches.
