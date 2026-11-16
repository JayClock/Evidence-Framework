# Story feature

Nx project: `desktop-feature-story`; package: `@evidence-poc/desktop-feature-story`.

Owns `StoryDrawer`, `StoryPlayerBar` and `useStoryPlayback`: debounced snapshots,
saved-source invalidation, playback/focus state and What-If presentation. The
application shell still coordinates canvas selection, view modes and reloads.

```tsx
const playback = useStoryPlayback({
  api: desktopApi.story,
  rootPath,
  document,
  enabled: viewMode === 'walkthrough',
});
```

The port is `EvidenceStoryApi` from `desktop-contracts/story`. Production code
never reads `window.evidenceAPI`; tests can supply a plain scripted port. Agent
DTOs come from its browser-safe entry, not the Node runtime. Renderer fixtures
are shared through `desktop-testing`.

```bash
pnpm exec nx run-many -t test,typecheck,lint -p desktop-feature-story
```
