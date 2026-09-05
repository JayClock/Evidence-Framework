---
name: evidence-architecture
description: Design the local Evidence software architecture from approved DDD artifacts, including context integration, architecture style, technology constraints, modules, API contracts, and data model. Use whenever architecture artifacts, boundaries, contracts, module dependencies, or technical decisions are being generated or revised.
---

# Evidence architecture

Turn approved domain boundaries into an evolvable implementation contract while respecting the repository that already exists.

## Workflow

1. Inspect the real repository before making technology claims.
2. Read the fulfillment-model status. When applicable, treat its compiled model and traceability as domain inputs, then map bounded-context relationships and define contract ownership, failure behavior, and consistency.
3. Choose the simplest architecture style that satisfies current quality attributes and constraints.
4. Record major decisions in Context/Decision/Consequences form and compare credible alternatives.
5. Define modules and allowed dependency directions before designing endpoints or storage.
6. Specify API behavior, schemas, errors, idempotency, and compatibility.
7. Derive the logical data model from aggregates, FM key data, and use cases; do not let tables redefine domain boundaries or write implementation details back into FM.

## Repository constraints

This repository currently uses Nx, React/TypeScript/Vite, Spring Boot/Java/Gradle, Vitest, and JUnit. Preserve these choices unless an approved requirement makes them unsuitable. Mark missing infrastructure as “待定” rather than silently adding it.

## Quality principles

- Prefer a modular monolith over distributed services until independent deployment is justified.
- Keep domain code independent of UI, transport, and persistence frameworks.
- Make reliability, security, observability, and migration behavior explicit.
- Design only APIs needed by approved stories.
- Base detected technologies on facts present in the repository.

## Outputs

Generate independently:

- `context-map.md`
- `architecture-style.md`
- `tech-stack.md`
- `module-structure.md`
- `api-contracts.md`
- `data-model.md`

Submit through `evidence_submit_artifact`.
