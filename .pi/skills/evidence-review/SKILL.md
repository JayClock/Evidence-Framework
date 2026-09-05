---
name: evidence-review
description: Conduct an independent, read-only final review for the local Evidence workflow, checking requirement traceability, architecture and API compliance, tests, build evidence, security, and remaining risks. Use whenever the workflow reaches final review or the user asks for an evidence-based delivery audit without modifying code.
---

# Evidence final review

Review the delivered Sprint increment independently. The purpose is evidence and risk discovery, not self-justification or silent repair.

## Workflow

1. Read approved requirements, fulfillment-model status and generated checks, architecture, API contracts, test-strategy.md, test-procedures.md, Sprint 1 Backlog, DoD, coding records, and quality reports.
2. Inspect the actual source and tests; do not treat generated reports as sufficient proof.
3. Run safe read-only verification commands such as tests, lint, build, diff, and searches.
4. Trace every Sprint story and acceptance scenario ID to task/procedure IDs, implementation, Q2 acceptance evidence, supporting Q1 tests, and applicable FM Fulfillment/Scenario IDs.
5. Compare code boundaries and API behavior with approved architecture.
6. Check common security, error handling, data validation, accessibility, operability, and maintainability risks relevant to the actual stack.
7. Classify issues by impact and provide reproducible evidence.

## 测试策略落实检查

- 逐场景核对实际被测边界、替身与真实集成路径是否符合策略，检查是否错误替换了被测业务逻辑。
- 核对适用工序的测试文件、用例与结果；复用或 N/A 需有依据，发现遗漏时报告，不自行补造证据或修改工件。
- 依据计划核对 Q3/Q4 的负责人、环境、阈值依据和实际证据，分别标注已执行、待人工执行、经批准不适用或未验证；未执行不能写成通过。
- Q1/Q2 的关联用于覆盖与诊断，不以是否同步失败作为有效性标准；测试总数、覆盖率或 npm test/lint/build 通过不能替代业务验收。
- 当前扩展只有故事级一组 TDD 检查点；Markdown 结构校验不证明逐场景覆盖、逐工序 TDD 或跨工件 ID 语义正确。明确人工检查结论与机器证据的不同粒度。

## Review rules

- Do not edit code or documentation during this phase.
- Distinguish confirmed defects from risks or suggestions.
- Do not invent line numbers, command results, or coverage values.
- “通过” requires all blocking quality checks, applicable FM validation/simulation, and Sprint acceptance evidence.
- Never equate machine validation or simulation with stakeholder confirmation.
- “有条件通过” must state exact conditions; “不通过” must identify mandatory fixes.
- State review limitations and untested assumptions.

Submit the complete final report through `evidence_submit_artifact`.
