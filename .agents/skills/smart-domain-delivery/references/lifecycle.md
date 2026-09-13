# 双层循环状态协议

## 1. 两层职责

外层 PDCA 管理任务选择、依赖、进度和重规划；内层操控循环只保证当前任务执行质量。两层通过仓库文件交换状态，不依赖聊天记忆：

```text
.evidence/fm + .evidence/api
          ↓
docs/plans/smart-domain/index.md
          ↓ 当前 taskKey
docs/plans/smart-domain/tasks/<交付结果>.md
          ↓ CHECK 与 observedEvidence
index.md/taskNotes.status
```

扩展不拥有这些状态。Skill 读取并按授权维护文件，确定性脚本只观察和报告。

## 2. 外层状态转换

允许的任务状态为 `planned`、`blocked`、`in-progress`、`done`。

```text
planned ──前置完成且无局部阻塞──> in-progress
   │                                  │
   └──缺少来源/环境/前置────────────> blocked
                                      │
blocked ──缺口有依据地解决──────────> planned
                                      │
in-progress ──检查失败可局部修复────> in-progress
in-progress ──完成条件和证据满足────> done
in-progress ──发现上游变化──────────> blocked → 重新 Plan
```

不得仅因文件存在或命令曾经通过设置 `done`。依赖任务不是 `done` 时，当前任务不能进入 `in-progress` 或 `done`。

## 3. 计算型与推断型控制

### 交给程序

- taskKey、路径、依赖引用和 DAG；
- taskNotes 与任务文件一一对应；
- `taskKey`/`planRef` 绑定；
- CHECK 和 gap 标识唯一；
- blocked、空命令和 gap 的结构关联；
- done 的完成条件和真实证据非空；
- 当前可执行任务集合。

### 交给 Agent

- FM 到业务模块的映射；
- 哪种切片形成最小可验收结果；
- CHECK 是否真正证明业务结果；
- 失败属于实现、任务设计、切片还是业务来源；
- 哪些源变化使旧证据失效。

计算通过只能证明声明结构自洽，不能证明业务设计合理或测试充分。

## 4. 转向矩阵

| 观察                       | 内层动作                 | 外层动作                               |
| -------------------------- | ------------------------ | -------------------------------------- |
| 编译、测试或静态检查失败   | 在当前文件范围修复并重跑 | 不换任务                               |
| CHECK 不能证明 FM 预期     | 修订测试设计             | 保持当前 taskKey；必要时重规划任务详情 |
| 任务拥有重复或缺失工作单元 | 停止实施                 | 修订 slicing 并重新 compile            |
| FM/API 来源改变            | 停止使用旧证据           | 返回 Plan，重算投影和受影响范围        |
| 缺少业务事实               | 不猜测实现               | 记录 gap，交回 FM 澄清                 |
| 环境或命令不可用           | 记录环境阻塞             | blocked，只影响相关任务                |
| 当前任务全部通过           | 写入实际证据             | 设置 done，停止等待下一次继续          |

## 5. 恢复会话

新会话按以下最小顺序恢复：

1. 读取项目指令和 Git 差异；
2. 运行 `plan_state.py verify`；
3. 读取 `plan_state.py next` 输出；
4. 选择一个任务并读取其详情；
5. 只加载直接依赖和 sourceRefs；
6. 检查实际工作树是否与任务状态一致。

若索引不存在、compiled 为空、源摘要过期或计划结构无效，停止在 Plan，不根据聊天内容猜测下一任务。
