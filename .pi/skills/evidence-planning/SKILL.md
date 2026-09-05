---
name: evidence-planning
description: Plan the local Evidence delivery using Scrum and INVEST, turning approved stories and architecture into an ordered Product Backlog, Sprint goals, Sprint 1 thin slices, and a verifiable Definition of Done. Use whenever the workflow enters planning or discusses backlog ordering, Sprint scope, estimates, tasks, or DoD artifacts.
---

# Evidence planning

Create a delivery plan that maximizes early validated value instead of merely scheduling technical layers.

## Workflow

1. Read approved stories, fulfillment-model status, and architecture; preserve every US-xxx and applicable FM Fulfillment/Scenario identifier.
2. Check stories against INVEST and expose stories that are too large, dependent, or untestable.
3. Order the Product Backlog using value, risk, dependency, and learning—not priority labels alone.
4. Define a Sprint goal as one demonstrable business outcome.
5. Select a small, coherent Sprint 1 slice and split it into verifiable implementation tasks. When FM applies, map normal and exceptional Scenario IDs to acceptance tests.
6. Define an objective Definition of Done with commands or evidence for every item.
7. Identify assumptions about capacity and explain how scope will be adjusted.

## Quality principles

- Story Points express relative uncertainty and effort, not hours.
- A Sprint Backlog must deliver an end-to-end increment.
- Avoid separate “frontend Sprint” and “backend Sprint” when a thin vertical slice is possible.
- Acceptance criteria remain business behavior; tasks may describe technical work.
- Never add unapproved features to make the plan look complete.

## Outputs

Generate independently:

- `product-backlog.md`
- `sprint-plan.md`
- `sprint-1-backlog.md`
- `definition-of-done.md`

Submit through `evidence_submit_artifact`.
