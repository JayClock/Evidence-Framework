---
name: evidence-review
description: Conduct an independent, read-only final review for the local Evidence workflow, checking requirement traceability, architecture and API compliance, tests, build evidence, security, and remaining risks. Use whenever the workflow reaches final review or the user asks for an evidence-based delivery audit without modifying code.
---

# Evidence final review

Review the delivered Sprint increment independently. The purpose is evidence and risk discovery, not self-justification or silent repair.

## Workflow

1. Read approved requirements, unified FM v3 sources, status and generated checks, DDD projections and expression gaps, architecture, API contracts, test-strategy.md, test-procedures.md, Sprint 1 Backlog, DoD, coding records, and quality reports.
2. Inspect the actual source and tests; do not treat generated reports as sufficient proof.
3. Run safe read-only verification commands such as tests, lint, build, diff, and searches.
4. Trace every Sprint story and acceptance scenario ID to task/procedure IDs, implementation, Q2 acceptance evidence, supporting Q1 tests, and FM Context/Entity/Rule IDs and applicable Fulfillment/Evidence/Scenario IDs; check that DDD design does not redefine model facts.
5. Compare code boundaries and API behavior with approved architecture.
6. Check common security, error handling, data validation, accessibility, operability, and maintainability risks relevant to the actual stack.
7. Classify issues by impact and provide reproducible evidence.

## 测试策略落实检查

- 逐场景核对实际被测边界、替身与真实集成路径是否符合策略，检查是否错误替换了被测业务逻辑。
- 核对适用工序的测试文件、用例与结果；复用或 N/A 需有依据，发现遗漏时报告，不自行补造证据或修改工件。
- 依据计划核对 Q3/Q4 的负责人、环境、阈值依据和实际证据，分别标注已执行、待人工执行、经批准不适用或未验证；未执行不能写成通过。
- Q1/Q2 的关联用于覆盖与诊断，不以是否同步失败作为有效性标准；测试总数、覆盖率或 npm test/lint/build 通过不能替代业务验收。
- 读取每故事的 `artifacts/05-coding/US-xxx.json` 和 `.md`，核对 run/契约摘要、TASK/CHECK/TP/AC 引用、所有循环与 verify 记录。扩展会复核摘要、证据结构并重跑全部批准检查和质量命令；缺失、篡改、过期或任务未完成会阻塞 Gate。
- 审查报告明确列出 Sprint 每个 US 和 AC ID。机器引用匹配不证明叙述与 JSON 一致、命令真正执行了声明用例或断言覆盖全部语义；仍人工检查代码、测试、替身和 Q3/Q4，不把元数据校验当成完整业务证明。

## Review rules

- Do not edit code or documentation during this phase.
- Distinguish confirmed defects from risks or suggestions.
- Do not invent line numbers, command results, or coverage values.
- “通过” requires all blocking quality checks, applicable FM validation/simulation, and Sprint acceptance evidence.
- Never equate machine validation, simulation or Domain Gate approval with named business/domain expert confirmation. Read modelStatus/stakeholderReview from model.yaml, not a copied default.
- Pure domain lineage/compilation is not a domain instance or state-machine simulation; verify Q1/Q2 coverage of rules and expression gaps without demanding fabricated contracts or Evidence scenarios.
- “有条件通过” must state exact conditions; “不通过” must identify mandatory fixes.
- State review limitations and untested assumptions.

Submit the complete final report through `evidence_submit_artifact`.
