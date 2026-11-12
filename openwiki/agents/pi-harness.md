---
type: architecture
title: The Pi agent harness and its tools
description: How an in-process Pi session is narrowed behind an injectable port, given modeling instructions and a fixed tool set, and how its patches and sensor runs travel back through the desktop renderer.
tags: [agent, pi-sdk, session, tools, prompts, desktop]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-12T12:33:13.984Z
sources:
  - id: openwiki-source-f85ce0e3a462797434d822a8
    resource: repo://apps/desktop/src/main/agentIpcHandlers.ts
  - id: openwiki-source-fe198b09c0b1eeb6a6ebe4d9
    resource: repo://apps/desktop/src/main/agentRuntime.spec.ts
  - id: openwiki-source-55138c775f581f8c989ca7dc
    resource: repo://apps/desktop/src/main/agentRuntime.ts
  - id: openwiki-source-5d33672c45ec58cd29dce507
    resource: repo://apps/desktop/src/main/main.ts
  - id: openwiki-source-4847134dd2de8026fd1ac93f
    resource: repo://apps/desktop/src/renderer/state/useAgentPatchBridge.ts
  - id: openwiki-source-7c028cbe724a140944eca5d1
    resource: repo://apps/desktop/src/renderer/state/useAgentSession.ts
  - id: openwiki-source-6264d9d857dd5b81ecc09730
    resource: repo://libs/evidence-agent-core/src/prompts/index.ts
  - id: openwiki-source-9b05dd90feae264982e450c2
    resource: repo://libs/evidence-agent-core/src/prompts/prompts.spec.ts
  - id: openwiki-source-4d749ca8bbcb522529093406
    resource: repo://libs/evidence-agent-core/src/session/evidenceAgentSession.spec.ts
  - id: openwiki-source-2aee63787f350178c887a6cd
    resource: repo://libs/evidence-agent-core/src/session/evidenceAgentSession.ts
  - id: openwiki-source-6ab1b0549e1f33772362c9f0
    resource: repo://libs/evidence-agent-core/src/session/sessionFork.ts
  - id: openwiki-source-18763460579eb3ee606385df
    resource: repo://libs/evidence-agent-core/src/session/streamEvents.ts
  - id: openwiki-source-9470f7966290755854473c0d
    resource: repo://libs/evidence-modeling-orchestrator/src/tools/evidenceTools.spec.ts
  - id: openwiki-source-e847b47acdb65a2045539462
    resource: repo://libs/evidence-modeling-orchestrator/src/tools/evidenceTools.ts
generated: { by: "pi", at: "2026-11-12T12:33:13.984Z" }
---

# The Pi agent harness and its tools

Evidence has no separate agent service. A conversation runs inside the desktop's
main process, on top of `@earendil-works/pi-coding-agent`, and the agent's only
means of touching the model are the six tools the desktop registers. Three
packages divide the work:

| Layer | Package | Owns |
| --- | --- | --- |
| session harness | `libs/evidence-agent-core` | SDK adaptation, instruction text, stream projection, transcript fork |
| tool + sensor wiring | `libs/evidence-modeling-orchestrator` | tool registration, patch routing contract, sensor engine |
| runtime ownership | `apps/desktop/src/main` | one runtime per project root, IPC, patch round trip, debounce |

## The SDK is narrowed, not wrapped

`PiSdkPort` declares only the entry points the desktop needs: resolve the agent
directory, build a resource loader, create or open a session manager, create a
session (`repo://libs/evidence-agent-core/src/session/evidenceAgentSession.ts#L12-L33`).
`loadPiSdkPort` imports the real SDK dynamically and implements the port
(`repo://libs/evidence-agent-core/src/session/evidenceAgentSession.ts#L82-L116`).
Because the dependency is a port, tests inject a fake and never need credentials,
a model or a terminal; `createEvidenceAgentSession` accepts it as `options.sdk`
and falls back to the dynamic loader only when none is given
(`repo://libs/evidence-agent-core/src/session/evidenceAgentSession.ts#L153-L184`).

`createEvidenceAgentSession` is lazy and single-flight:

- Nothing starts until the first `prompt`, `steer` or `start`.
- A module-scoped `starting` promise means two concurrent callers share one
  initialization, and a failed start resets it so a retry is possible.
- `dispose` unsubscribes from Pi, disposes the session and clears listeners
  (`repo://libs/evidence-agent-core/src/session/evidenceAgentSession.ts#L138-L190`,
  `repo://libs/evidence-agent-core/src/session/evidenceAgentSession.ts#L233-L240`).

## Instructions are code, not a skill tree

The session appends `EVIDENCE_INSTRUCTIONS` to Pi's own system prompt. That array
is four authored sections — role and authority, modeling red lines, operator
selection, and the turn workflow — joined by newlines
(`repo://libs/evidence-agent-core/src/prompts/index.ts#L6-L28`). They are ordinary
TypeScript strings, so a packaged app ships them inside the bundle.

The resource loader is constructed with `noSkills: true` and an
`appendSystemPromptOverride` that concatenates the base prompt with those sections
(`repo://libs/evidence-agent-core/src/session/evidenceAgentSession.ts#L99-L108`).
The reason is stated at the construction site: Pi would otherwise scan the project
and the user's agent directory for `SKILL.md`, widening the prompt with files the
install never reviewed and directing the model to look for a skill the product does
not ship.

Two invariants follow, and both are asserted:

- The prompt names only tools the desktop registers — `apply_model_patch`,
  `run_sensors`, `get_canvas_selection`, `introduce_fulfillment_pair`,
  `add_breach_compensation`, `roleify_and_invert_dependency` — and contains no
  `SKILL.md`, `.agents`, `references/`, `npx ` or shell sigil
  (`repo://libs/evidence-agent-core/src/prompts/prompts.spec.ts#L12-L36`).
- The runtime hands the session extension factories but no `skillDirectories` or
  `instructions` override, and sets no `EVIDENCE_SKILLS_ROOT`/`FM_SKILL_DIR`
  environment variable (`repo://apps/desktop/src/main/agentRuntime.spec.ts#L181-L198`).

The workflow prompt also states the intended loop explicitly: read the current
selection, ask in groups, write one minimal complete batch through
`apply_model_patch`, run `run_sensors`, then stop at the stage boundary
(`repo://libs/evidence-agent-core/src/prompts/workflow.ts#L8-L56`).

## What the renderer is allowed to see

Pi's event vocabulary does not cross the IPC boundary. `projectSessionEvent` maps
exactly five shapes — assistant text deltas, tool start, tool end, agent settled,
assistant error — and drops thinking deltas, retries and compaction updates
(`repo://libs/evidence-agent-core/src/session/streamEvents.ts#L9-L80`). The
projected values are plain data, so they can be sent over Electron IPC unchanged
and asserted in tests without a model.

The renderer reduces that stream into one conversation state: transcript text is
capped at 8,000 characters, tool calls become an activity list with
`running`/`completed`/`failed`, and the active tool name drives the dock's status
line (`repo://apps/desktop/src/renderer/state/useAgentSession.ts#L32-L80`).
`PromptDock` keeps one composer for both directions — Enter sends while idle and
queues a steer while the agent streams — and `useAgentSession.submit` decides which
IPC call to make from its own `running` flag
(`repo://apps/desktop/src/renderer/components/agent/PromptDock.tsx#L27-L31`,
`repo://apps/desktop/src/renderer/state/useAgentSession.ts#L117-L150`).

## Transcript lineage

A Pi transcript is a tree written as JSONL: a `session` header plus entries
carrying `id`/`parentId`. `forkSessionLines` reads that file, keeps only the
ancestor chain of a chosen entry, and rewrites the header with a new `id` and a
`parentSession` pointer
(`repo://libs/evidence-agent-core/src/session/sessionFork.ts#L72-L165`). The
function never mutates the source lines and reports how many sibling entries were
dropped.

Refusals are typed rather than silently empty: `MISSING_HEADER`, `INVALID_LINE`
and `ENTRY_NOT_FOUND` are raised as `SessionForkError`, and the ancestor walk
guards against a cyclic parent chain
(`repo://libs/evidence-agent-core/src/session/sessionFork.ts#L27-L36`,
`repo://libs/evidence-agent-core/src/session/sessionFork.ts#L120-L151`). The fork
is used by the branch store, which gives each interview lineage its own
transcript; see [Interview branches and lineage](../desktop/branches-and-lineage.md).

## The six tools

`createEvidenceToolsExtension` is a Pi extension factory. It registers six tools
against `EvidenceToolsHandlers`, an interface that keeps the extension free of
Electron and of the filesystem:

| Tool | Kind | Handler it calls |
| --- | --- | --- |
| `run_sensors` | read | `runSensors({modelRoot, scope?})` |
| `apply_model_patch` | write | `applyModelPatch({rationale, commands})` |
| `get_canvas_selection` | read | `getCanvasContext()` |
| `introduce_fulfillment_pair` | write (operator) | `loadDocument()` then `applyModelPatch` |
| `add_breach_compensation` | write (operator) | `loadDocument()` then `applyModelPatch` |
| `roleify_and_invert_dependency` | write (operator) | `loadDocument()` then `applyModelPatch` |

The handler contract and the name table are declared together
(`repo://libs/evidence-modeling-orchestrator/src/tools/evidenceTools.ts#L16-L70`).
`run_sensors` returns a compact projection of the full report — `passed`,
`isStageGateReady`, counts, `decisionOwed` and the issue list — because that is what
a model needs to act on (`repo://libs/evidence-modeling-orchestrator/src/tools/evidenceTools.ts#L100-L131`).
`apply_model_patch` first checks that every command carries a string `type`, then
returns either a success that names the applied command types or an `isError`
result carrying the rejection (`repo://libs/evidence-modeling-orchestrator/src/tools/evidenceTools.ts#L77-L88`,
`repo://libs/evidence-modeling-orchestrator/src/tools/evidenceTools.ts#L133-L175`).

The three operators share one `runOperator` helper. It calls
`handlers.loadDocument()` so that ids written by the operator are resolved against
the current tree, builds an `OperatorPatch`, and submits `patch.commands` through
`applyModelPatch`. A builder refusal becomes a readable tool error and no patch is
sent (`repo://libs/evidence-modeling-orchestrator/src/tools/evidenceTools.ts#L211-L243`).
The tool set is therefore not a second command language: it is a thin,
schema-described front end over the same command layer described in
[Commands, guards and the model session](../model/commands-and-session.md).

## Runtime ownership and the patch round trip

`createAgentRuntime` resolves three paths from the project's source form — model
root, project directory and trace path — and builds one sensor engine and one
debounced background checker
(`repo://apps/desktop/src/main/agentRuntime.ts#L79-L127`). It also reads the model
for operators: the main process owns no live document, so `loadDocument` reads
either the tree or the bundle from disk
(`repo://apps/desktop/src/main/agentRuntime.ts#L129-L138`).

The session is created on the first prompt with `customTools: []` and exactly one
extension factory, wired to the engine, the patch transport, the canvas context and
`loadDocument` (`repo://apps/desktop/src/main/agentRuntime.ts#L140-L188`). That
one-factory shape is deliberate: the agent's capabilities are auditable in a single
place rather than assembled from ambient SDK defaults.

Patches cannot be applied in the main process, because only the renderer holds the
live `ModelSession`. The path is a correlated round trip:

1. The tool calls `applyModelPatch`, which reaches `transport.requestPatch`.
2. `registerAgentIpc` allocates a UUID, sends `evidence:agent:apply-patch` to the
   window that owns the conversation, and starts a 15 s timeout
   (`repo://apps/desktop/src/main/agentIpcHandlers.ts#L105-L135`,
   `repo://apps/desktop/src/main/agentIpcHandlers.ts#L24-L26`).
3. The renderer decodes the commands and calls
   `session.dispatchAll(commands, 'agent:<rationale>')` exactly once, replies with
   the result, and hands both the before and after document to the review bar
   (`repo://apps/desktop/src/renderer/state/useAgentPatchBridge.ts#L20-L72`).
4. A guard failure becomes `success: false` with the guard's message; a destroyed
   window or elapsed timeout also resolves a failure instead of hanging the turn
   (`repo://apps/desktop/src/main/agentIpcHandlers.ts#L114-L135`).

Three consequences are worth stating, because they define the agent's authority:

- Agent edits are one undo step each, indistinguishable in history from a human
  multi-command edit.
- The agent cannot write `.evidence/fm`; it can only propose commands that the
  renderer dispatches.
- A patch that succeeds is *not* necessarily a valid model. Validation is a
  separate sensor run, which is why the instructions require `run_sensors` after a
  write.

The runtime also owns ambient checks: `notifyModelChanged` re-arms a debounced run
(default 800 ms) so a burst of edits produces one verdict, and explicit
`runSensors` publishes its report to every window
(`repo://apps/desktop/src/main/agentRuntime.ts#L105-L127`). The runtime spec pins
both the debounce and the "one verdict for five edits" behaviour
(`repo://apps/desktop/src/main/agentRuntime.spec.ts#L253-L277`).

Runtimes are keyed by project root, started through a single-flight map, and
disposed when the owning `WebContents` is destroyed
(`repo://apps/desktop/src/main/agentIpcHandlers.ts#L74-L103`,
`repo://apps/desktop/src/main/agentIpcHandlers.ts#L156-L169`). The startup wiring
connects two branch concerns to the agent: the transcript to resume comes from
`branchStore.activeSessionFile(rootPath)`, and every published report is recorded
as that branch's verdict (`repo://apps/desktop/src/main/main.ts#L65-L71`).

## Failure surfaces

| Failure | Behaviour |
| --- | --- |
| no session yet, `steer` called | throws "还没有正在进行的访谈，无法插话" instead of starting one (`repo://apps/desktop/src/main/agentRuntime.ts#L198-L203`) |
| session initialization throws | `starting` is reset so the next prompt retries (`repo://libs/evidence-agent-core/src/session/evidenceAgentSession.spec.ts#L349-L365`) |
| assistant message ends with `stopReason: 'error'` | projected as `agent-error`, which the renderer shows without killing the session (`repo://libs/evidence-agent-core/src/session/streamEvents.ts#L69-L80`) |
| patch rejected by a guard | tool result `isError: true`, message includes the rejection (`repo://libs/evidence-modeling-orchestrator/src/tools/evidenceTools.spec.ts#L276-L296`) |
| patch never reaches the renderer | 15 s timeout resolves `success: false` with a retry hint (`repo://apps/desktop/src/main/agentIpcHandlers.ts#L121-L128`) |
| operator names a missing reference | builder throws before any patch is sent (`repo://libs/evidence-modeling-orchestrator/src/tools/evidenceTools.spec.ts#L387-L412`) |

## Tests that protect this contract

- `evidenceAgentSession.spec.ts` drives a fake SDK: it asserts one loader
  configuration with the built-in instructions, one start for repeated calls,
  pass-through of custom tools and session directory, transcript resumption, event
  projection to subscribers, dispose behaviour and retry after a failed start
  (`repo://libs/evidence-agent-core/src/session/evidenceAgentSession.spec.ts#L176-L205`).
- `sessionFork.spec.ts` covers ancestry selection, lineage in the new header,
  full-copy forks, missing fork points, missing headers, invalid lines, cycles and
  source immutability (`repo://libs/evidence-agent-core/src/session/sessionFork.spec.ts#L24-L120`).
- `evidenceTools.spec.ts` asserts the six registered names, sensor wiring, patch
  feedback, command-shape rejection, selection reads, and that operators both
  commit through the patch channel and refuse cleanly
  (`repo://libs/evidence-modeling-orchestrator/src/tools/evidenceTools.spec.ts#L210-L227`).
- `agentRuntime.spec.ts` asserts lazy start, one start for many prompts, streaming,
  steer/abort, sensor publication, debounce, canvas context, dispose, and the patch
  verdict returning to the tool (`repo://apps/desktop/src/main/agentRuntime.spec.ts#L164-L198`,
  `repo://apps/desktop/src/main/agentRuntime.spec.ts#L311-L365`).

## Related pages

- [External agents over MCP](./mcp-integration.md) — the same operators and sensors
  exposed to out-of-process clients.
- [Sensors, stage gate and the dependency frontier](./sensor-orchestration.md) — what
  `run_sensors` returns.
- [Interview branches and lineage](../desktop/branches-and-lineage.md) — per-branch
  transcripts and stored verdicts.
- [Commands, guards and the model session](../model/commands-and-session.md) — the
  dispatch path every patch enters.
