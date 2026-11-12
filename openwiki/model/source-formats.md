---
type: storage
title: Source tree and bundle adapters
description: How one DomainModelDocument is read from and written to either a .evidence/fm tree or a single *.evidence.json bundle, and the round-trip, no-churn and digest rules that make the two forms interchangeable.
tags: [adapters, files, bundle, serialization, digest, churn]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-12T12:33:13.984Z
sources:
  - id: openwiki-source-852b747ca0a21fd5f6e30960
    resource: repo://libs/evidence-model-core/README.md
  - id: openwiki-source-6fc815968ee4c3d2d282a092
    resource: repo://libs/evidence-model-core/src/adapters/diskAdapter.ts
  - id: openwiki-source-83f9ee9177192af59a8fc434
    resource: repo://libs/evidence-model-core/src/adapters/modelBundle.ts
  - id: openwiki-source-0c64dc07d9b0704fe44ee9f4
    resource: repo://libs/evidence-model-core/src/adapters/modelFileAdapter.ts
  - id: openwiki-source-93450ac6989bff571fd54f52
    resource: repo://libs/evidence-model-core/src/adapters/modelRoot.ts
  - id: openwiki-source-38e18c58a2be3089edddbc1a
    resource: repo://libs/evidence-model-core/src/adapters/modelSourceFiles.ts
generated: { by: "pi", at: "2026-11-12T12:33:13.984Z" }
---

# Source tree and bundle adapters

Evidence stores one `DomainModelDocument` in two interchangeable forms:

- a **tree** at `.evidence/fm/` — one JSON file per object, Git-friendly, the form
  the checks and sensors read;
- a **bundle** at `*.evidence.json` — one file with a manifest and three arrays,
  the form that can be mailed or dragged into the app.

The same core document is behind both; only the adapter differs. That is why
`readModelRoot` and `loadValidationSuite` accept either, and why a caller does not
have to convert before checking
(`repo://libs/evidence-model-core/README.md#L14-L17`).

## The tree layout

```text
.evidence/fm/
  model.json                         # manifest
  entities/
    evidence-contract--product-procurement.json
    context-contract--product-procurement.json
    role-party--buyer.json
  relationships/
    relation--confirmation-payment-references-request-payment.json
  rules/
    rule--request-payment-completed.json
  validation/                        # read by checks, never rewritten here
    instances/*.json
    scenarios/*.json
  README.md                          # optional prose
  generated/                         # derived output, ignored by readers
```

The file name is a function of the object: `category-kind--slug` for entities,
`relation--slug` for relationships, `rule--slug` for rules
(`repo://libs/evidence-model-core/src/adapters/modelSourceFiles.ts#L103-L120`).

`modelSourcePaths` sorts by desired path and then by id, and appends `-2`, `-3`…
when two ids slug to the same file name, so the mapping is deterministic and
collision-free (`repo://libs/evidence-model-core/src/adapters/modelSourceFiles.ts#L123-L152`).

The three trees are the only ones the tree adapter rewrites. `discovery/`,
`generated/` and `validation/` are other owners' data:
`MODEL_NON_SOURCE_TREES` names them explicitly
(`repo://libs/evidence-model-core/src/adapters/modelSourceFiles.ts#L10-L30`).

## Serialization rules

`stringifyModelJson` writes two-space JSON with a trailing newline, and sorts keys
only when `sortKeys` is requested
(`repo://libs/evidence-model-core/src/adapters/modelSourceFiles.ts#L169-L185`).

`serializeDomainModel` orders files manifest first, then entities, relationships
and rules, each sorted by path. The order is stable so a caller can write them
deterministically (`repo://libs/evidence-model-core/src/adapters/modelSourceFiles.ts#L187-L240`).

## Parsing never throws

`parseModelSourceFiles` accumulates issues instead of failing:

- invalid JSON, a non-object document, an unsupported `type` and a duplicate id
  each become an issue on that path;
- a missing `model.json` becomes an issue at `model.json`;
- an entity-less model becomes `model.empty` — a **code**, not just a message, so
  the desktop can accept a freshly created blank project while still refusing a
  broken tree
  (`repo://libs/evidence-model-core/src/adapters/modelSourceFiles.ts#L243-L340`).

Passing `validate: true` appends the static FM checks to the same issue list.
Parsing never throws on malformed input; the caller decides what is fatal.

Non-source paths are ignored: only `.json` files under the three trees (plus the
manifest) are read, and anything under `generated/`, `discovery/` or a dot
directory is skipped.

## Writing a tree without churn

`writeModelDirectory` serializes the document, then for each file:

- reads the current bytes; if identical, records `unchanged` and writes nothing;
- otherwise writes through a temporary file and an atomic rename;
- finally removes `.json` files under the three source trees that the document no
  longer names (`written`, `unchanged`, `removed` are returned).

Other trees are never touched
(`repo://libs/evidence-model-core/src/adapters/diskAdapter.ts#L99-L174`).

Two invariants follow, both tested:

1. A second identical save touches nothing, so opening and saving a model does not
   produce Git churn.
2. Renaming or deleting an object removes its old file, but a `validation/` or
   `generated/` file is never deleted by a model save.

## The bundle envelope

A bundle is a document plus four envelope keys
(`repo://libs/evidence-model-core/src/adapters/modelBundle.ts#L32-L90`):

```jsonc
{
  "type": "fm_bundle",
  "schemaVersion": "5.0",
  "manifest": { /* model.json */ },
  "entities": [],
  "relationships": [],
  "rules": [],
  "validation": { "instances": [], "scenarios": [] },  // optional
  "readme": "…"                                        // optional
}
```

`schemaVersion` is optional on read but must be `5.0` when present. A missing
`schemaVersion` is tolerated so older bundles remain readable; a wrong one is a
reported issue.

`serializeModelBundle` sorts entities, relationships and rules **by id by
default**, because a single file is diffed as a whole and a stable order matters
more than authoring order
(`repo://libs/evidence-model-core/src/adapters/modelBundle.ts#L405-L455`).

Extras survive: `validation` and `readme` are written back exactly when the
in-memory document carries them. That is what makes an edit-then-save round trip in
the canvas lossless — the renderer's document already holds the extras it parsed.

`parseModelBundleText` follows the same "report, do not throw" rule: wrong bundle
type, wrong item type, duplicate ids, malformed validation entries and a
non-string readme each become issues; an entity-less bundle gets `model.empty`.

## Packing and unpacking

`packModelSourceFiles` parses the tree with the tree rules, then adds:

- `validation/instances/**` and `validation/scenarios/**`, preserving every file;
- the root `README.md` as `readme`.

A malformed validation file is reported, not dropped, because packing must never
silently lose the scenarios an author wrote
(`repo://libs/evidence-model-core/src/adapters/modelBundle.ts#L460-L545`).

`packModelDirectory` walks the filesystem first, deliberately skipping
`generated/` and `discovery/` (and dot directories/caches) so a bundle carries only
what describes the model
(`repo://libs/evidence-model-core/src/adapters/modelFileAdapter.ts#L34-L130`).

`unpackModelBundle` writes the bundle back as a tree with one important
difference: for `.json` files it compares **canonical JSON**, not bytes. A
hand-formatted tree whose objects already match is therefore left untouched
(`repo://libs/evidence-model-core/src/adapters/modelFileAdapter.ts#L158-L180`,
`repo://libs/evidence-model-core/src/adapters/modelFileAdapter.ts#L244-L276`).

Files the bundle does not name are left alone: unpacking is a migration step, not
a destructive reset.

## Reading a root for checks

There are three readers with different scopes:

| Reader | Reads | Use |
| --- | --- | --- |
| `readModelDirectory` | `model.json` + three trees | the disk adapter's rewrite scope |
| `readModelRootFiles` | `model.json` + three trees + `validation/` | checks and sensors |
| `readModelRootBytes` | every file except `generated/`, caches and dot paths | the digest |

`readModelRootFiles` puts the manifest first and reads a missing root as an empty
set rather than throwing, so a caller can report "this directory is not a model"
(`repo://libs/evidence-model-core/src/adapters/modelRoot.ts#L99-L140`).

`readModelRootBytes` walks everything else. Its doc comment states why: a
hand-edited `README.md` or a stray file is input too, and a check that ignored it
could be invalidated without noticing
(`repo://libs/evidence-model-core/src/adapters/modelRoot.ts#L170-L192`).

## The digest contract

`modelDigestOf` hashes each file, builds a `path → sha256` map, sorts the paths,
serialises that map, and hashes it again with a `sha256:` prefix
(`repo://libs/evidence-model-core/src/adapters/modelRoot.ts#L196-L213`).

Properties:

- independent of where the tree lives;
- independent of `generated/` output, because that tree is ignored by the reader;
- sensitive to a path rename even when content is unchanged;
- comparable between a packed and an unpacked copy **of the model sources** —
  though not of validation/readme if one side lacked them.

The digest is part of the check report and the API projection contract. A change
to canonical serialization is a change to the contract, not a formatting detail —
which is why pinned digests in tests are refreshed deliberately.

## CLI verbs

```bash
npx evidence-model pack .evidence/fm --out procurement.evidence.json [--sort-keys]
npx evidence-model unpack procurement.evidence.json --out .evidence/fm [--sort-keys]
npx evidence-model inspect procurement.evidence.json [--json]
```

`pack` defaults the output to `<model id>.evidence.json`; `unpack` defaults to
`.evidence/fm`. `inspect` reads either form and prints counts plus file-level
issues without writing. `check` is different: it reads a directory and refuses a
bundle with a hint to unpack first, so a report always names files a reader can
open
(see [The native check and simulation pipeline](./checks-and-simulation.md)).

## Failure behaviour

| Situation | Result |
| --- | --- |
| malformed JSON in a source file | issue on that path; other files still parse |
| missing `model.json` | issue at `model.json`; document keeps an empty manifest |
| unsupported document `type` | issue; the object is skipped |
| duplicate id across files | issue naming both paths; second object skipped |
| entity-less model | `model.empty` code (a blank start is allowed by the desktop) |
| wrong bundle `type` / `schemaVersion` | reported issue; parsing continues |
| malformed validation entry while packing | reported issue, file not silently dropped |
| existing file bytes equal | `unchanged`, no write |
| stale source file after rename/delete | `removed` from the three trees only |
| hand-formatted tree unpack | object untouched when canonical JSON matches |
| bundle missing/empty | reported issue, empty document returned |

## Tests that protect this contract

- `modelSourceFiles.spec.ts` pins file naming, collision suffixes, two-space JSON
  with newline, optional key sorting, manifest-first order, round-trip parsing,
  non-throwing malformed input, `model.empty` coding, duplicate ids, ignored
  non-source trees and inline validation
  (`repo://libs/evidence-model-core/src/adapters/modelSourceFiles.spec.ts#L27-L210`).
- `diskAdapter.spec.ts` pins the initial write, read-back equivalence, idempotent
  second write, only-changed-file rewrite, deletion of stale object files, leaving
  other skills' trees alone, and key sorting
  (`repo://libs/evidence-model-core/src/adapters/diskAdapter.spec.ts#L43-L198`).
- `modelBundle.spec.ts` pins suffix recognition, envelope shape, id sorting, extras
  preservation through parse/serialize and through a command, projection back to
  the tree, validation/readme packing, malformed validation reporting, a full
  pack/unpack round trip, canonical-JSON non-rewrites, byte-identical bundle
  non-writes and a missing bundle
  (`repo://libs/evidence-model-core/src/adapters/modelBundle.spec.ts#L31-L367`).

## Related pages

- [System map and dependency direction](../architecture/overview.md) — where the
  adapters sit.
- [Commands, guards and the model session](./commands-and-session.md) — the
  document these files hold.
- [Desktop app shell and IPC surface](../desktop/app-shell.md) — how a project root
  picks tree or bundle.
- [The native check and simulation pipeline](./checks-and-simulation.md) — the
  digest consumer.
