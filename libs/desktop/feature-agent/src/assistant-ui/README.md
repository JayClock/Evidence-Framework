# Upstream assistant-ui components

These files come from the [official assistant-ui registry](https://r.assistant-ui.com/registry.json) (entry: `thread`, core version 0.15.37) and its shadcn dependencies. Each file records its registry URL. Fetch registry updates in a temporary directory, then reapply the local import rewrites and desktop-specific changes. Keep Evidence business logic outside this directory.

The older published `@assistant-ui/react-ui@0.2.1` package imports a hook removed from current `@assistant-ui/react`; the registry is the supported way to use the official Thread. The desktop reuses its existing Button, Dialog, Tooltip and class-name helper.
