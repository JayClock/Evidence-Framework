## Environment

One toolchain: Node.js and pnpm. `pnpm install` is the whole setup.

- The checks, the derived documents, the API projection and the review page are TypeScript commands in `libs/`; nothing runs an interpreter, so there is no second runtime to pin. See [ENVIRONMENT.md](ENVIRONMENT.md).
- There is no skill tree. The modeling instructions, the JSON Schemas and the page assets ship inside the libraries that read them, so a project only holds its `.evidence/` sources and the desktop discovers no instructions from a working copy.

## Workspace

One pnpm workspace, two directories: `apps/` (runnable) and `libs/` (TypeScript libraries). Package-manager settings live in `pnpm-workspace.yaml`, not `.npmrc`.

- Declare a runtime dependency in the `package.json` of the project that imports it; the root manifest keeps dev tooling only.
- A dependency on a workspace package uses `workspace:*`.
- Workspace packages resolve from `src` through the `@evidence-poc/source` export condition, so a bundler or test runner that omits it in `resolve.conditions` silently falls back to `dist`.
- `node_modules/.cache` holds build caches (Nx, Vite, the desktop resource tree); deleting `node_modules` means rerunning `pnpm install`.
- See [docs/workspace-layout.md](docs/workspace-layout.md) before adding a package or a target.

<!-- OPENWIKI:START -->

## OpenWiki

This repository has a generated `openwiki/` evidence index. It is optional just-in-time context, not required startup reading.

- Do not enumerate, preload, or search wikis at task start. Use retrieval when the user asks for it, when unfamiliar architecture or dependency behavior materially affects the task, or when source inspection leaves an important uncertainty. Stop once the question is grounded.
- When those conditions apply and OpenWiki retrieval tools are available, use `openwiki_search` for just-in-time context and `openwiki_read` for the relevant complete sections. If search returns `workspace_required`, ask which listed workspace to use and retry with its ID.
- Use `openwiki_list_workspaces` or `openwiki_list_wikis` when workspace membership itself needs to be discovered.
- If the retrieval tools are unavailable, read `openwiki/quickstart.md` and follow its links to the relevant pages.
- Treat source code and tests as authoritative. A brief's unknowns and review items are verification gaps, not automatic requirements.
- Prefer the narrowest quiet validation that proves the changed behavior. Preserve complete failure output.

Use the repository's documented maintenance process to refresh generated pages after source changes. Check its configuration and completed runs before relying on automatic updates. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
