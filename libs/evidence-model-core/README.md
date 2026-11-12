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
  "validation": { "instances": [], "scenarios": [] }, // optional
  "readme": "…", // optional, `.evidence/fm/README.md`
}
```

- `parseModelBundleText` / `serializeModelBundle` are pure and browser-safe.
  Bundle extras ride along on the document, so an edit-then-save round trip in
  the canvas keeps `validation` and `readme`.
- `packModelDirectory`, `unpackModelBundle` and `writeModelBundle` add the disk
  side. Unpacking never rewrites a file whose object already matches, so a
  hand-formatted tree keeps its bytes and its git status.
- `generated/` and `discovery/` never enter a bundle: one is derived output, the
  other belongs to Discovery.

Both forms are first-class for the library: `readModelRoot` and
`loadValidationSuite` accept either, so a caller decides and no extraction step
is implied.

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
