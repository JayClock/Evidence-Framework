---
name: smart-domain-delivery
description: 驱动 FM 到 smart-domain 实施计划的双层循环：读取已编译任务 DAG，选择就绪任务，按任务模式执行内层 Guides→Action→Sensors→Steer，记录真实证据，并在代码修复、计划重编译和业务澄清之间正确转向。用户要求按 smart-domain 计划继续实施、查看下一任务、恢复交付进度、闭环执行或检查整个计划时使用；不修改 FM 业务事实，不自动审批、提交 Git 或隐藏阻塞。
compatibility: Python 3.10+、PyYAML；消费 smart-domain-task-planning 生成的 schemaVersion 2.0 计划。
---

# smart-domain 双层循环交付

以仓库文件连接外层 PDCA 和单任务内层操控循环。扩展只负责交互；本 Skill 不建立私有状态、自动审批、Git 提交或后台推进。

## 输入与边界

默认读取：

- `.evidence/fm/` 与可选 `.evidence/api/api.yaml`：业务和接口事实；
- `docs/plans/smart-domain/index.md`：切片、编译 DAG、任务状态与缺口；
- `docs/plans/smart-domain/tasks/*.md`：局部设计、步骤、检查与真实证据。

计划不存在或来源已变化时，先使用 `smart-domain-task-planning` 生成或重编译。FM/API 不完整时返回其拥有者处理；不得为了实施通过而改写上游事实。用户只要求查看、验证或讨论时保持只读。

完整生命周期与转向规则见 [双层循环协议](references/lifecycle.md)。

## 外层 PDCA

### Plan

1. 读取当前 FM、API、索引和 Git 差异，确认路径及授权范围。
2. 使用 `smart-domain-task-planning` 的 inventory/compile 命令重算当前投影；源摘要或 slicing 改变时更新索引，不信任旧 compiled。
3. 运行本 Skill 的只读状态检查：

```bash
python3 "$SKILL_DIR/scripts/plan_state.py" verify \
  --index "$PROJECT_ROOT/docs/plans/smart-domain/index.md"
```

结构失败先修计划；业务切片是否合理仍由 Agent 根据来源判断，机器通过不是业务批准。

### Do

只读计算当前可执行任务：

```bash
python3 "$SKILL_DIR/scripts/plan_state.py" next \
  --index "$PROJECT_ROOT/docs/plans/smart-domain/index.md"
```

从结果中选择一个任务。只加载该任务、直接前置产物和引用的 FM/API/规则/场景，避免把完整计划塞入当前上下文。开始真实实施后才把对应 `taskNotes.status` 改为 `in-progress`。

按 `taskNotes.mode` 执行：`implementation` 普通实现与回归；`tdd` 遵守当前 TDD 工序；`verify` 只定位和复跑已有行为；`design/setup/manual` 按任务说明执行。不得把计划阶段或环境失败伪装成行为 Red。

### Check

先执行任务文件中每个适用 CHECK 的精确命令，再运行项目约定的质量命令。随后重新运行 `plan_state.py verify`。命令输出、退出码及必要摘要才是执行证据；文件存在、Agent 自评或旧报告不算当前通过。

### Act

- 当前实现错误：留在同一任务的内层循环修复并重跑；
- 前置、环境或来源缺失：记录稳定 gap，将任务标记 `blocked`；
- FM/API 或业务边界变化：停止当前实施，返回 Plan，更新上游和 slicing 后重编译；
- 全部完成条件及检查满足：记录 `observedEvidence`，再把任务标记 `done`；
- 当前任务结束后停止。下一任务需要新的明确继续动作，不自动推进。

## 单任务内层操控循环

### Guides

读取 taskKey、来源、规则、场景、局部设计、依赖用法、文件范围、检查与完成条件。确认所有前置任务为 `done`，且证据仍对应当前来源。

### Action

只交付当前任务拥有的工作单元。跨模块通过计划中的公开契约协作，不重做共享基础，不顺带扩大接口、数据库或远程协议范围。

### Sensors

优先使用可重复的计算型反馈：编译、测试、静态分析、HTTP/SQL/事务和架构检查。语义反馈由 Agent 对照 FM 判断：实现是否忠于业务规则、切片是否仍内聚、断言是否证明预期结果。

### Steer

代码问题在当前任务修复；任务设计问题修订任务详情；切片或依赖问题回到外层 Plan；业务来源问题交回 FM 澄清。每次调整后重跑受影响检查，不用削弱场景或删除失败测试取得通过。

## 状态纪律

- `compiled` 是计算投影；只由当前输入重新编译得到。
- `taskNotes` 是任务状态唯一位置；任务详情不复制状态或依赖图。
- `observedEvidence` 只记录真实观察；计划生成时保持为空。
- 失败和未知保留在 `gaps`，只阻塞受影响任务。
- `plan_state.py` 只读，不替 Agent 修改状态；状态写入必须是本轮获授权工作的直接结果。

完成本轮任务后报告实际改动、执行命令、结果、剩余缺口和下一批可执行任务，然后停止。
