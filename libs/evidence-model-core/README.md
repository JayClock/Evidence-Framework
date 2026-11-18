# evidence-model-core

In-memory engine for a `.evidence/fm` source tree: the read model the desktop
canvas and inspector consume, and the only sanctioned way to change it.

| Module       | Responsibility                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `model/`     | `createDomainGraph` indexes entities, edges, contexts and derived fulfillment pairs.              |
| `commands/`  | One deterministic transition per business edit, returning the new document and its inverse.       |
| `session/`   | `createModelSession` holds document, selection and undo/redo history, and emits change events.    |
| `adapters/`  | Parse/serialize the model source tree and write it back without git churn or partial files.       |
| `diff/`      | `diffDomainModels` lists what moved between two snapshots: objects, attribute rows and key data.   |

## Two source forms, one model

`.evidence/fm/` (a tree) and `*.evidence.json` (one bundle) hold the same
`DomainModelDocument`; only the adapter differs.

```jsonc
// <model>.evidence.json
{
  "type": "fm_bundle",
  "schemaVersion": "5.0",
  "manifest": { /* model.json */ },
  "entities": [],
  "relationships": [],
  "rules": [],
  "readme": "…", // optional, `.evidence/fm/README.md`
}
```

- `parseModelBundleText` / `serializeModelBundle` are pure and browser-safe.
  Inline `examples` and `readme` ride along on the document, so an edit-then-save
  round trip in the canvas keeps them.
- `packModelDirectory`, `unpackModelBundle` and `writeModelBundle` add the disk
  side. Unpacking never rewrites a file whose object already matches, so a
  hand-formatted tree keeps its bytes and its git status.
- `generated/` never enters a bundle: it is derived output, not a source.

Both forms carry the same inline examples. Acceptance cases live exclusively in
`entities[].examples[].test`; `evidence export --tests` emits a Bruno collection
without introducing another authored source format. Legacy bundle `validation` envelopes
and `validation/` source files are rejected, not migrated or silently ignored.
The static FM report (v6) proves consistency and scope completeness only, never
backend test execution. The old simulator, instance timeline, role-play packet
and replay APIs/CLI commands have been removed.

```bash
pnpm model:pack .evidence/fm --out procurement.evidence.json
pnpm model:inspect procurement.evidence.json
pnpm model:unpack procurement.evidence.json --out .evidence/fm
```

The `check` and derive commands read a directory; `check` refuses a bundle with a
hint to unpack it first, so a report always names files a reader can open.

Red lines enforced by the command layer, not by the caller:

- ids are unique and well formed across entities, relationships and rules;
- requests and confirmations belong to a Contract Context whose root Contract
  binds the responsible Party Role;
- every evidence moment models its mandated business time as a required keyData
  timestamp;
- a derivation rule and the attribute it writes are always saved together.

Incremental edits are allowed to be transiently incomplete; pass
`validateOnDispatch: true` (or call `session.validate()`) to gate a commit on the
same static checks the schema package exposes.

```bash
nx build evidence-model-core
nx test evidence-model-core
```
