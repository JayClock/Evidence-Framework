# 虚假胜利：Agent 以为自己做完了，其实没有

## Bad Smell

虚假胜利指的是完成声明只有生成者自己的判断，没有独立依据。本项目的高发场景是：文件存在或生成页存在就当成实现完成；把 `.evidence/checks/` 里的历史结果、生成报告或缓存命中当成本次通过；把结构校验通过（`plan_state.py` 的 `valid`、`guides:verify` 的 0 errors）当成语义就绪或业务批准；命令没实际执行就写“运行相关测试”；为了通过而删失败测试、改业务预期或手改机器报告。

它会以两种面貌出现：还没开工时，Agent 把“文件写完了”讲成“任务完成了”；开工之后，Agent 跳过需要深推理的部分，只处理容易的部分，然后对整项任务自信宣布完成。两种面貌的共同点都是自评代替验证。

## Solution

项目把“是否完成”从生成者手里拿走：完成条件可验证、进度记原始数据、验证由只读脚本执行、失败保留不隐藏。

### 完成条件可验证：CHECK 与 completionCriteria

[任务模板](../../.agents/skills/evidence-task-planning/assets/task-plan-template.md)的 `checks` 逐项要求目的、被测行为、真实依赖/Fake、固定输入与业务时间、正常/边界/反例、失败不变性、测试文件、cwd、精确命令与 `evidenceRequired`；`completionCriteria` 注释规定“工序退出条件逐项对应具体 CHECK；不以通用工序、文档存在或自评替代本任务验收”。[测试指南](../engineering/testing.md)补充：命令未知时填 `null` 并关联局部 gap，不写“运行相关测试”冒充可执行。

### 记录原始进度：observedEvidence 与 taskNotes 分离

索引 `taskNotes` 是任务状态唯一位置；详情 `observedEvidence` 只记录真实观察，计划生成时为空。每条证据写明 `checkId`、`command`、`exitCode` 与 `observed`，例如“SubscriptionTests 4 项通过，3 个 Gradle task 均实际执行；覆盖 11 个必填字段、重复编号拒绝及失败后集合不变”，而不是“已完成”。较长输出留在获授权的检查目录并引用；Harness 文档维护没有业务 DAG 时可以保存独立检查记录，但不能制造业务任务 done 或审核通过。

### 独立验证者：只读状态机与项目命令

- `plan_state.py verify/next` 只读、确定性：done 必须有 `completionCriteria` 和非空 `observedEvidence`；`in-progress`/`done` 的前置必须先完成；`blocked` 必须关联 gap；taskKey、任务文件与 CHECK 一一对应。
- 回归测试固定这些边界：`test_done_requires_completion_criteria_and_observed_evidence`、`test_active_task_requires_completed_dependencies`、`test_task_notes_files_and_check_ids_are_one_to_one`、`test_blocked_task_and_empty_command_require_known_gap`。
- 它在 Plan 与 Check 两个阶段各运行一次，只报告，不替 Agent 修改状态。
- 项目质量命令充当脚本裁判：`npm test`、`npm run lint`、`npm run build`、`./gradlew check`、`npm run guides:verify`；[测试指南](../engineering/testing.md)为每条写明“实际覆盖”和“不证明什么”。

### 真实证据：命令、环境与哈希

[测试指南](../engineering/testing.md)要求记录命令、cwd、退出码、真实输出或日志路径、断言覆盖与未执行项；Nx/Gradle 的缓存命中、UP-TO-DATE 与实际执行分别说明；环境失败与实现失败区分；历史检查只在输入、环境和依赖仍有效时作为有限前置证据。获授权留存的运行目录只保存每命令的 `startedAt`、`exitCode`、时长、`logSha256` 与运行环境，以及 Python/依赖版本与 FM/API 输入摘要；不复制完整输出。仓库曾一次性清空约 1.0 MB 过期检查记录，并把目录约定收紧为“紧凑运行清单”，让旧证据不再充当本次结果。

### 失败保留与反作弊

- [OpenWiki 工作流](../../.github/workflows/openwiki-update.yml)区分“生成失败”与“PR 仍有用”：`continue-on-error` 后仍创建 PR（只保留已完成页面），最后由 `exit 1` 标记工作流失败，PR body 附带实际结果。
- `AGENTS.md` 的受管块要求保留完整失败输出，并提醒 brief 中的未知项与 review 项是验证缺口，不是需求。
- 纪律：不得删失败测试、改业务预期或手改机器报告制造通过；不自动提升审核状态；链接可达不等于指南正确，结构覆盖不等于业务批准，测试成功不等于生产保证。
- 仓库里出现过“既有失败如实保留、指向基线复现”的阶段，随后由专门的重构任务修复该失败并让交付可用 `project` 逐字节复现；失败没有被改写成通过，也没有被留成永久借口。

### 实际闭环：计划任务与证据

业务计划编译出 8 个任务，执行顺序由依赖决定。已完成的两个任务都满足“完成条件 + 真实证据”：

- `foundation::context.subscription::role.reader` 与 `domain::context.subscription::request.payment` 在索引 `taskNotes` 中为 `done`，`observedEvidence` 非空；
- 领域 CHECK 记录 `SubscriptionTests 4 项`、`PaymentStatusTests 5 项` 与领域回归 `20 项`，并注明“均实际执行”；
- 项目质量记录区分了 Gradle 的“13 个实际执行、15 个 up-to-date”和 Nx 的“34 个命中缓存、1 个实际执行”；
- 需要复验时使用 `--rerun-tasks`，不把缓存命中描述为新运行。

结构校验与语义判断分得很开：`plan_state.py verify` 通过只说明计划结构有效，是否“切片合理、CHECK 证明业务结果”仍由 Agent 对照业务来源判断；`guides:verify` 的 0 errors 只说明文档链接与格式，不说明指南正确。

### 缺口保持为缺口

可执行基线之外的未知被登记为 gap，而不是被“看起来做完了”吞掉：`GAP-IDENTITY` 说明可信身份与代表权限未决定，只阻塞依赖它的 API 与验收任务；`GAP-DATABASE` 说明生产数据库未选型，只阻塞生产方言与并发验收。纯领域任务不因它们停工，生产保证也不会被本地 H2 证据替代。

### 演进触发条件

- 业务任务闭环已经实际跑过：任务 1、2 完成并留下真实证据；任务 3～8 仍为 `planned`，沿用同一套证据纪律，不需要新增状态文件。
- 验证者目前是同一会话内的只读脚本与项目命令，没有跨会话的独立复核角色；检查设计是否真正证明业务结果仍属人工判断。
- 人工判断类证据（设计审查、旅程语义）无法脚本化，只能在任务详情里显式记录观察方法、预期与差异；这类证据存在不等于业务批准。
