# 前馈痴迷：Agent 做完就交，从来没人检查

## Bad Smell

前馈痴迷指的是遇到 Agent 行为偏差时，第一反应是加规则、加说明，而不是建立能证明结果正确的检查。本项目里的具体表现是：把约束再写进 `AGENTS.md`、再复制一份到某个指南、在任务模板里再加一句提醒；同一约束在多个文档出现多个版本；规则加了，同类错误还在出现；检查只剩 Agent 自评，没有命令、断言和可复现证据。

前馈和反馈的区别是概率与证据的区别：前馈提高 Agent 第一次就做对的概率，反馈提供“它真的做对了”的证据。项目把底线写进 `AGENTS.md`：“行为变更必须有相应测试。只有相关 CHECK 和项目质量检查实际通过，才能声称完成。”只有前馈没有反馈时，Agent 会过于草率地结束任务：写完文件、跑一下类型检查，然后宣布完成。

这个坏味道的根源是写“怎么做”比写“怎么检查”容易：“亮点要带数据”是过程描述，写起来轻松；“检查亮点是否包含数字、百分比或对比”要求先想清楚结果长什么样。项目选择后者作为默认方向。

## Solution

项目把“先写检查”变成维护纪律和任务模板的硬要求，并让每条规则都能指到自己的反馈形式。

### 反馈优先的维护纪律

- `AGENTS.md` 的验证底线：行为变更必须有相应测试，只有实际通过才能声称完成。
- [通用命名与工程词汇](../engineering/conventions.md)的“变更约束”：新规范应连接实际检查，Java 格式由 Spotless，前端由 ESLint，文档由 Prettier 与 Guides 检查，语义边界由相应测试和审查。
- [Guides 导航](../guides/index.md)的维护纪律：新增规范应指出对应测试或人工评估；`guides:verify` 的实际覆盖限定在结构，不冒充语义。
- [测试指南](../engineering/testing.md)为每条质量命令写“实际覆盖 / 不证明什么”，让检查的证明范围先于检查结果被写清楚。

这几条纪律把“加一条规则”从纯文档动作变成成对动作：写规则时必须同时回答“它由什么检查”。

### 前馈与反馈成对登记

| 前馈                                     | 反馈                                                                                                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FM 业务规则（1 条 CEL 完成规则）         | `.evidence/fm/validation/` 的 5 份回放实例与 2 个正常／不足场景；`check_fm.py` 的只读校验与单据模拟                                                                                                                  |
| 用户故事与验收（US/AC）                  | 任务 `checks`：固定输入、预期、失败不变性、精确命令与 `evidenceRequired`                                                                                                                                             |
| 工序验收数据                             | `acceptanceCriteria` 引用具体 CHECK，并以稳定路径、操作符和有类型期望值表达；模板拒绝通用工序、文件存在或自评替代                                                                                                    |
| 架构分层：domain 不依赖 Spring/HTTP 等   | [ArchUnit 规则](../../apps/backend/src/test/java/com/evidencepoc/backend/BackendArchitectureTests.java)                                                                                                              |
| 模块化单体 profile 与任务身份            | [task_compiler 测试](../../.agents/skills/evidence-task-planning/tests/test_task_compiler.py)：profile 覆盖被拒、taskKey 确定性、依赖环被拒                                                                          |
| 计划模板契约与单一状态归属               | planning 与 delivery 各自的 Guides 契约测试：[planning](../../.agents/skills/evidence-task-planning/tests/test_guides_contract.py)、[delivery](../../.agents/skills/evidence-delivery/tests/test_guides_contract.py) |
| 前馈文档的本地链接与过期架构表述         | [Guides 检查器](../../tools/guides/check.mjs)与[自身回归](../../tools/guides/check.spec.mjs)                                                                                                                         |
| 任务状态与 CHECK 一一对应、检查只读      | [plan_state 测试](../../.agents/skills/evidence-delivery/tests/test_plan_state.py)，含前后字节不变断言                                                                                                               |
| FM 的六类凭证时间                        | [evidence 时间测试](../../.agents/skills/evidence-fm/tests/test_evidence_times.py)                                                                                                                                   |
| 扩展只注册一个命令、一个工具、无状态写入 | [index.spec.ts](../../.pi/extensions/evidence-modeling/index.spec.ts)                                                                                                                                                |
| Java 格式 / 前端规范 / 文档格式          | Spotless（`./gradlew check`）、ESLint（`npm run lint`）、Prettier（`guides:check`）                                                                                                                                  |

这张表反过来也约束前馈：一条约束如果写不出对应检查，就要么继续澄清，要么显式记为人工评估，不能只靠提醒。

### 计算型与推断型分开

[交付生命周期](../../.agents/skills/evidence-delivery/references/lifecycle.md)明确分工：交给程序的是 taskKey、路径、依赖引用、一一对应、唯一性、只读、结构关联与当前可执行任务集合；交给 Agent 的是 FM 到业务模块的映射、切片是否形成最小可验收结果、CHECK 是否真正证明业务结果、失败属于实现/任务/切片/来源哪一层。

反馈不一定是脚本。能写成脚本的检查（字段是否填写、格式是否合规、依赖是否成环、命令是否可复现）写成脚本更可靠；需要语义判断的检查（实现是否忠于业务规则、切片是否仍内聚）由 Agent 对照 FM 判断。这条分工来自一个明确认识：计算通过只证明声明结构自洽，不能证明业务设计合理或测试充分。

### 反馈的边界：证据不是批准

自动检查不是最终裁判：[测试指南](../engineering/testing.md)写明“链接可达不等于指南正确，结构覆盖不等于业务批准，测试成功不等于生产保证”。人工评估与自动回归也分开：各 Skill 的 `evals/` 是行为评测输入与评分器，不进入自动回归（评分逻辑本身另有函数级验证）；未实际执行的评测保持未执行，不因条目存在而记为通过。

### 演进触发条件

- 规则与检查的配对靠维护纪律和人工审查保证，还没有批量把规则改写成检查的清单或工具；规则继续增加时，先问“它的检查形式是什么”，必要时补测试而不是补规则。
- 语义边界、切片合理性、设计审查等只有人工评估入口，没有计算型反馈；这些结论不能由测试通过代替。
- 人工评测案例保留在 `evals/` 中，本轮没有执行记录，因此不计入通过；需要时按评测说明在独立会话中执行并保存原文依据。
