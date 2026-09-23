---
name: evidence-delivery
description: 按 plan.yaml 恢复交付、选择一个就绪任务、执行并记录真实证据；也用于只读检查计划与下一任务。实现采用小步测试循环，故障先复现，交付分别审查规范与需求；缺口转交对应拥有者，不改 FM/API、不自动审批或提交。
compatibility: Python 3.10+、PyYAML；消费 evidence-task-planning 生成的 schemaVersion 3.0 plan.yaml。
---

# Evidence 单任务交付

外层 PDCA 管任务，内层 Guides → Action → Sensors → Steer 管当前任务的执行质量。状态只属于 `plan.yaml`，审核页是投影，扩展只负责交互。每次只执行一个获授权且就绪的任务，完成后停止。

## 1. 确认本次入口

读取项目指令、Guides 导航、用户目标和 Git 差异，确定本次是只读查看还是实施。只读请求不写计划、状态或产品文件；保留已有无关改动。

定位 `docs/plans/smart-domain/plan.yaml` 或项目指定位置，以及可发现的 planning Skill 实际目录。读取其 `references/guides.md`，按项目开工检查加载必要来源；不假定独立安装后的兄弟路径。业务来自 FM、接口来自 API、软件职责来自需求、实现方法来自工程指南。

计划缺失、输入变化或切片需要调整时，转交 `evidence-task-planning`。更新计划需要本次授权；只读查看只报告差异。FM/API 缺口交对应拥有者，不为交付通过修改上游。

**退出条件**：授权、计划位置和输入版本可定位；否则停在 Plan 并说明缺口。

## 2. 选择一个结构候选

```bash
python3 "$SKILL_DIR/scripts/plan_state.py" verify --plan "$PLAN_PATH"
python3 "$SKILL_DIR/scripts/plan_state.py" next --plan "$PLAN_PATH"
```

`SKILL_DIR` 是本包实际绝对路径，`PLAN_PATH` 是计划绝对路径。verify 失败不执行 next；`next` 只判断结构候选。没有候选时报告阻塞，不以聊天、旧报告或 `review.html` 猜测进度。

选择一个 taskKey，读取它的任务记录、直接前置及所引来源。状态转换、恢复与知识归位读取[生命周期协议](references/lifecycle.md)。

## 3. 执行当前任务

### Guides

按项目开工检查和 planning 的前馈协议核对授权、来源与审核、设计、环境和 CHECK。读取 `procedureRefs` 指向的实际做法，确认直接前置为 done 且证据仍有效；FM/API 摘要不覆盖工程指南、代码和环境变化。

**退出条件**：每项必要依据和验收检查都能定位，已有决定适用于本次任务。未满足时不进入 Action，按授权关联局部 gap，不新增状态文件。真实实施开始后才设置 in-progress。

### Action

按任务 mode 加载一个执行分支：

| mode / 情况             | 读取与动作                                                | 退出条件                           |
| ----------------------- | --------------------------------------------------------- | ---------------------------------- |
| implementation          | [小步实现](references/implementation.md)                  | 当前行为及适用反例有测试证据       |
| verify                  | 读取任务 CHECK，定位已有实现并原样复跑                    | 实际结果及证据限制已记录           |
| design / setup / manual | 按任务 steps 与 CHECK 执行                                | 任务声明的可观察产物及人工结果齐备 |
| 故障、回归或性能异常    | 先读[故障诊断](references/diagnosis.md)，再决定修复或转向 | 原始症状已复验，或明确阻塞         |

只交付当前工作单元。跨模块消费公开契约，复用已有基础；任务外发现交接，不顺手实施。

### Sensors

运行本任务全部适用 CHECK 和项目质量命令。保留命令、cwd、退出码、输出定位及缓存/环境限制；再按[双维度审查](references/review.md)分别给出 Standards 与 Spec 结论。测试成功不替代语义审查，审查意见不替代测试。

**退出条件**：每条 acceptanceCriteria 都有本轮 CHECK 结果支持，两个审查维度各有结论，未验证项明确可见。

### Steer

按生命周期协议的转向矩阵处理：实现错误留在本任务修复，设计问题修订任务，单元/依赖变化返回 Plan，业务未知交来源拥有者，环境不可用只阻塞受影响任务。纠偏后重新装配 Guides 并复验。

## 4. 记录并停止

按[知识交接协议](references/lifecycle.md#5-知识交接与归位)清点新增用户反馈、执行发现与决定，按实际授权归位；未保存内容明确标为未保存。

只有 CHECK、项目质量检查与两个审查维度均满足要求，才先写 `tasks[taskKey].observedEvidence`，再设置同一任务的 `status: done`。结构通过不表示业务批准。状态唯一位置是 `tasks[taskKey].status`，依赖只读 `compiled.tasks[*].dependsOn`。

写入计划后运行 verify，并通过 planning 的 render_plan.py 重建 `review.html`；失败如实报告，不手改投影或伪造证据。报告改动、实际检查、Standards / Spec、局部缺口、知识保存结果和下一候选，然后停止，不自动执行下一任务、审批或操作 Git 历史。
