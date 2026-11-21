# Agent feature

Nx project: `desktop-feature-agent`; package: `@evidence-poc/desktop-feature-agent`.

Owns node inquiry and patch review. The [official assistant-ui Thread](src/assistant-ui/README.md)
handles the transcript, reasoning, tool disclosures, and composer. An external-store
adapter projects Pi's message snapshots into the Thread; it does not run a second
agent or persist chat history. Pi sessions, model loading and sensors remain in the
Node `evidence-agent` library and desktop main-process adapters.

The editor supplies a prompt function that publishes its current revision and
replays the main process's committed transactions into its local `ModelSession`.
It passes the resulting before/after snapshots to `usePatchReview` for canvas
highlights and undo. Only a replayed transaction can create the inline review;
agent tool output cannot create or approve a model change. There is no renderer
acknowledgement for agent tools.
The feature uses the injected `EvidenceAgentApi` from
`desktop-contracts/agentIpc`; it has no application import or global IPC lookup.

```bash
pnpm exec nx run-many -t test,typecheck,lint -p desktop-feature-agent
```
