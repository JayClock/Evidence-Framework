---
name: evidence-tdd
description: Implement a local Evidence Sprint story with real Red-Green-Refactor TDD in the current repository, changing source and test files and running verification commands. Use whenever the workflow is in coding, a US-xxx story is being implemented or revised, or the user requests a TDD evidence record.
---

# Evidence TDD

只实现当前已批准故事，按任务/检查项执行可恢复的多循环 TDD。

## 测试策略与工序输入

- 读取 story-map.md 的验收标准及 `acceptance-catalog`、已批准的 test-strategy.md、test-procedures.md 和 Sprint 1 Backlog 的 `test-plan`；定位 US、AC、TASK、CHECK、TP ID，关联 FM Context/Entity/Rule 及适用的 Fulfillment/Evidence/Scenario ID。纯领域规则、操作/状态迁移 gap 的真实行为仍需 Q1/Q2 验证；模型结构通过不是软件验收。
- 只读取当前适用工序的细节，明确被测功能、真实依赖、测试替身、数据和预期结果，不把目标业务逻辑替换掉。
- 以当前 Prompt 的计划与恢复进度为准。任务模式、命令、测试文件和不适用理由只能来自已批准计划；契约改变必须回退上游重新审核，不在 Coding 修改工件或状态。
- 按端到端薄切片和前置依赖推进，不按技术层批量开发；每个故事至少一个真实 TDD 任务，每个适用检查项都需记录，不能用故事测试总数冒充覆盖。

## Red

1. 在依赖已完成的 `tdd` 任务中选择最小、尚未实现的可观察行为。
2. 用现有测试框架新增或修改真实测试，不提前写实现。
3. 调用 `evidence_tdd_red`，传入 `storyId`、`taskId`、`checkId`、与计划完全一致的 `command` 和 `expectedFailure`。工具执行命令，记录非零退出及有界输出，并保存测试文件哈希。
4. 核对输出确实证明行为缺失。语法、编译、导入、夹具、环境、零测试、无关回归和被终止的命令不算 Red；启发式过滤不能代替人的判断。

## Green

1. 写使失败行为通过的最小生产实现。
2. 调用 `evidence_tdd_green`，传 `storyId`、`observation`。扩展重跑完全相同的 Red 命令，要求通过且 Red 的测试文件未改变；不能删除或削弱测试取得 Green。
3. 检查附近回归，不实现其他故事或投机抽象。

## Refactor 与下一循环

1. 改善命名、重复、边界和可读性，不改变外部行为。
2. 调用 `evidence_complete_tdd_cycle`，传 `storyId`、`refactorSummary`。聚焦测试再次通过后才追加完成记录，状态返回 Red。
3. 同一 CHECK 可追加多个行为循环，也可进入依赖满足的下一任务。正常循环切换不增加修订 round，不重置故事级 Git 基线。
4. 恢复 Session 后沿用已记录的任务、命令和检查点；不要重复已完成的 Green 或手工清空记录。

## 复用、验收与例外

- `verify` 任务调用 `evidence_verify_task`，传 `storyId`、`taskId`，扩展执行该任务全部批准检查并记录通过结果。已有行为复用现有测试，不人为破坏它制造 Red。
- `not-applicable` 只接受批准计划中的理由，没有执行命令；不能现场将失败任务改为不适用。
- 每个承诺场景关联可执行 Q2 和支撑 Q1 测试（Q1 不适用必须明确）；核对真实装配路径。模式和 CHECK 映射是可审核声明，机器不能证明命令选择了所有目标断言或场景语义完整。
- Q3/Q4 按 DoD 的负责人、时机、环境和标准取得人工证据；当前自动工具仅覆盖 Q1/Q2，命令通过不是 UAT、性能或安全全面达标。

## 故事完成

- 完成所有适用任务，每个 tdd CHECK 至少一个完整循环，当前修订至少一个新循环；有活动 Red/Green/Refactor 时先完成它。
- 检查最终 diff，清除调试输出、死代码和意外变更；列出全部项目相对源码/测试变更，至少一个真实测试文件和一个生产源码文件。
- 最后调用 `evidence_complete_story`，提交实现、Refactor 摘要及全部变更文件，然后停止。扩展重跑所有计划检查和质量命令、核对 Git 基线，生成 `artifacts/05-coding/US-xxx.json`、`.md` 和真实报告，再创建 Gate。
- 聚焦失败保留当前检查点；最终检查失败保留已完成循环以便修复重跑，不能声称完成。人工要求修改保留历史与故事基线，并要求本修订新增循环；不手改状态/记录绕过。
- Review 重新核对每个故事的结构化记录、契约摘要、计划检查及质量结果；仍需人工检查断言、替身、业务覆盖和 Q3/Q4 的真实性。
