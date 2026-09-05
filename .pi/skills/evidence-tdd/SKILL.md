---
name: evidence-tdd
description: Implement a local Evidence Sprint story with real Red-Green-Refactor TDD in the current repository, changing source and test files and running verification commands. Use whenever the workflow is in coding, a US-xxx story is being implemented or revised, or the user requests a TDD evidence record.
---

# Evidence TDD

Implement exactly one approved user story as a runnable increment.

## 测试策略与工序输入

- 读取已批准的 test-strategy.md、test-procedures.md 及 Sprint 1 任务，定位当前验收场景 ID、任务 ID 和工序 ID；只读取当前适用工序的技术细节。
- 写测试前明确目标组件/功能、被测边界、真实依赖、测试替身、数据和预期结果，保持策略中的隔离与集成决策，不把目标业务逻辑替换掉。
- 沿用 AC-001-01 等场景 ID，建立业务 Q2 验证与支撑 Q1 测试的关联；适用时另关联 FM ID。复用已有测试或不适用的工序说明依据，不人为破坏已满足的行为制造 Red。
- 当前扩展只保存每故事每修订轮的一组故事级 Red/Green/Refactor，不代表逐工序 TDD 已被机器验证。不要重置状态、重复调用已完成检查点或虚构工序工具；仍按下面的现有工具协议执行，无法满足的要求报告给人工处理。

## Red

1. Read the story, acceptance criteria, fulfillment-model status, architecture, API contract, test strategy, applicable procedures, DoD, and relevant existing code. When FM applies, preserve the referenced Fulfillment/Scenario semantics in executable tests.
2. Choose the smallest externally observable behavior not yet implemented.
3. Add or change a real test using the existing test framework.
4. Call `evidence_tdd_red` with a focused test command and the expected assertion/behavior failure. The extension runs the command, records a non-zero result, and returns the actual output for comparison.
5. Confirm the captured failure is caused by missing behavior—not syntax, compilation, imports, fixtures, environment, or an unrelated regression.

## Green

1. Write the smallest production change that satisfies the failing behavior.
2. Call `evidence_tdd_green`; the extension re-runs exactly the command captured at Red and requires exit code zero.
3. Run nearby tests to detect local regressions.
4. Do not implement stories or speculative abstractions outside the current US-xxx scope.

## Refactor

1. Improve names, duplication, boundaries, and readability without changing behavior.
2. Keep tests green throughout refactoring.
3. Run the configured project quality commands.
4. Inspect the final diff and remove debug output, dead code, generated artifacts, and accidental changes.

## Evidence rules

- The extension, not prose, records the actual Red and Green exit codes and bounded output.
- List every changed source and test file relative to the project root; each declaration must be dirty in Git when Git is available.
- Include at least one changed test file and one changed production source file.
- If a focused or configured quality command fails, do not claim completion; use the output/report in the next round.
- 在实现摘要中关联故事、验收场景、任务/工序、测试文件/用例和实际验证结果；列明复用、不适用或未验证项，不能用故事级检查点冒充逐工序执行证据。
- 核对每个承诺场景的 Q2 结果与关联 Q1 测试，遵守 DoD 中适用的 Q3/Q4 要求；命令通过不代表 UAT 已完成或产品已满足所有质量属性。
- Keep Story → FM Fulfillment/Scenario → test traceability explicit when FM applies.
- Complete by calling `evidence_complete_story` with the Refactor summary as the final action.
