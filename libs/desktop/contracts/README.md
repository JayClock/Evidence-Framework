# Desktop IPC contracts

Nx project: `desktop-contracts`; package: `@evidence-poc/desktop-contracts`.

Owns the typed request/response/event DTOs and channel constants shared by
Electron main, preload and desktop features. Import a focused subpath such as
`/story`, `/delivery`, `/agentIpc` or `/ipc`; the root also exports the contracts.
There is no Electron, filesystem, HTTP or agent runtime implementation here.
Imports from Node libraries are type-only; the browser-safe runtime is constants.

Features accept the relevant API interface as an injected port. The desktop shell
passes `window.evidenceAPI.story`, `.projects`, `.agent` or `.drift`. Libraries
must not reach back into `apps/desktop` for either production types or fixtures.
This is a desktop contract extraction, not a generalized RPC/daemon layer.

```bash
pnpm exec nx typecheck desktop-contracts
pnpm exec nx lint desktop-contracts
pnpm exec nx sync:check
```
