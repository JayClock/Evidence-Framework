# Agent feature

Nx project: `desktop-feature-agent`; package: `@evidence-poc/desktop-feature-agent`.

Owns the Copilot and inline patch UI, transcript/tool activity presentation,
session hook, patch bridge and patch-review state. Internal presentation helpers
are private to the feature. Pi sessions, model loading and sensors remain in the
Node `evidence-agent` library and desktop main-process adapters.

The editor composes these hooks with its existing `ModelSession`:

```tsx
const agent = useAgentSession(desktopApi.agent, rootPath);
const review = usePatchReview(session, document);
useAgentPatchBridge(desktopApi.agent, session, review.record);
```

The transport is an injected, narrow subset of `EvidenceAgentApi` from
`desktop-contracts/agentIpc`. Patch validation and atomic application still run
through `ModelSession`, so successful edits remain undoable and rejected batches
are not partially applied. Review overlays reuse `desktop-feature-canvas` types;
there is no application import or global IPC lookup in production feature code.

```bash
pnpm exec nx run-many -t test,typecheck,lint -p desktop-feature-agent
```
