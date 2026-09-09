---
name: evidence-architecture
description: 从批准的统一 FM 模型设计 Evidence 软件架构，按需作 DDD 边界、实体/值对象、聚合与领域事件映射，定义模块、API、数据模型和 Q1–Q4 测试策略及工序。架构工件、领域设计取舍、技术决策或测试契约生成与修订时使用；不重新定义业务事实。
---

# Evidence architecture

将批准的统一模型转为可演进的实现契约。Modeling 是唯一业务/领域建模入口；本阶段负责设计投影和取舍，不依赖独立 DDD 工件，也不建立第二份业务事实源。

## Workflow

1. Inspect the real repository before making technology claims.
2. 读取统一语言、统一 FM v3 状态、源 YAML、编译结果、lineage 及 README 中的表达缺口。保留 Context/Entity/Rule ID，Fulfillment/Evidence/Scenario 仅在存在时引用。在 context-map.md 中设计语义边界与数据所有权，说明 FM 到 DDD/架构边界的合并、拆分或不映射依据；不是每个 Context 自动对应一个服务。
3. Choose the simplest architecture style that satisfies current quality attributes and constraints.
4. Record major decisions in Context/Decision/Consequences form and compare credible alternatives.
5. 在 module-structure.md 中定义模块与依赖方向，并按需说明实体/值对象、聚合、一致性边界、命令与领域事件设计。小范围可说明 DDD 不适用、影响及替代方案，不再强制生成四篇独立文档。
6. Specify API behavior, schemas, errors, idempotency, compatibility, event ordering/retries and transport schemas; trace operations to FM rules and documented model operation/state-transition gaps.
7. Derive the logical data model from aggregates, FM key data and use cases; define Repository boundaries, persistence concurrency and transaction mechanisms here. Do not let tables redefine domain boundaries or write implementation details back into FM.
8. 根据验收场景、领域规则、质量属性和真实仓库定义 Q1–Q4 测试策略，明确被测功能上下文、真实依赖、测试替身、环境与通过标准。
9. 将策略转化为稳定 TP-\* ID 的可复用测试工序，定义适用条件、输入、操作、验证和退出条件；具体故事任务由 Planning 实例化。

## 按需领域设计

- 根据身份、值语义和生命周期作实体/值对象选择；说明行为和规则执行位置，不只列字段。不能把每个 Role、Evidence 或 Fulfillment 机械转成实体/聚合。
- 根据 FM 不变条件选择小型聚合边界，说明聚合根、命令入口、规则检查时机与失败结果。不跨边界共享可变实体，跨聚合通常以 ID 协作。
- 合同对履约凭证的业务包含关系不等于数据库大事务。区分业务一致性要求与事务、并发、补偿和消息机制的实现选择。
- 领域事件表达过去式事实，注明触发、载荷语义、发布者/消费者；与命令、集成消息、审计日志分开。纯领域事件不虚构合同 Role。
- 在 module-structure 的表达缺口中接续 Modeling README：引用来源和所需语义，记录设计选择、未验证部分及后续 Q1/Q2 责任。缺少业务依据时回退 Modeling 修订，不能由设计补造规则。
- 确定性生成限于模型已声明的结构与规则视图；边界和战术设计仍需取舍与审核。适用设计才展开，不凑对象、聚合、事件或上下文数量。

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
- 纯领域规则、关系基数与状态迁移 gap 安排正常、边界和反例的 Q1/Q2 测试；FM lineage 通过不等于领域实例/状态机模拟通过，没有单据场景时不要求假 Scenario。

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
