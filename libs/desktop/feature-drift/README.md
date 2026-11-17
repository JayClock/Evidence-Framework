# Drift feature

Nx project: `desktop-feature-drift`; package: `@evidence-poc/desktop-feature-drift`.

Owns `DriftRadar` and `useDriftAudit`. A selected production trace is compared
against the saved model by the main-process service; this feature renders the
findings, errors and trace selection state. It does not read files or inspect
production systems directly.

```tsx
<DriftRadar api={desktopApi.drift} rootPath={rootPath} onClose={closeHub} />
```

`api` implements `EvidenceDriftApi` from `desktop-contracts/drift`. The hook takes
the same injected port followed by `rootPath`. Labels come from
`evidence-agent/browser`; no Node agent runtime is loaded into the renderer.

```bash
pnpm exec nx run-many -t test,typecheck,lint -p desktop-feature-drift
```
