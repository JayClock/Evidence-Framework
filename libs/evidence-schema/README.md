# evidence-schema

Typed contracts for Fulfillment Modeling (FM) v5 sources, shared by the desktop
client, the model core and future MCP tools.

- `ast/` — entity, relationship, rule and document types with narrow guards,
  mirroring `evidence-fm/schemas/*.json` field for field.
- `validation/` — `strictValidateDomainModel` ports the deterministic half of
  `evidence-fm/scripts/fm_model.py` (ids, category contracts, context ownership,
  responsibility, relationship endpoints, derivation symmetry). Traceability,
  key-data providers, scope completeness and CEL evaluation stay in the Python
  sensors.
- `inspector/` — declarative metadata for the right-hand inspector: groups,
  editors, reference constraints and the attribute/rule field tables.

The package has no runtime dependencies and never mutates its input.

```bash
nx build evidence-schema
nx test evidence-schema
```

`tests/fixtures/product-procurement/` is a snapshot of a real FM model source
tree; validator tests mutate clones of it instead of editing fixtures.
