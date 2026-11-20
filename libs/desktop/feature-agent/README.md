# Agent feature

Nx project: `desktop-feature-agent`; package: `@evidence-poc/desktop-feature-agent`.

Owns the node inquiry and patch review UI, transcript/tool activity presentation,
session hook and patch-review state. Internal presentation helpers
are private to the feature. Pi sessions, model loading and sensors remain in the
Node `evidence-agent` library and desktop main-process adapters.

The editor supplies a prompt function that publishes its current revision and
replays the main process's committed transactions into its local `ModelSession`.
It passes the resulting before/after snapshots to `usePatchReview` for canvas
highlights and undo. There is no renderer acknowledgement for agent tools.
The feature uses the injected `EvidenceAgentApi` from
`desktop-contracts/agentIpc`; it has no application import or global IPC lookup.

```bash
pnpm exec nx run-many -t test,typecheck,lint -p desktop-feature-agent
```
