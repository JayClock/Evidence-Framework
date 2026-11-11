# evidence-modeling-orchestrator

操控循环的编排层：把“跑传感器 → 给反馈 → 打补丁”三件事做成 Agent 可直接调用的能力。

## 三块边界

| 模块         | 职责                                                                                                                                | 不做                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `sensors/`   | 用锁定的 Python 跑 `check_fm.py`、`audit_key_data.py`、`check_interview_trace.py`、`check_stage_gate.py`，折叠成一份 `SensorReport` | 不判断业务对错，不改模型   |
| `tools/`     | 把传感器、模型补丁、画布选中项注册为 Pi 工具                                                                                        | 不直接写 `.evidence/fm`    |
| `discovery/` | 从追溯日志推出依赖前沿（焦点、未答问题、悬空引用、结束确认）                                                                        | 不发明问题，不把未答当同意 |
| `diff/`      | 对比两份裁决：修好的、新引入的、以及阶段门禁的开关方向                                                                              | 不重跑 Python，不把未跑当通过 |

## 信号分级

沿用技能的既有说法，不另造一套：

| 信号    | 来源                                                      | 含义                                   |
| ------- | --------------------------------------------------------- | -------------------------------------- |
| `block` | `check_fm` 的 `errors`、解释器缺失、追溯引用失效          | 静态不闭合，禁止下游                   |
| `warn`  | `check_fm` 的 `gaps`、`audit_key_data` 的 `needsDecision` | 待决清单；模型可以保存，但阶段门禁关闭 |
| `info`  | 无场景、台账已闭环                                        | 只是状态说明                           |

关键数据待决不等于静态错误，所以 `passed` 仍为真；但 `isStageGateReady` 必须为假——
这正是“虚假胜利”防线：模型看起来对，也不能交给 API 设计。

## 工具契约

- `run_sensors`：返回 `SensorReport`，让模型在同一轮里看到缺口。
- `apply_model_patch`：把 `ModelCommand[]` 交给渲染层的 `ModelSession`，保证 `Cmd+Z` 可撤销；
  拒绝写盘，拒绝没有 `type` 的命令。
- `get_canvas_selection`：读取用户当前选中的对象与属性，实现“所选即所聊”。

## 测试

```bash
npx vitest run --project evidence-modeling-orchestrator
```

`PythonEnvResolver` 与 `ExtensionAPI` 都是注入点，测试里没有真实 Python、模型或终端。
