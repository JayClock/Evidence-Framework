# Shared model tools

Nx project: `evidence-tools`; package: `@evidence-poc/evidence-tools`.

A universal, in-memory domain tool registry. It has no Pi SDK, MCP SDK, Electron,
filesystem or HTTP dependency. `createModelTools(ports)` supplies the shared name,
label, description, Zod input schema, write-safety annotations and execution path
for:

- `apply_model_patch`
- `batch_add_evidence_stubs`
- `split_evidence_to_pair`
- `bind_key_data_source`
- `assign_fulfillment_context`
- `simulate_what_if_challenge` (read-only)
- `grow_breach_compensation`
- `roleify_and_invert_dependency`
- `isolate_domain_calculator`

Every `run(input)` validates before invoking a host port. Recipes resolve against
the host's current document, build a standard patch batch without mutating that
document, and submit it once through `applyModelPatch`. Invalid references and
host refusals remain tool errors, not partial writes or passing results.

The host retains authorization, static guards, transaction/undo history and stale
snapshot protection. Write annotations are deliberately destructive and
**non-idempotent**; a registry is not a new persistence or permission layer.

Pi (`evidence-agent`) adapts Zod to its JSON Schema ABI and narrative results.
MCP (`evidence-mcp`) adapts the same definitions to protocol annotations and
structured results. Transport-specific tools (canvas screenshots, sensor runs,
API projection, etc.) stay in their respective adapters.

```bash
pnpm exec nx run-many -t lint,typecheck,test -p evidence-tools,evidence-agent,evidence-mcp
```

Registry tests cover validation-before-I/O, one-batch mutation, source immutability
and guard refusals. Adapter tests verify shared schemas and descriptions, while
`pnpm boundaries:drill` rejects a reverse dependency on an SDK adapter.
