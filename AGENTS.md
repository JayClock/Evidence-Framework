# Evidence PoC Agent Guide

## Project

- Nx monorepo with React/TypeScript frontend and Spring Boot/Java backend.
- Use the repository's existing frameworks and conventions; do not replace the stack without an approved architecture decision.
- Primary verification commands are `npm test`, `npm run lint`, and `npm run build`.

## Local FM modeling workflow

- Use `.pi/extensions/fm-modeling/` for the modeling command and question UI.
- Start explicit modeling work with `/fm-model`, which delegates to the `fm-modeling` skill.
- The extension provides interaction only. Business records and FM files remain under `.evidence/` and are maintained directly according to the modeling skills.
- Distinguish discussion, model editing, and read-only validation. Do not edit the formal model unless the user authorizes generation or modification.
- Use `fm_ui_question` only for one business question at a time. Save any answer or control state before continuing.
- Validate actual model changes and report real results; do not treat a successful write or machine check as business approval.
- Maintain task progress in the authorized plan files and record actual evidence; do not change approvals or Git history automatically.

## Coding conventions

- Prefer focused changes tied to one user story.
- Preserve frontend/backend separation and API contracts.
- Add or update tests with behavior changes.
- Do not claim completion until relevant tests and the configured quality commands pass.
