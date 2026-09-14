# 虚假胜利：Agent 以为自己做完了，其实没有

## Bad Smell

虚假胜利指的是完成声明只有生成者自己的判断，没有独立依据。本项目的高发场景是：文件存在或生成页存在就当成实现完成；把 `.evidence/checks/` 里的历史结果、生成报告或缓存命中当成本次通过；把结构校验通过（`plan_state.py` 的 `valid`、`guides:verify` 的 0 errors）当成语义就绪或业务批准；命令没实际执行就写“运行相关测试”；为了通过而删失败测试、改业务预期或手改机器报告。当前业务计划尚未生成，风险主要落在 Harness 与文档变更上：没有独立检查时，Agent 很容易把“文件写完了”讲成“任务完成了”。

## Solution

项目把“是否完成”从生成者手里拿走：完成条件可验证、进度记原始数据、验证由只读脚本执行、失败保留不隐藏。

### 完成条件可验证：CHECK 与 completionCriteria

[任务模板](../../.agents/skills/evidence-task-planning/assets/task-plan-template.md)的 `checks` 逐项要求目的、被测行为、真实依赖、固定输入、预期与失败不变性、测试文件、cwd、精确命令与 `evidenceRequired`；`completionCriteria` 注释规定“工序退出条件逐项对应具体 CHECK；不以通用工序、文档存在或自评替代本任务验收”。[测试指南](../engineering/testing.md)补充：命令未知时填 `null` 并关联局部 gap，不写“运行相关测试”冒充可执行。

### 记录原始进度：observedEvidence 与 taskNotes 分离

索引 `taskNotes` 是任务状态唯一位置；详情 `observedEvidence` 只记录真实观察，计划生成时为空。较长输出留在 `.evidence/checks/` 运行目录；Harness 文档维护没有业务 DAG 时可以保存独立检查记录，但不能制造业务任务 done 或审核通过。

### 独立验证者：只读状态机与项目命令

- `plan_state.py verify/next` 只读、确定性：done 必须有 `completionCriteria` 和非空 `observedEvidence`；`in-progress`/`done` 的前置必须先完成；`blocked` 必须关联 gap；taskKey、任务文件与 CHECK 一一对应。
- 回归测试固定这些边界：`test_done_requires_completion_criteria_and_observed_evidence`、`test_active_task_requires_completed_dependencies`、`test_task_notes_files_and_check_ids_are_one_to_one`。
- 它在 Plan 与 Check 两个阶段各运行一次，只报告，不替 Agent 修改状态。
- 项目质量命令充当脚本裁判：`npm test`、`npm run lint`、`npm run build`、`./gradlew check`、`npm run guides:verify`；[测试指南](../engineering/testing.md)为每条写明“实际覆盖”和“不证明什么”。

### 真实证据：命令、环境与哈希

[测试指南](../engineering/testing.md)要求记录命令、cwd、退出码、真实输出或日志路径、断言覆盖与未执行项；Nx/Gradle 的缓存命中、UP-TO-DATE 与实际执行分别说明；环境失败与实现失败区分；历史检查只在输入、环境和依赖仍有效时作为有限前置证据。获授权留存的运行目录只保存每命令的 `startedAt`、`exitCode`、时长、`logSha256` 与运行环境，以及 Python/依赖版本与 FM/API 输入摘要；不复制完整输出。

### 失败保留与反作弊

- [OpenWiki 工作流](../../.github/workflows/openwiki-update.yml)区分“生成失败”与“PR 仍有用”：`continue-on-error` 后仍创建 PR（只保留已完成页面），最后由 `exit 1` 标记工作流失败，PR body 附带实际结果。
- `AGENTS.md` 的受管块要求保留完整失败输出，并提醒 brief 中的未知项与 review 项是验证缺口，不是需求。
- 纪律：不得删失败测试、改业务预期或手改机器报告制造通过；不自动提升审核状态；链接可达不等于指南正确，结构覆盖不等于业务批准，测试成功不等于生产保证。
- 真实案例：OpenWiki 提交前检查中 `npm test` 退出码为 1，记录保留 `test.log` 并把失败指向基线复现（`knownFullSuiteFailure`），其余检查独立通过——失败被如实保留而不是改写成通过。

### 演进触发条件

- 业务任务闭环尚未跑过：`docs/plans/smart-domain/` 仍为空，`plan_state.py verify` 对缺失索引报错；已真实执行的是 Harness 与文档维护检查。
- 生成首个计划时按 CHECK 填实 `completionCriteria` 与 `evidenceRequired`，执行后只向 `observedEvidence` 写入真实结果；不需要新增状态文件。
- 现有 preflight 流程已经覆盖文档与 Harness 变更；业务任务加入后沿用同一套证据纪律即可。
