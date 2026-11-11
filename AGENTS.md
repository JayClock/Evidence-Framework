## Environment

Modeling runs on a pinned interpreter, never a bare `python3`:

- `./init.sh` creates or repairs the pinned environment; `./init.sh --check` reports drift without installing.
- Run skill scripts and `scripts/check_env.py` with the `PYTHON` it prints. `.python-version` and `requirements.lock` are the pins and are reviewed like code; see [ENVIRONMENT.md](ENVIRONMENT.md).
- `.agents/skills/` is the only skill source. Global skill directories and unpinned third-party skills are not part of this environment.

## Workspace

One npm workspace, three directories: `apps/` (runnable), `packages/` (TypeScript libraries), `libs/backend/` (Gradle modules).

- Declare a runtime dependency in the `package.json` of the project that imports it; the root manifest keeps dev tooling only.
- Workspace packages resolve from `src` through the `@evidence-poc/source` export condition, so a bundler or test runner that omits it in `resolve.conditions` silently falls back to `dist`.
- See [docs/workspace-layout.md](docs/workspace-layout.md) before adding a package or a target.
