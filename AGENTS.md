# Evidence PoC Agent Guide

## Project

- Nx monorepo with React/TypeScript frontend and Spring Boot/Java backend.
- Use the repository's existing frameworks and conventions; do not replace the stack without an approved architecture decision.
- Primary verification commands are `npm test`, `npm run lint`, and `npm run build`.

## Local Evidence workflow

When `.evidence/state.json` exists and the Evidence extension reports an active run:

1. Treat `.evidence/state.json` as workflow state owned by the extension. Never edit it directly.
2. Stay within the phase, artifact, user story, and round named in the active prompt.
3. Read existing artifacts before producing dependent artifacts. Files, not conversation memory, are the phase hand-off contract.
4. Init enters interactive Modeling directly; there is no preceding Requirements phase. During discovery use `evidence_ask_questions`, `evidence_save_discovery`, and isolated `evidence_check_model_draft`; human answers come only through the extension-owned answer UI (automatically opened for the current question, or manually via `/evidence-answer`). Finish discovery through `evidence_finalize_discovery` before formal language/FM and software scope/US/AC artifacts. Document tasks finish through `evidence_submit_artifact`, FM through `evidence_submit_fm_model`; never directly write discovery records or expected artifacts. Modeling has one shared Gate after scope convergence, not immediately after FM.
5. Coding must modify real source/test files and follow the approved test plan. Record Red with its task/check IDs through `evidence_tdd_red` before implementation, Green through `evidence_tdd_green`, then finish each Refactor with `evidence_complete_tdd_cycle`. Use `evidence_verify_task` for planned reuse/acceptance tasks. A Red failure must represent missing behavior, not a broken command, syntax, or environment; never invent Red for existing behavior.
6. After all applicable planned tasks and cycles are evidenced, Coding must finish through `evidence_complete_story`, listing every changed source/test file and a truthful Refactor summary. Never stage or commit changes yourself; optional checkpoints belong to the extension.
7. Review phases are read-only. Report issues; do not silently fix them.
8. Do not advance phases or approve gates yourself. Human decisions are made through `/evidence-review`.
9. Keep generated engineering artifacts in Chinese unless the original requirements or technical contract requires English.
10. While an Evidence workflow is active, do not modify `.pi/extensions/evidence`, `.pi/evidence.json`, or `.evidence` as part of a product project task, and do not directly modify approved/generated `artifacts` or `reports`. Artifact changes must go through the extension's submission or Gate editor. Explicit maintenance of the Evidence extension itself may modify `.pi/extensions/evidence`, but must not alter workflow state, gates, artifacts, or reports as part of that maintenance.

## Coding conventions

- Prefer focused changes tied to one user story.
- Preserve frontend/backend separation and API contracts.
- Add or update tests with behavior changes.
- Do not claim completion until relevant tests and the configured quality commands pass.
