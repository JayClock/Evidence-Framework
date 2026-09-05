---
name: evidence-architecture
description: Design the local Evidence software architecture from approved DDD artifacts, including boundaries, contracts, data model, Q1–Q4 test strategy, functional test contexts, test doubles, and reusable test procedures. Use whenever architecture artifacts, testing strategy, testing procedures, or technical decisions are being generated or revised.
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
8. 根据验收场景、领域规则、质量属性和真实仓库定义 Q1–Q4 测试策略，明确被测功能上下文、真实依赖、测试替身、环境与通过标准。
9. 将策略转化为稳定 TP-\* ID 的可复用测试工序，定义适用条件、输入、操作、验证和退出条件；具体故事任务由 Planning 实例化。

## Repository constraints

This repository currently uses Nx, React/TypeScript/Vite, Spring Boot/Java/Gradle, Vitest, and JUnit. Preserve these choices unless an approved requirement makes them unsuitable. Mark missing infrastructure as “待定” rather than silently adding it.

## Quality principles

- Prefer a modular monolith over distributed services until independent deployment is justified.
- Keep domain code independent of UI, transport, and persistence frameworks.
- Make reliability, security, observability, and migration behavior explicit.
- Design only APIs needed by approved stories.
- Base detected technologies on facts present in the repository.

## 测试策略与工序

- 按受众和目的区分四象限，而不是把单元测试等同于 Q1、集成测试等同于 Q2；提前安排 Q3/Q4，不能到最终审查才考虑。
- 功能上下文是测试边界，不等于 DDD 限界上下文。可以合并低价值边界，但说明可测试性和成本依据。
- 明确真实实现与 Dummy/Fake/Stub/Spy/Mock 的选择，不替换被测业务逻辑；基于验收场景建立 Q2 与 Q1 的多对多关联，不要求二者必然同时失败。
- 测试策略说明“验证什么及为什么”，工序说明“如何开发与验证”；分别使用 test-strategy.md、test-procedures.md 模板，不复制整份 Sprint 任务。
- 只采用仓库实际存在或已批准引入的工具。数据库、浏览器测试等基础设施缺失时列为待建设/待定，不照搬示例框架，也不虚构成功的命令或已批准阈值。
- test-procedures.md 按模板输出一个 `test-procedures` JSON 目录，保存稳定工序 ID 及主要象限，和逐工序定义一致。Planning 只实例化 Q1/Q2 自动任务；Q3/Q4 另由计划和 DoD 安排人工证据。
- 结构校验不证明策略有效、工序已执行或业务验收完成；风险接受由人工 Gate 决定。

## Outputs

Generate independently:

- `context-map.md`
- `architecture-style.md`
- `tech-stack.md`
- `module-structure.md`
- `api-contracts.md`
- `data-model.md`
- `test-strategy.md`
- `test-procedures.md`

Submit through `evidence_submit_artifact`.
