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
