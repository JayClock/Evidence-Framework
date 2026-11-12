---
type: architecture
title: Commands, guards and the model session
description: The only sanctioned way to change an Evidence model — immutable commands with inverses, guards that encode the modeling red lines, patch decoding, and a session that gives every edit one undo step and one change event.
tags: [commands, session, undo, guards, patches, graph]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-12T12:33:13.984Z
sources:
  - id: openwiki-source-51ceb05965b9f42728eb67dd
    resource: repo://libs/evidence-model-core/src/commands/attributeCommands.ts
  - id: openwiki-source-96063c540ff955ae8e6eb63e
    resource: repo://libs/evidence-model-core/src/commands/derivationCommands.ts
  - id: openwiki-source-6f638a5f846a7bbb6a890078
    resource: repo://libs/evidence-model-core/src/commands/entityCommands.ts
  - id: openwiki-source-7743390443853a59fc7774ca
    resource: repo://libs/evidence-model-core/src/commands/fulfillmentCommands.ts
  - id: openwiki-source-4360979a90a43313d34973ff
    resource: repo://libs/evidence-model-core/src/commands/guards.ts
  - id: openwiki-source-c33089e8e3f13ba0b4e2ed14
    resource: repo://libs/evidence-model-core/src/commands/patches.ts
  - id: openwiki-source-329f90409a9e1ccad94f784a
    resource: repo://libs/evidence-model-core/src/commands/ruleCommands.ts
  - id: openwiki-source-8feac790da38ea9e4dacb9f3
    resource: repo://libs/evidence-model-core/src/commands/sequence.ts
  - id: openwiki-source-7d4ec46874d9a501a50da9ee
    resource: repo://libs/evidence-model-core/src/commands/types.ts
  - id: openwiki-source-c6f998270d30fac839dc0715
    resource: repo://libs/evidence-model-core/src/model/graph.ts
  - id: openwiki-source-b4abb2821db0f045818014a1
    resource: repo://libs/evidence-model-core/src/session/createModelSession.ts
generated: { by: "pi", at: "2026-11-12T12:33:13.984Z" }
---

# Commands, guards and the model session

Every change to a model — a keystroke in the inspector, a drag that creates a
relationship, an agent's patch, a compiled draft — goes through one layer:
`libs/evidence-model-core/src/commands/`. There is no second write path. That is
what lets the app promise three things at once:

- every edit is a deterministic transition with a recorded inverse;
- every edit passes the same guards and the same optional static gate;
- every edit is one undo step, whether a human or an agent made it.

## The command contract

A command is an object with a `type` and an `apply(document)` method. It never
mutates its input; it returns the next document, the inverse command, the affected
ids and a result
(`repo://libs/evidence-model-core/src/commands/types.ts#L48-L67`).

Rejections are typed. `ModelCommandError` carries a stable `code` from a closed
set — `id.invalid`, `id.duplicate`, `entity.notFound`, `entity.immutableField`,
`entity.referenced`, `attribute.duplicate`, `attribute.time.missing`,
`context.notContract`, `context.rootMissing`, `role.notBound`,
`relationship.endpoint`, `rule.context`, `derivation.alreadyBound`, and others
(`repo://libs/evidence-model-core/src/commands/types.ts#L3-L30`).

The code matters beyond the message: the renderer and MCP bridge surface it as a
diagnostic code, so a UI can react to `derivation.alreadyBound` without parsing
prose.

## Guards that encode the red lines

`guards.ts` is the first line of defense, before any document change:

| Guard | Rule |
| --- | --- |
| `assertId` / `assertUniqueId` | the id grammar holds, and the id is unused by entities, relationships and rules |
| `requireEntity` / `requireContext` / `requireContractContext` | the reference resolves and has the right category/kind |
| `requireRootContract` | a Contract Context has exactly one root Contract |
| `requirePartyRole` | the target is a Party Role |
| `requireRoleBoundByContract` | a responsible role belongs to the Context and is bound by its root Contract |
| `requireAttribute` | the attribute exists on the entity |
| `assertEntityInsertable` | category-specific context rules |

The category rules mirror the language: a `participant.party` must have no
`contextRef`, a Thing must be in a domain Context, an evidence kind must sit in the
Context kind its phase implies, a Contract needs exactly two distinct Party Roles,
and a non-contract evidence moment needs a `responsibleRoleRef` that is a Party
Role
(`repo://libs/evidence-model-core/src/commands/guards.ts#L1-L260`).

`assertMandatoryTime` additionally refuses a moment that does not already model its
business time, because a pair created without `started_at`/`expired_at`/
`confirmed_at` would fail the static check later and look like a mysterious
save-time error.

## What cannot be changed after saving

Several commands enforce immutability rather than allowing a rename-and-repair:

- `UpdateEntityCommand` refuses changes to `id`, `type` or `category` —
  `entity.immutableField`
  (`repo://libs/evidence-model-core/src/commands/entityCommands.ts#L120-L160`);
- `UpdateRuleCommand` keeps `id`, `type`, `kind`, `contextRef` and `target`
  immutable, because changing them would silently repoint the attribute that reads
  the rule (`repo://libs/evidence-model-core/src/commands/ruleCommands.ts#L132-L200`);
- `UpdateAttributeCommand` refuses a rename while a derivation still writes the
  attribute, because other rules read attribute names inside expression text that
  cannot be rewritten reliably
  (`repo://libs/evidence-model-core/src/commands/attributeCommands.ts#L167-L230`).

The trade-off is deliberate: the model keeps stable identity even if a modeler must
delete and recreate an object.

## Composition: one business edit, several primitives

A single command often needs several writes that must not be half-applied. The
codebase composes them rather than asking callers to sequence them:

| Command | Writes |
| --- | --- |
| `CreateContractCommand` | the Contract entity **and** its Context `rootRefs` |
| `BindDerivedRuleCommand` | the derivation rule **and** the attribute's `derivedByRuleRef` |
| `CreateFulfillmentPairCommand` | request, confirmation, confirmation→request reference, optional request→contract reference, completion rule |
| `PairFulfillmentCommand` | confirmation→request reference and completion rule (or reuses the reference) |

Examples:
`repo://libs/evidence-model-core/src/commands/entityCommands.ts#L82-L118`,
`repo://libs/evidence-model-core/src/commands/derivationCommands.ts#L20-L80`,
`repo://libs/evidence-model-core/src/commands/fulfillmentCommands.ts#L65-L178`,
`repo://libs/evidence-model-core/src/commands/fulfillmentPairCommands.ts#L105-L200`.

`CommandSequence` applies them in order and builds its inverse by reversing the
individual inverses, so undo restores the exact previous document in one step
(`repo://libs/evidence-model-core/src/commands/sequence.ts#L10-L55`).

### Deletion is reference-aware

`DeleteEntityCommand` walks every place an id can be cited — `contextRef`,
`parentContextRef`, `responsibleRoleRef`, `roleRefs`, `rootRefs`, rule context,
rule target, rule bindings and relationship endpoints — and marks each reference
`removable` or not
(`repo://libs/evidence-model-core/src/commands/entityCommands.ts#L186-L283`).

- Without `cascade`, any reference blocks with `entity.referenced` and the list of
  descriptions.
- With `cascade: true`, removable references are deleted; a still-non-removable
  responsibility reference keeps the delete refused.
- A cascading delete replaces the whole document and records a
  `ReplaceDocumentCommand` as the inverse
  (`repo://libs/evidence-model-core/src/commands/entityCommands.ts#L285-L350`).

Removing a derived attribute either cascades into its rule or is refused with
`rule.referenced`; the cascade deletes the rule first, so the attribute never
outlives the rule that points at it
(`repo://libs/evidence-model-core/src/commands/attributeCommands.ts#L104-L160`).

## Patches are the wire form

Agents cannot send class instances, so every edit also has a plain-JSON
description. `ModelPatchCommand` declares seventeen command types, and
`decodeModelPatchCommand` maps each to a real command
(`repo://libs/evidence-model-core/src/commands/patches.ts#L55-L155`).

Decoding checks **shape only**: it validates that the payload is an array of
objects, that `type` is present and known, and that required fields exist. It
deliberately does not check identity, references or red lines — those stay with the
command guards and `strictValidateDomainModel`, so a decoded patch is treated
exactly like a direct edit
(`repo://libs/evidence-model-core/src/commands/patches.ts#L160-L300`).

Decode failures are `ModelPatchError` with `patch.notArray`, `patch.notObject`,
`patch.missingField` or `patch.unknownType`, plus the failing path
(`commands[3].entity`), and the batch reports the index of the first bad command.

## The session

`createModelSession` wraps a document with selection, history and subscribers
(`repo://libs/evidence-model-core/src/session/createModelSession.ts#L28-L95`).

### Dispatch

`dispatch` applies one command, optionally gates it on static validation, swaps the
document, records the history entry, and emits two events:
`document-changed` (command types + affected ids) and `history-changed`
(`repo://libs/evidence-model-core/src/session/createModelSession.ts#L159-L176`).

`validateOnDispatch` is **off by default**. Progressive modeling saves one object
at a time, and an intermediate document is often structurally incomplete (a
Contract before its roles, a request before its confirmation). Agent commits and
imports turn the gate on; when it is on, an invalid next document throws
`ModelSessionValidationError` and nothing is committed
(`repo://libs/evidence-model-core/src/session/createModelSession.ts#L28-L60`,
`repo://libs/evidence-model-core/src/session/createModelSession.ts#L133-L141`).

### Transactions

`dispatchAll` wraps commands in one `CommandSequence` and records **one** history
entry, with the caller's label (`agent:<rationale>`, `mcp-patch`, …). If a command
fails midway, the sequence throws before anything is recorded, so the document is
unchanged (`repo://libs/evidence-model-core/src/session/createModelSession.ts#L177-L201`).

### History

- History is capped at 100 entries by default; older entries drop off.
- A new dispatch clears the redo stack.
- `undo` applies the recorded inverse and pushes the entry onto redo; `redo`
  re-applies the original.
- An empty stack makes `undo`/`redo` return `false`, not throw.
- `replaceDocument` either records an undoable replacement or resets history when
  `{resetHistory: true}` is passed — which is what a branch checkout or disk reload
  needs (`repo://libs/evidence-model-core/src/session/createModelSession.ts#L202-L280`).

### Selection

Selection is part of the session, not the renderer: `select` and
`selectAttribute` emit `selection-changed`. When a change removes the selected
object, selection clears itself and emits, so the inspector cannot keep editing a
deleted node (`repo://libs/evidence-model-core/src/session/createModelSession.ts#L120-L132`).

## The graph is a derived read model

`createDomainGraph(document)` builds `Map` indexes once per document and is
memoised by the session until the document changes
(`repo://libs/evidence-model-core/src/model/graph.ts#L95-L130`).

It offers O(1) lookups and the walks the UI needs: `outgoing`, `incoming`,
`relatedIds`, `entitiesInContext`, `childContexts`, `contextPath` (cycle-safe),
`rootContractOf`, rules by context/reference, and `derivationRule(entity,
attribute)`.

`fulfillmentPairs()` is derived lazily and cached: for each request it collects
confirmations that reference it, proofs (`other_evidence`) that reference the
request or its confirmations, the root Contract, and the completion/breach rules
bound to the request
(`repo://libs/evidence-model-core/src/model/graph.ts#L145-L195`).

That pair is the single definition the canvas group, the inspector section and the
simulation all read, so "what completes this request" cannot mean three different
things.

## The three operators are just named batches

`introduceFulfillmentPair`, `addBreachCompensation` and
`roleifyAndInvertDependency` return `OperatorPatch` objects — a command array plus
the ids they create. They are not a privileged path: the tools submit the returned
commands through the same `apply_model_patch` pipeline, so they hit the same guards
and one undo step
(`repo://libs/evidence-model-core/src/commands/operators.ts#L9-L30`,
`repo://libs/evidence-model-core/src/commands/operators.ts#L170-L360`).

Their value is assembly discipline: business time, the root-contract reference, the
pairing reference and the completion rule are filled in rather than left for the
caller to forget.

## Failure behaviour

| Situation | Result |
| --- | --- |
| id taken by another collection | `id.duplicate` |
| Contract without exactly two Party Roles | `role.notParty` at insert, static error if constructed otherwise |
| responsible role not bound by the root Contract | `role.notBound` |
| evidence placed in the wrong Context kind | `context.responsibility` |
| moment missing required business time | `attribute.time.missing` |
| entity still referenced, no cascade | `entity.referenced` with the reference list |
| derived attribute removed without cascade | `rule.referenced` naming the rule |
| rename of a derived attribute | refusal; identity stays stable |
| patch object missing `type` | `patch.missingField` at `commands[n]` |
| patch with unknown type | `patch.unknownType` |
| command fails inside `dispatchAll` | nothing committed, no history entry |
| `validateOnDispatch` rejects | `ModelSessionValidationError`, document unchanged |

## Tests that protect this contract

- `createModelSession.spec.ts` pins dispatch, graph reuse, events, unsubscribe,
  command results, undo/redo, redo clearing, the history cap, empty stacks, one-step
  `dispatchAll`, no commit on midway failure, the validation gate off/on, selection
  clearing, `replaceDocument`, and the fulfillment pair as one undo step
  (`repo://libs/evidence-model-core/src/session/createModelSession.spec.ts#L18-L430`).
- `patches.spec.ts` asserts every declared command type decodes, a decoded patch is
  undoable, malformed payloads report a path and an index, and guards still reject
  illegal edits after decoding
  (`repo://libs/evidence-model-core/src/commands/patches.spec.ts#L21-L157`).
- `operators.spec.ts` pins the pair writing the contract reference and business
  time, the breach as a new pair rather than an undo, the capability inversion, and
  refusals for a missing request or a non-confirmation target
  (`repo://libs/evidence-model-core/src/commands/operators.spec.ts#L60-L365`).
- `graph.spec.ts` pins lookups, attribute access, relationship indexes and the
  fulfillment pair derivation.

## Related pages

- [The Fulfillment Modeling DSL (FM v5)](../language/fm-dsl.md) — the rules these
  guards enforce.
- [The native check and simulation pipeline](./checks-and-simulation.md) — the
  static gate and what happens after a save.
- [Canvas layout, viewport and inspector](../desktop/canvas-and-inspector.md) — the
  UI that dispatches these commands.
- [The Pi agent harness and its tools](../agents/pi-harness.md) — how agent patches
  reach `dispatchAll`.
