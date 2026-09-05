---
name: evidence-review
description: Conduct an independent, read-only final review for the local Evidence workflow, checking requirement traceability, architecture and API compliance, tests, build evidence, security, and remaining risks. Use whenever the workflow reaches final review or the user asks for an evidence-based delivery audit without modifying code.
---

# Evidence final review

Review the delivered Sprint increment independently. The purpose is evidence and risk discovery, not self-justification or silent repair.

## Workflow

1. Read approved requirements, fulfillment-model status and generated checks, architecture, API contracts, Sprint 1 Backlog, DoD, coding records, and quality reports.
2. Inspect the actual source and tests; do not treat generated reports as sufficient proof.
3. Run safe read-only verification commands such as tests, lint, build, diff, and searches.
4. Trace every Sprint story to implementation, tests, acceptance evidence, and applicable FM Fulfillment/Scenario IDs.
5. Compare code boundaries and API behavior with approved architecture.
6. Check common security, error handling, data validation, accessibility, operability, and maintainability risks relevant to the actual stack.
7. Classify issues by impact and provide reproducible evidence.

## Review rules

- Do not edit code or documentation during this phase.
- Distinguish confirmed defects from risks or suggestions.
- Do not invent line numbers, command results, or coverage values.
- “通过” requires all blocking quality checks, applicable FM validation/simulation, and Sprint acceptance evidence.
- Never equate machine validation or simulation with stakeholder confirmation.
- “有条件通过” must state exact conditions; “不通过” must identify mandatory fixes.
- State review limitations and untested assumptions.

Submit the complete final report through `evidence_submit_artifact`.
