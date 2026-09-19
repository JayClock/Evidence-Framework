---
name: evidence-delivery
description: 驱动 FM 到 smart-domain 机器计划的双层循环：读取 plan.yaml 的已编译任务 DAG，选择就绪任务，按任务模式执行 Guides→Action→Sensors→Steer，记录真实证据，并在代码修复、计划重编译和业务澄清之间转向。用户要求按计划继续实施、查看下一任务、恢复交付进度或检查整个计划时使用；不修改 FM 事实，不自动审批、提交 Git 或隐藏阻塞。
compatibility: Python 3.10+、PyYAML；消费 evidence-task-planning 生成的 schemaVersion 3.0 plan.yaml。
---

# Evidence 双层循环交付

以仓库中的单一机器计划连接外层 PDCA 和单任务内层操控循环。扩展只负责交互；本 Skill 不建立私有状态、自动审批、Git 提交或后台推进。

## 输入与边界

先从消费项目指令定位 Guides 导航，按任务加载项目基线与工程指南。本仓库入口为 `docs/guides/index.md`；其他项目使用实际等价来源。前馈方法由 `evidence-task-planning` 的 [任务前馈协议](../evidence-task-planning/references/guides.md)维护；独立安装时定位 planning Skill 的实际目录，不假定固定安装路径。

随后读取：

- `.evidence/fm/` 与可选 `.evidence/api/api.json`：业务和接口事实；
- `docs/plans/smart-domain/plan.yaml`：切片、计算 DAG、任务 Guides/设计、状态、CHECK、证据与缺口；
- `docs/plans/smart-domain/review.html`：只读审核投影，可缺失或过期，不能作为状态来源。

计划不存在或来源变化时，先用 `evidence-task-planning` 生成或重编译。FM/API 不完整时返回其拥有者；不得为实施通过而改写上游。用户只要求查看、验证或讨论时保持只读。完整转向规则见[双层循环协议](references/lifecycle.md)。

## 外层 PDCA

### Plan

1. 从项目宪法和 Guides 路由进入，读取 FM/API、软件范围、相关架构/质量要求、`plan.yaml` 和 Git 差异，确认授权与来源冲突。
2. 使用 planning 的 inventory/compile 命令重算 `compiled`；源摘要或 `slicing` 改变时更新计划，不信任旧投影。
3. 运行只读状态检查：

```bash
python3 "$SKILL_DIR/scripts/plan_state.py" verify \
  --plan "$PROJECT_ROOT/docs/plans/smart-domain/plan.yaml"
```

结构失败先修计划；机器通过不表示业务切片合理或业务批准。

### Do

只读计算可执行任务：

```bash
python3 "$SKILL_DIR/scripts/plan_state.py" next \
  --plan "$PROJECT_ROOT/docs/plans/smart-domain/plan.yaml"
```

从结果选择一个候选任务，只加载 `tasks[taskKey]`、其直接前置记录和所引用来源。按 Guides 检查语义就绪；`next` 只判断结构候选。开始真实实施后才把该任务 `status` 改为 `in-progress`。

按任务 `mode` 执行：`implementation` 普通实现与回归；`verify` 定位并复跑已有行为；`design/setup/manual` 按任务说明执行。环境失败如实记录为阻塞，不当作业务结果。

### Check

执行任务记录中每个适用 CHECK 的精确命令，再运行项目质量命令。随后重新运行 `plan_state.py verify`。命令输出、退出码及必要摘要才是执行证据；文件存在、Agent 自评、审核页或旧报告不是当前通过。

### Act

- 当前实现错误：留在同一任务内修复并重跑；
- 前置、环境或来源缺失：记录稳定 gap，将该任务标为 `blocked`；
- FM/API 或业务边界变化：停止实施，返回 Plan，更新上游和 slicing 后重编译；
- 具体验收数据及检查满足：每条 `acceptanceCriteria` 引用本任务 CHECK，并以 `path/operator/expected` 保存可比较预期；满足后先写 `observedEvidence`，再将任务标为 `done`；
- 更新 `plan.yaml` 后重新生成 `review.html`；当前任务结束后停止。

## 单任务内层操控循环

### Guides

每次开始、恢复、纠偏或来源变化后，核对：

1. 当前 taskKey、mode、交付结果、非目标、授权及文件范围。
2. 软件验收、FM/API/规则/场景及审核来源；架构、模块、质量属性与术语。
3. 直接前置均为 done，证据仍对应当前源、代码和环境；FM/API 摘要不覆盖工程指南，规范/howto/架构变化需评估重验。
4. 行为与数据拥有者、公开契约、事务入口、必要外部边界及依赖用法。
5. `procedureRefs` 指向真实规范/howto/范例，命令、cwd 和依赖可用。
6. 每条 `acceptanceCriteria` 引用本任务 CHECK，包含稳定路径、受限操作符、保留类型的具体 `expected`，且 CHECK 覆盖失败不变性与停止路径。

必要项缺失不进入 Action，只阻塞受影响任务，不新增状态文件。结构自洽、文件存在和范例曾通过不是语义就绪或批准。

### Action

只交付当前任务拥有的工作单元。跨模块通过计划中的公开契约协作，不重做共享基础，不扩大接口、数据库或远程协议范围。

### Sensors

优先使用编译、测试、静态分析、HTTP/SQL/事务和架构检查。再由 Agent 对照 FM 判断实现是否忠于规则、切片是否内聚、断言是否证明预期。

### Steer

代码问题在当前任务修复；任务设计问题修订同一 `tasks[taskKey]`；切片或依赖问题回到外层 Plan；业务来源问题交回 FM 澄清。调整后重跑受影响检查，不削弱场景或删除失败测试。

## 状态纪律

- `plan.yaml` 是唯一计划记录；`review.html` 可删除重建，不能反向覆盖计划。
- `compiled` 是计算投影；只由当前输入重新编译得到。
- `tasks[taskKey].status` 是状态唯一位置，依赖只来自 `compiled.tasks[*].dependsOn`。
- `tasks[taskKey].observedEvidence` 只记录真实观察；规划时为空。
- 失败和未知保留在 `gaps`，只阻塞受影响任务。
- `plan_state.py` 只读；状态写入必须是本轮获授权工作的直接结果。

完成本轮任务后报告实际改动、命令、结果、剩余缺口和下一批可执行任务，然后停止。
