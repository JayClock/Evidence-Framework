# Environment

One toolchain: Node.js and pnpm. `pnpm install` is the whole setup — there is no
interpreter to pin, no virtualenv to repair and no lockfile for a second runtime.

```bash
pnpm install
npx nx run-many -t test typecheck lint
npx nx start desktop
```

## What runs where

| Concern                                                        | Lives in                                          | Runs in      |
| -------------------------------------------------------------- | ------------------------------------------------- | ------------ |
| model parsing, CEL, scope, simulation, timeline, FM report       | `libs/evidence-model-core/src/validation/`         | process      |
| lineage, role-play packet, `check`/`compile`/`simulate` commands | `libs/evidence-model-core/src/derive/`             | process      |
| sensors, stage gate, agent tools                                | `libs/evidence-modeling-orchestrator`             | process      |
| API contract projection, OpenAPI, HTTP journeys                 | `libs/evidence-api` (`evidence-api` command)       | process      |
| offline review page                                             | `libs/evidence-visualization` (`evidence-workbench` command) | process |
| interview and modeling prompts                                  | `.agents/skills/*/{SKILL.md,references}`          | prompt layer |

Nothing under `.agents/skills/` is executed. A skill package is the agent's
instructions plus the data it points at:

| Path in a skill | What it is |
| --------------- | ---------- |
| `SKILL.md`, `references/*.md` | the prompt layer the agent reads |
| `schemas/*.json` | the contract the guides and the libraries both consume |
| `evidence-visualization/assets/*` | the page templates the generator inlines |

The Python scripts these packages used to carry are gone; the checks, the derived
documents and the generators are the TypeScript commands listed above. A command
is the same code the app runs, so a terminal and a window cannot disagree:

```bash
npx evidence-model check .evidence/fm --scope context.product-procurement
npx evidence-model compile .evidence/fm --out .evidence/fm/generated/model.json
npx evidence-api project --project-root "$PWD" --fm .evidence/fm --fm-check check.json --api .evidence/api/api.json
npx evidence-workbench generate --project-root "$PWD"
```

## Fixtures and pins

- `libs/evidence-model-core/tests/fixtures/` holds the golden models the checks
  are tested against; `libs/evidence-api/tests/fixtures/` holds the API designs.
  Suites in other libraries read them by relative path rather than keeping a
  copy, so there is one place to refresh a fixture.
- `libs/evidence-schema/tests/fixtures/product-procurement/` is a snapshot of a
  real model tree, copied so schema tests stay stable when the API fixture moves.
- Digests printed by the checks (`modelDigest`, `timelineSummary.sha256`) are
  part of the report contract. A change to canonical serialization is a change to
  the contract, not a formatting detail: refresh the pinned values in the specs
  deliberately and say why in the commit message.

## Workspace

One pnpm workspace, two directories: `apps/` (runnable) and `libs/` (TypeScript
libraries). Package-manager settings live in `pnpm-workspace.yaml`, not
`.npmrc`. See [docs/workspace-layout.md](docs/workspace-layout.md) before adding a
package or a target.

Workspace packages resolve from `src` through the `@evidence-poc/source` export
condition, so a bundler or test runner that omits it in `resolve.conditions`
silently falls back to `dist`.

## Desktop packaging

`nx build desktop` first runs `scripts/prepare-desktop-resources.mjs`, which
copies the skill tree into `apps/desktop/resources/skills`; Forge ships it beside
`app.asar` because Pi lists that directory with `node:fs`. No interpreter and no
virtualenv are packaged — the app decides everything in-process.
