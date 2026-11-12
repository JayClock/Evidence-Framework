---
type: workflow
title: Interview branches and lineage
description: How parallel interview assumptions become branch snapshots with their own transcripts, how checkout, merge and comparison work on disk, and how stored verdicts drive the canvas overlay.
tags: [branches, lineage, transcript, checkout, merge, verdict]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-12T12:33:13.984Z
sources:
  - id: openwiki-source-ae82408b35d3086879a25a18
    resource: repo://apps/desktop/src/main/branchIpcHandlers.spec.ts
  - id: openwiki-source-d7d2f5039093a9cb9ec3790a
    resource: repo://apps/desktop/src/main/branchIpcHandlers.ts
  - id: openwiki-source-892f3ee609d61c71b12abd8c
    resource: repo://apps/desktop/src/main/branchStore.spec.ts
  - id: openwiki-source-7a4aa4a949ff660cf71561d2
    resource: repo://apps/desktop/src/main/branchStore.ts
  - id: openwiki-source-5d33672c45ec58cd29dce507
    resource: repo://apps/desktop/src/main/main.ts
  - id: openwiki-source-a09211735c11dc54cc926361
    resource: repo://apps/desktop/src/renderer/screens/BranchFlow.spec.tsx
  - id: openwiki-source-16fd04de763e699d46ccb645
    resource: repo://apps/desktop/src/renderer/state/branchOverlay.ts
generated: { by: "pi", at: "2026-11-12T12:33:13.984Z" }
---

# Interview branches and lineage

An interview often reaches a decision that could have gone another way. Evidence
lets a modeler keep both: a **branch** is a full model snapshot plus its own
conversation transcript, stored beside the checkout. The aim is not version
control for its own sake — Git already versions the tree — but the ability to
compare the *cost* of an assumption without abandoning the one being explored.

`main` is reserved. `.evidence/fm` is always the **checkout** that the sensors, the
agent and Git read, and every branch, including `main`, keeps a snapshot under
`.evidence/branches/`.

## Layout on disk

```text
<project>/
  .evidence/
    fm/                                  # the checkout every reader sees
    traces/interview-trace.json          # checkout trace
    branches/
      manifest.json                      # { activeBranchId, order }
      main/
        branch.json                      # id, name, parent, status, lastVerdict
        fm/                              # snapshot of the model tree
        traces/interview-trace.json
        session.jsonl                    # this lineage's transcript
      monthly-3f9a1c/
        branch.json
        fm/
        traces/interview-trace.json
        session.jsonl
```

The names are constants: `BRANCH_DIRECTORY = .evidence/branches`,
`BRANCH_MANIFEST_FILE = manifest.json`, `BRANCH_SESSION_FILE = session.jsonl`,
`CHECKOUT_DIRECTORY = .evidence/fm`, and the checkout trace path
(`repo://apps/desktop/src/main/branchStore.ts#L35-L49`).

Because a bundle project (`*.evidence.json`) has no tree to snapshot, branches are
a tree-project feature. The IPC layer exposes a single read-only branch for a
bundle and refuses every mutation with an explanation
(`repo://apps/desktop/src/main/branchIpcHandlers.ts#L19-L26`,
`repo://apps/desktop/src/main/branchIpcHandlers.ts#L77-L95`).

## The checkout is the truth

The store deliberately does not keep a model in memory. The active branch's
snapshot is refreshed from the checkout **before any reader looks at it**:
`listWithManifest` mirrors `.evidence/fm` into
`.evidence/branches/<active>/fm` first, so create, compare and merge never act on
a stale copy of the branch the user is editing
(`repo://apps/desktop/src/main/branchStore.ts#L315-L345`).

`ensureMainBranch` seeds `main` from the current checkout and trace on first use,
then records it in the manifest order. That is why opening an existing project
immediately has a `main` snapshot even though nobody forked anything
(`repo://apps/desktop/src/main/branchStore.ts#L218-L255`).

## Fork

`create` snapshots the source branch's model, copies its trace, and forks its
transcript at the chosen checkpoint:

1. Resolve the source branch (default: the active one).
2. Write the source model into a new branch directory.
3. Copy the source trace, when one exists.
4. Fork `session.jsonl` with `forkSessionLines`, passing
   `newSessionId: branch-<id>` and the optional `sourceEntryId`.
5. Write `branch.json` with `parentBranchId`, `sourceEntryId`, timestamps and
   `status: 'open'`, then append the id to the manifest order.

The fork does **not** touch the checkout. The active branch stays active until an
explicit switch (`repo://apps/desktop/src/main/branchStore.ts#L370-L460`).

A transcript that cannot be forked (bad JSONL, missing header) is swallowed on
purpose: the model branch is still usable, it simply starts without an inherited
conversation. That trade-off is stated at the catch site.

## Switch

Switching is deliberately ordered so no edit is lost:

1. `listWithManifest` refreshes the active snapshot.
2. Refuse an unknown target.
3. If the target is already active, return the current document and
   `savedPrevious: false`.
4. Snapshot the current checkout into its own branch.
5. Read the target snapshot and write it over `.evidence/fm`; copy the target
   trace when it exists.
6. Write the manifest with the new `activeBranchId`.
7. Return the new document plus `savedPrevious: true`.

The sequence is in `switchTo` (`repo://apps/desktop/src/main/branchStore.ts#L464-L505`).
The renderer adopts the returned document and resets undo history, because the
previous branch's steps no longer apply.

Two operational caveats follow from the implementation:

- The checkout write is not transactional. The store snapshots first and writes
  through `writeModelDirectory`, but a crash mid-switch can leave a partially
  written checkout. The saved previous snapshot is what makes that recoverable.
- `checkoutBranch` copies a trace **only when the target has one**. Switching to a
  branch without a trace leaves the previous checkout trace in place, so a sensor
  run immediately afterwards can still read the old lineage's interview record.
  If that matters, delete or replace `.evidence/traces/interview-trace.json` as
  part of the workflow.

## Merge is "the source wins"

There is no three-way merge. `merge` makes the source branch's snapshot the
winning tree and writes it to **both** the checkout and `main`'s snapshot, so main
and the working tree cannot disagree afterwards
(`repo://apps/desktop/src/main/branchStore.ts#L506-L610`):

1. Refuse merging `main` into itself.
2. Read the source snapshot.
3. Write it to `.evidence/fm` and to `.evidence/branches/main/fm`.
4. Copy the source trace to both places when it exists.
5. Mark the source `status: 'merged'` with `mergedAt`, or delete it entirely when
   `keepSourceBranch === false` (default is keep).
6. Write the manifest with `activeBranchId: 'main'`.
7. Return the written/unchanged/removed file lists from the checkout write.

Anything the checkout or `main` had that the source branch lacks is therefore
removed. The comparison panel is what a modeler uses before accepting that.

## Remove

`remove` refuses the reserved cases first: `main` cannot be deleted, and the
currently checked-out branch cannot be deleted ("请先切回主干"). Otherwise it
deletes the branch directory recursively and filters the id out of the manifest
(`repo://apps/desktop/src/main/branchStore.ts#L615-L649`).

## Comparison and stored verdicts

`compare` reads both snapshots and returns a `ModelDiff` from
`diffDomainModels`, together with both documents, without switching the checkout
(`repo://apps/desktop/src/main/branchStore.ts#L666-L694`). The renderer keeps the
active branch as the base and the chosen branch as the target; comparing a branch
with itself is refused.

Each time a sensor report is published while a branch is active, the agent IPC
sink calls `recordVerdict`, which stamps that branch's `branch.json` with
`snapshotOfReport(report)` — counts, `isStageGateReady` and timestamp
(`repo://apps/desktop/src/main/branchStore.ts#L651-L664`). That snapshot is
deliberately small: a branch that has never run its sensors must report as "not
comparable" rather than borrow the current window's verdict
(`repo://apps/desktop/src/renderer/state/useBranches.ts#L345-L361`).

## The canvas overlay

A comparison is drawn without moving the active layout:

- **marks** recolour objects the checkout already draws — `removed` and
  `modified` only;
- **ghosts** are objects that exist only in the compared branch, positioned by
  that branch's own `createGraphLayout`, so a new object appears where its author
  would have drawn it.

The active layout is never recomputed, and the overlay is memoised so a keystroke
does not trigger a relayout
(`repo://apps/desktop/src/renderer/state/branchOverlay.ts#L12-L65`).

## IPC wiring and the agent runtime

Every branch handler keys on the project root, so several editor windows can
compare different branches of one repository without sharing state
(`repo://apps/desktop/src/main/branchIpcHandlers.ts#L64-L76`).

A successful switch or merge calls `onCheckout`, which the main process wires to
`agentIpc.disposeRuntime(rootPath)` — the agent session and its sensor engine
belong to the previous lineage and must not be reused
(`repo://apps/desktop/src/main/main.ts#L80-L90`). Every mutation also publishes
`evidence:branch:changed` with `{rootPath, activeBranchId, reason}`, and each
renderer refreshes its own list.

The transcript to resume is resolved per prompt: the agent IPC asks
`branchStore.activeSessionFile(rootPath)` when it creates a runtime, so a switch
changes the lineage the next conversation continues
(`repo://apps/desktop/src/main/main.ts#L65-L71`,
`repo://apps/desktop/src/main/branchStore.ts#L349-L355`).

## Failure behaviour

| Situation | Result |
| --- | --- |
| empty branch name | refusal: "请为新分支填写名称" |
| unknown source/target branch | refusal naming the id |
| switch to an already active branch | success with the current document, `savedPrevious: false` |
| merge `main` into itself | refusal |
| remove `main` | refusal: "主干不能删除" |
| remove the active branch | refusal: "当前检出的分支不能删除，请先切回主干" |
| bundle project | one read-only branch; fork/switch/merge/compare explain why they are unavailable |
| transcript cannot be forked | branch is created without an inherited transcript |
| snapshot unreadable after a write | "分支快照写入后无法读回" / "切换后无法读回分支元数据" |

## Tests that protect this contract

- `branchStore.spec.ts` starts from a single `main` mirroring the checkout, forks
  without touching the checkout, forks a transcript at a chosen checkpoint, saves
  the checkout before switching, round-trips edits on either branch, merges and
  marks the source, refuses removing `main` or the active branch, compares without
  switching, stamps the earned verdict, and reports the active transcript
  (`repo://apps/desktop/src/main/branchStore.spec.ts#L117-L470`).
- `branchIpcHandlers.spec.ts` asserts every channel is registered and disposed, a
  checkout drops the agent runtime and broadcasts, a rejected checkout stays
  silent, a merge reports back to main, and a bundle project gets one read-only
  branch plus explanations
  (`repo://apps/desktop/src/main/branchIpcHandlers.spec.ts#L94-L210`).
- `BranchFlow.spec.tsx` drives the editor header: list and check out, fork with a
  name, refuse a nameless fork, compare and clear, open the diff panel and merge,
  and explain a rejected checkout
  (`repo://apps/desktop/src/renderer/screens/BranchFlow.spec.tsx#L32-L230`).

## Related pages

- [The Pi agent harness and its tools](../agents/pi-harness.md) — transcript
  forking and the runtime that is dropped on checkout.
- [Sensors, stage gate and the dependency frontier](../agents/sensor-orchestration.md) —
  where the stored verdict snapshot comes from.
- [Canvas layout, viewport and inspector](./canvas-and-inspector.md) — how marks
  and ghosts are drawn.
- [Desktop app shell and IPC surface](./app-shell.md) — the window and preload
  wiring around these calls.
