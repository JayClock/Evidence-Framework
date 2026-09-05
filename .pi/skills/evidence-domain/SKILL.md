---
name: evidence-domain
description: Perform the local Evidence DDD phase, deriving ubiquitous language, bounded contexts, entities, value objects, aggregates, and domain events from approved requirements. Use whenever the workflow reaches domain modeling or the user asks to revise DDD artifacts, domain boundaries, aggregates, or business events.
---

# Evidence domain modeling

Use Domain-Driven Design to make business boundaries and invariants explicit before architecture or code decisions.

## Workflow

1. Read all approved requirement artifacts and preserve their story IDs and business language.
2. Establish a ubiquitous language with precise definitions, examples, non-examples, and context ownership.
3. Split bounded contexts by language, business rules, change cadence, and data ownership—not by UI pages or database tables.
4. 在限界上下文之后，依据原始需求和上游工件直接判断 FM 适用性并提交决策或模型，不设置独立问答前置条件。假设、待决策项及影响写入领域工件，交由 Domain Gate 审核；不能把信息不足当成“不适用”，也不能猜测关键业务规则。适用时使用专门的 Evidence modeling skill，区分 FM Role/Evidence/Fulfillment 与 DDD 实体、聚合。
5. Within the core context, distinguish entities by identity/lifecycle and value objects by immutable descriptive value.
6. Form aggregates around invariants and consistency boundaries. Keep transactions small.
7. Name domain events as past-tense business facts and map their publishers, consumers, and consistency expectations.
8. Record disputed or speculative modeling choices for human review.

## Quality principles

- A domain model describes behavior and rules, not an anemic data schema.
- Do not share domain entities directly across bounded contexts.
- External modifications enter through aggregate roots.
- Cross-aggregate work normally uses identifiers and eventual consistency.
- Separate a domain event from commands, integration messages, and audit logs.
- Do not force every requirement into the core domain; identify supporting and generic capabilities.

## Outputs

Generate each requested file independently:

- `ubiquitous-language.md`
- `bounded-contexts.md`
- `fm-model/` through `evidence_submit_fm_model`
- `entities-and-value-objects.md`
- `aggregates.md`
- `domain-events.md`

Submit Markdown only through `evidence_submit_artifact`; submit the fulfillment-model decision and bundle only through `evidence_submit_fm_model`.
