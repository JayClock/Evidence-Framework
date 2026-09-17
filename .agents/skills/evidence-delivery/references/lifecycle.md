# 双层循环状态协议

## 1. 两层职责

外层 PDCA 管理任务选择、依赖、进度和重规划；内层操控循环只保证当前任务执行质量。两层通过唯一机器计划交换状态：

```text
项目宪法 → Guides 导航 → 项目基线与工程指南
          ↓
软件范围 + .evidence/fm + .evidence/api
          ↓
docs/plans/smart-domain/plan.yaml
          ├─ compiled.tasks / executionOrder：计算 DAG
          └─ tasks[taskKey]：Guides、设计、状态、CHECK、证据
          ↓
docs/plans/smart-domain/review.html：只读审核投影
```

扩展和审核页不拥有状态。确定性脚本只观察、编译或投影；任务前馈未就绪时不得从结构候选直接进入 Action。

## 2. 外层状态转换

允许状态为 `planned`、`blocked`、`in-progress`、`done`。

```text
planned ──前置完成且无局部阻塞──> in-progress
   │                                  │
   └──缺少来源/环境/前置────────────> blocked
                                      │
blocked ──缺口有依据地解决──────────> planned
                                      │
in-progress ──检查失败可局部修复────> in-progress
in-progress ──具体验收数据和证据满足────> done
in-progress ──发现上游变化──────────> blocked → 重新 Plan
```

不得因文件存在、审核页显示或命令曾经通过设置 `done`。依赖任务不是 `done` 时，当前任务不能进入 `in-progress` 或 `done`。

## 3. 计算型与推断型控制

### 交给程序

- taskKey、依赖引用、DAG 和 API 覆盖；
- `compiled.tasks` 与 `tasks` 一一对应；
- CHECK 和 gap 标识唯一；
- blocked、空命令和 gap 的结构关联；
- done 的 `acceptanceCriteria` 均为引用本任务 CHECK 的结构化断言，且真实证据非空；
- 当前可执行任务集合；
- 从同一 `plan.yaml` 重建离线审核页。

### 交给 Agent

- FM 到业务模块的映射；
- 哪种切片形成最小可验收结果；
- CHECK 是否真正证明业务结果；
- 失败属于实现、任务设计、切片还是业务来源；
- 当前任务的授权、来源、设计、环境和 CHECK 是否足够开工；
- 哪些业务源、架构、规范、howto、代码或环境变化使旧证据失效。

计算通过只证明声明结构自洽，不能证明业务设计合理、测试充分或业务批准。

## 4. 转向矩阵

| 观察                       | 内层动作                      | 外层动作                                |
| -------------------------- | ----------------------------- | --------------------------------------- |
| 编译、测试或静态检查失败   | 在当前文件范围修复并重跑      | 不换任务                                |
| CHECK 不能证明 FM 预期     | 修订测试设计                  | 保持 taskKey；必要时修订同一任务记录    |
| 任务拥有重复或缺失工作单元 | 停止实施                      | 修订 slicing 并重新 compile             |
| FM/API 来源改变            | 停止使用旧证据                | 返回 Plan，重算投影和影响范围           |
| 缺少业务事实               | 不猜测实现                    | 记录 gap，交回 FM 澄清                  |
| 必要前馈不足或相互冲突     | 不进入 Action，定位来源拥有者 | 修订局部设计/关联 gap；不建私有前馈状态 |
| 环境或命令不可用           | 记录环境阻塞                  | blocked，只影响相关任务                 |
| 当前任务全部通过           | 写入实际证据                  | 设置 done，重建审核页，然后停止         |

## 5. 恢复会话

1. 读取项目宪法、Guides 导航和 Git 差异，确认模式与授权；
2. 核对 FM/API 与计划输入，必要时返回 Plan 重编译；
3. 运行 `plan_state.py verify`，再读取 `next` 的结构候选；
4. 选择一个 taskKey，只读取其任务记录、直接前置，并加载 `sourceRefs` 与 `procedureRefs` 指向的真实来源；
5. 检查授权/目标、来源/审核、前置新鲜度、设计边界、环境及验证/退出；架构/指南/代码/环境变化须评估重验；
6. 确认工作树与状态一致，通过后才开始任务。

若 `plan.yaml` 不存在、compiled 为空、源摘要过期或结构无效，停止在 Plan，不根据聊天或 `review.html` 猜测下一任务。
