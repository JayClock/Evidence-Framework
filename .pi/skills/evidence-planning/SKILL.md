---
name: evidence-planning
description: Plan the local Evidence delivery using Scrum and INVEST, turning approved stories, architecture, test strategy, and reusable test procedures into an ordered Backlog, scenario-based tasks, and a verifiable DoD. Use whenever the workflow enters planning or discusses Sprint scope, task decomposition, acceptance traceability, estimates, or DoD artifacts.
---

# Evidence planning

Create a delivery plan that maximizes early validated value instead of merely scheduling technical layers.

## Workflow

1. Read approved stories, fulfillment-model status, architecture, test-strategy.md, and test-procedures.md; preserve every US-xxx, acceptance scenario ID, TP-\* procedure ID, and applicable FM Fulfillment/Scenario identifier.
2. Check stories against INVEST and expose stories that are too large, dependent, or untestable.
3. Order the Product Backlog using value, risk, dependency, and learning—not priority labels alone.
4. Define a Sprint goal as one demonstrable business outcome.
5. Select a small, coherent Sprint 1 slice. 按“故事 → 验收场景 → 适用工序 → 可验证任务”拆分，关联目标功能上下文、测试数据/预期结果、Q1/Q2 测试、前置任务、文件范围及完成证据。When FM applies, map normal and exceptional Scenario IDs to acceptance tests.
6. Define an objective Definition of Done with commands or evidence for every item.
7. Identify assumptions about capacity and explain how scope will be adjusted.

## Quality principles

- Story Points express relative uncertainty and effort, not hours.
- A Sprint Backlog must deliver an end-to-end increment.
- Avoid separate “frontend Sprint” and “backend Sprint” when a thin vertical slice is possible.
- Acceptance criteria remain business behavior; tasks may describe technical work.
- Never add unapproved features to make the plan look complete.

## 测试计划约束

- 从上游保留 AC-001-01 等稳定验收场景 ID；缺失时要求修订上游，不自行重编号或改变验收语义。
- 工序是场景内的开发方法，不是技术层排期。按端到端薄切片安排依赖，允许复用测试和共享前置任务，不强制所有故事执行所有工序。
- 逐场景列出 Q2 业务验证与支撑 Q1 测试的关联；不适用项写明 N/A 及理由，不以总覆盖率代替验收覆盖。
- Sprint 计划提前安排 Q3/Q4 的负责人角色、时机、环境、阈值依据和证据。待人工执行不是已通过，基础设施缺失应影响容量、风险或范围。
- DoD 同时要求适用工序的实际证据、验收验证及现有质量命令；例外交由人工批准，不能用文档例外绕过扩展阻塞检查。
- Sprint 1 Backlog 必须按模板输出一个 `test-plan` JSON。故事顺序即交付顺序，场景集合与 Requirements 目录完全一致，TP 来自 Architecture 目录；TASK/CHECK 全局唯一，同故事依赖无环。
- 区分 `tdd`（每 CHECK 至少一个完整循环）、`verify`（有理由且实际重跑全部检查）与 `not-applicable`（有理由、无 checks）。每故事至少一个真实 TDD 任务，每场景至少有可执行 Q2 与 Q1 任务或明确 Q1 不适用声明。不能把仅文档故事送入必须改源码/测试的 Coding。
- 指定从项目根运行的受支持命令与明确测试文件；文件可待创建，基础设施需先准备。若需强制分别验证多个行为，拆成不同 CHECK；一项 CHECK 关联多场景时解释实际断言覆盖。
- Planning Gate 会绑定上游契约摘要；后续修改必须回退重新审核。机器校验声明的 ID/依赖/命令记录，不能证明 JSON 与叙述、真实测试语义一致；人工仍核对完整验收及 Q3/Q4。

## Outputs

Generate independently:

- `product-backlog.md`
- `sprint-plan.md`
- `sprint-1-backlog.md`
- `definition-of-done.md`

Submit through `evidence_submit_artifact`.
