# evidence-model-core

In-memory engine for a `.evidence/fm` source tree: the read model the desktop
canvas and inspector consume, and the only sanctioned way to change it.

| Module       | Responsibility                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `model/`     | `createDomainGraph` indexes entities, edges, contexts and derived fulfillment pairs.              |
| `commands/`  | One deterministic transition per business edit, returning the new document and its inverse.       |
| `session/`   | `createModelSession` holds document, selection and undo/redo history, and emits change events.    |
| `adapters/`  | Parse/serialize the model source tree and write it back without git churn or partial files.       |

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
