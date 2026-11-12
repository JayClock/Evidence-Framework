---
type: workflow
title: Ingestion and agent patch review
description: How business prose or a blueprint table becomes a reviewable draft and then a saved model, and how an agent patch that was already applied becomes a visible, optionally revertable review.
tags: [ingestion, draft, blueprint, patch-review, agent, desktop]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-12T12:33:13.984Z
sources:
  - id: openwiki-source-cd373de5b9948a0fd2b2fef0
    resource: repo://apps/desktop/src/main/ingestionIpc.spec.ts
  - id: openwiki-source-71f7c0262d5ba642c71843ea
    resource: repo://apps/desktop/src/main/ingestionIpc.ts
  - id: openwiki-source-1c1b4203dc4b1050778717b6
    resource: repo://apps/desktop/src/main/ingestionModelReader.ts
  - id: openwiki-source-5f9b8055af7dd4d3ba8292f4
    resource: repo://apps/desktop/src/renderer/components/agent/PatchReviewBar.tsx
  - id: openwiki-source-4847134dd2de8026fd1ac93f
    resource: repo://apps/desktop/src/renderer/state/useAgentPatchBridge.ts
  - id: openwiki-source-25a3bd2528146d698a0f8ff5
    resource: repo://apps/desktop/src/renderer/state/usePatchReview.spec.tsx
  - id: openwiki-source-ef46d50ae45e81fdfe3ff913
    resource: repo://apps/desktop/src/renderer/state/usePatchReview.ts
  - id: openwiki-source-9907bd51adc4e23040fa45e9
    resource: repo://apps/desktop/src/shared/ipc.ts
  - id: openwiki-source-8a414c9966b137a7aec511d5
    resource: repo://libs/evidence-agent-core/src/prompts/ingestion.ts
  - id: openwiki-source-bf13ded6fe2f54bd89054e61
    resource: repo://libs/evidence-model-core/src/ingestion/blueprintParser.spec.ts
  - id: openwiki-source-b32abf20c1d13dec210f4f30
    resource: repo://libs/evidence-model-core/src/ingestion/blueprintParser.ts
  - id: openwiki-source-8d95d250382980db9c471b3f
    resource: repo://libs/evidence-model-core/src/ingestion/compileDraft.spec.ts
  - id: openwiki-source-f02b234edea2573a78a178f1
    resource: repo://libs/evidence-model-core/src/ingestion/compileDraft.ts
  - id: openwiki-source-e3a4e522fbf80fe664a643eb
    resource: repo://libs/evidence-model-core/src/ingestion/draftAssembly.ts
  - id: openwiki-source-7662329943ea91b1ab874202
    resource: repo://libs/evidence-model-core/src/ingestion/draftSupport.ts
  - id: openwiki-source-a2231f205d52b0d6527f4ca7
    resource: repo://libs/evidence-model-core/src/ingestion/layoutDomainModel.ts
  - id: openwiki-source-4ed850c6805e6da902ae831e
    resource: repo://libs/evidence-model-core/src/ingestion/readDraftJson.ts
generated: { by: "pi", at: "2026-11-12T12:33:13.984Z" }
---

# Ingestion and agent patch review

A model reaches the desktop three ways: a person edits it, an agent patches it, or
a reader turns business text into a first draft. This page covers the two assisted
paths. Both follow the same discipline: the machine proposes, the person reviews,
and the saved result is a normal model that the normal checks judge.

## Ingestion: two input kinds, one draft shape

The main process exposes two channels, `evidence:ingestion:draft` and
`evidence:ingestion:compile`. Both run in the main process because reading uses
the project's model configuration and compiling writes a source tree; the
renderer has neither
(`repo://apps/desktop/src/shared/ipc.ts#L46-L53`,
`repo://apps/desktop/src/main/ingestionIpc.ts#L205-L227`).

`readDraft` accepts:

| `kind` | Path | Model call |
| --- | --- | --- |
| `text` | model reader, local rules as fallback | yes, when a generator is configured |
| `blueprint` | deterministic table parser | never |

The blueprint path is deliberately model-free: a workshop table already has
columns, so asking a model to re-read it would add a failure mode without adding
information. The test asserts the generator is not called for a blueprint
(`repo://apps/desktop/src/main/ingestionIpc.ts#L110-L140`,
`repo://apps/desktop/src/main/ingestionIpc.spec.ts#L31-L48`).

### The model reader is a reader, not an agent

`createModelIngestionReader` starts an `EvidenceAgentSession` in a fresh temporary
directory with `instructions: [systemPrompt]` and `noTools: 'all'`. Two reasons are
stated at the call site: a project the user has not chosen should not grow
`.evidence/` files, and the only thing this turn may produce is text — a model
that starts editing files while reading a contract clause is not reading a contract
clause (`repo://apps/desktop/src/main/ingestionModelReader.ts#L10-L45`).

The reply is assembled from text deltas, an `agent-error` is recorded and rethrown
after the turn, and the whole call is bounded by a 120-second timeout
(`repo://apps/desktop/src/main/ingestionModelReader.ts#L21-L34`,
`repo://apps/desktop/src/main/ingestionModelReader.ts#L77-L97`). The temporary
directory is removed when the reader created it.

The prompt is the method, not the schema. It states five readings in order — find
the contract, split the pre-contract context, pair every request with the
confirmation that answers it, read a breach as a new pair, separate the thing —
then hard constraints: do not invent facts, every element cites its source
sentence, a contract has exactly two roles, a moment cannot confirm a period, and
output JSON only (`repo://libs/evidence-agent-core/src/prompts/ingestion.ts#L1-L60`).

### A model failure is not a dead end

If the model returns something unreadable, or the call throws, `readDraft` falls
back to the deterministic `draftFromBusinessText` reader and says so:

- `reader: 'text-rules'`;
- an issue such as `模型返回的内容无法读成草稿（…），已改用本地读法。` or
  `模型读取失败（…），已改用本地读法。`;
- the fallback's own issues appended.

It does not return an empty draft, because an empty draft would read as "the text
said nothing", which is a different problem
(`repo://apps/desktop/src/main/ingestionIpc.ts#L53-L140`).

### Reading a model's JSON is repair, with one refusal

A model reply is a suggestion, so `readIngestionDraftJson`:

- cuts JSON out of a code fence or surrounding prose;
- treats a missing collection as empty, but reports a wrong-typed one;
- normalises short evidence kind names;
- reports every repair in `issues`.

It refuses to repair a **kind nobody recognises**, because that would silently turn
an unknown business document into `other_evidence`
(`repo://libs/evidence-model-core/src/ingestion/readDraftJson.ts#L13-L45`,
`repo://libs/evidence-model-core/src/ingestion/readDraftJson.ts#L55-L160`).

### The blueprint reader

`parseBlueprint` accepts Markdown and CSV tables with the seven workshop columns —
`stage`, `activity`, `evidence`, `kind`, `party`, `thing`, `system` — matched by
containment against Chinese and English aliases, so `阶段 (Stage)` and `Stage` both
land on `stage` (`repo://libs/evidence-model-core/src/ingestion/blueprintParser.ts#L10-L52`).

Row assembly infers the evidence kind from the document name, decides which side of
the contract a party is on, keeps duplicate document names as separate evidences,
and carries provenance. It does not invent a partner for a confirmation with no
request; it reports the unmatched row
(`repo://libs/evidence-model-core/src/ingestion/draftAssembly.ts#L60-L120`,
`repo://libs/evidence-model-core/src/ingestion/blueprintParser.spec.ts#L109-L140`).

## Compiling a draft

`compileIngestionDraft` is where a draft becomes a document the schema accepts. The
rule is stated at the function: it never repairs a gap by guessing.

- Ids are re-keyed from the draft into schema ids; a duplicate label becomes
  `confirmation.payment-2` rather than overwriting the first
  (`repo://libs/evidence-model-core/src/ingestion/draftSupport.ts#L14-L45`).
- Writability is one **monotone fixpoint** over contexts, roles, things and
  evidences. Dropping is transitive: losing a contract drops the context it rooted,
  which drops the evidences that context owned, which can drop a pair.
- Each removal is reported once in `issues` and recorded in `droppedIds`, so a
  half-kept context never validates while meaning nothing
  (`repo://libs/evidence-model-core/src/ingestion/compileDraft.ts#L103-L190`).
- A fulfilment pair only gets its completion rule when both ends landed, both are in
  the same contract context, and the confirmation references the request; otherwise
  the rule is skipped and reported
  (`repo://libs/evidence-model-core/src/ingestion/compileDraft.ts#L588-L670`).

The resulting document is ordinary FM v5; `strictValidateDomainModel` remains the
judge of whether it may be saved.

### Writing the project

`compileDraft` in the main process takes the reviewed draft, forces the name the
person typed, and refuses to write when nothing survived:

> 没有读到可以落地的业务对象：先确认文中哪一句确立了合约关系，再重新读取。

Otherwise it calls `projectStore.createFromDocument`, then returns the project, the
document, the compiler issues and a canvas layout
(`repo://apps/desktop/src/main/ingestionIpc.ts#L146-L203`). The layout comes from
`layoutDomainModel`, which derives coordinates from the model (pre-contract left,
contract middle, fulfillment right, things below) rather than from the draft, so a
model re-read from disk lays out the same way
(`repo://libs/evidence-model-core/src/ingestion/layoutDomainModel.ts#L1-L60`).

The compile handler opens the editor window on success, so the first thing the user
sees is the model they just reviewed.

## Agent patch review: the patch is already applied

The agent's `apply_model_patch` tool needs an answer inside the tool call, so the
renderer dispatches the commands immediately and records the before/after
documents. The review bar is the honest follow-up, not an approval gate
(`repo://apps/desktop/src/renderer/state/useAgentPatchBridge.ts#L20-L72`).

`usePatchReview` turns one `AppliedPatch` into:

- the rationale and command types the agent gave;
- added / removed / modified object ids, from `diffDomainModels`;
- a canvas overlay with `scope: 'patch'` and **no ghosts** — the patch is already
  in the layout, so ringing existing objects is enough;
- `revertable`, true only while the on-screen document is still the patched one.

`PatchReviewBar` renders the counts and the two actions, and changes its hint when
revert is no longer safe
(`repo://apps/desktop/src/renderer/state/usePatchReview.ts#L10-L114`,
`repo://apps/desktop/src/renderer/components/agent/PatchReviewBar.tsx#L15-L74`).

### What makes revert safe

`revert` calls `session.undo()` only when
`session.getDocument() === patched.after` — identity, not deep equality. If a human
edit or a newer patch landed on top, the bar closes without undoing, and the hint
points the modeler at the normal undo history:

> 模型之后又有改动，撤销已不可用；可在顶部按 ⌘Z 逐步回退

`accept` clears the pending review without touching the model. That asymmetry is
the whole design: the review can always be dismissed, but it can only take work
back while taking it back is still exactly one step
(`repo://apps/desktop/src/renderer/state/usePatchReview.ts#L70-L100`).

## Failure behaviour

| Situation | Result |
| --- | --- |
| no model configured, text input | local rules reader; `reader: 'text-rules'` |
| model returns nonsense | local rules reader plus an explanatory issue |
| model call throws / times out | local rules reader plus the error; 120 s cap |
| blueprint header matches no known column | failure with an issue, no draft |
| model returns an unknown evidence kind | parse failure for that element, not a silent `other_evidence` |
| compile yields zero entities | refusal with a sentence to act on; nothing written |
| project target already exists | `projectStore` refusal, propagated |
| agent patch rejected by a guard | `{success: false, error}`, no review recorded |
| later edit after a patch | review still shown, `revertable: false` |

## Tests that protect this contract

- `ingestionIpc.spec.ts` reads a blueprint without a model, prefers a configured
  model, falls back on nonsense and on a thrown call, fails loudly on an unusable
  table, compiles to a document plus canvas slots, keeps the typed name, refuses an
  empty model, and reports a refused write
  (`repo://apps/desktop/src/main/ingestionIpc.spec.ts#L30-L215`).
- `ingestionModelReader.spec.ts` asserts one assembled reply, `noTools: 'all'` in
  the caller's scratch directory, surfaced model errors and a timeout
  (`repo://apps/desktop/src/main/ingestionModelReader.spec.ts#L50-L130`).
- `blueprintParser.spec.ts` covers contract splitting, request/confirmation pairing,
  proof attachment, exactly two contract roles, row provenance, no invented
  partner, unconfirmed requests, breach compensation, CSV, duplicate names and an
  unusable header (`repo://libs/evidence-model-core/src/ingestion/blueprintParser.spec.ts#L12-L205`).
- `compileDraft.spec.ts` asserts schema acceptance, transitive drops, completion
  rules per pair, kept source sentences, written-id mapping, and the four layout
  rules including "never two entities share a coordinate"
  (`repo://libs/evidence-model-core/src/ingestion/compileDraft.spec.ts#L33-L240`).
- `usePatchReview.spec.tsx` pins the added/modified/removed counts, revert while
  newest, accept without touching the model, and refusal to revert after a later
  edit (`repo://apps/desktop/src/renderer/state/usePatchReview.spec.tsx#L117-L185`).
- `IngestDraftModal.spec.tsx` drives the review panel: who read the text, the source
  sentence per evidence, visible gaps, empty-input refusal, kind correction, rename
  and dropping a wrong element (`apps/desktop/src/renderer/components/ingestion/IngestDraftModal.spec.tsx`).

## Related pages

- [The Pi agent harness and its tools](../agents/pi-harness.md) — the agent whose
  patch is reviewed here.
- [Desktop app shell and IPC surface](./app-shell.md) — the channels and the project
  store this flow writes through.
- [Key data, business time and provenance](../language/key-data-and-provenance.md) —
  the rules a draft is trying to satisfy.
- [The native check and simulation pipeline](../model/checks-and-simulation.md) —
  what judges the compiled model.
