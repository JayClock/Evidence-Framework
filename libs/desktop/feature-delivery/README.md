# Delivery feature

Nx project: `desktop-feature-delivery`; package: `@evidence-poc/desktop-feature-delivery`.

Owns the delivery hub, incremental diff panel and live preview/export hook.
Preview revision guards, opening baseline, debounce and exact-preview export
remain in one hook for the editor lifetime, not the modal lifetime.

```tsx
const delivery = useDeliveryHub(desktopApi.projects, rootPath, session, baseDocument);
return <DeliveryHub hub={delivery} onClose={closeHub} />;
```

The hook accepts only `deliveryLivePreview` and `exportLiveDelivery` from the
project API in `desktop-contracts/ipc`. It does not access the desktop global,
filesystem or native diff tool. Main-process services perform those operations.
See `DeliveryHubProps` for the presentation options.

```bash
pnpm exec nx run-many -t test,typecheck,lint -p desktop-feature-delivery
```
