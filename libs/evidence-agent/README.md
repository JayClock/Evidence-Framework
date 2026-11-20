# evidence-agent

进程内的 Pi Harness 底座，提供桌面端建模副驾的会话、传感器和工具：

1. **Agent 会话**（`session/`）——由 Pi 的 `AgentSessionRuntime` 和 `SessionManager` 管理会话、恢复与分叉。宿主显式提供建模指令与工具，不加载工作目录里的扩展、技能、模板或上下文文件。Pi 事件投影为桌面端可渲染的 `AgentStreamEvent`，SDK 替换会话后重新绑定订阅。
2. **传感器**（`sensors/`）——把模型一致性检查、关键数据台账和 API 诊断
   汇总到 `SensorReport`，并据此判定阶段门禁。
3. **工具注入**（`tools/`）——`createEvidenceToolsExtension` 把模型补丁、API 差异投影
   等能力注册给 Pi，Agent 因此只能在受控契约内读写模型。

## 边界

- 本包不直接读写 `.evidence/` 目录：模型补丁经 `tools/` 构造后进入 `ModelSession`，
  目录读取由 `sensors/native/modelSources.ts` 统一负责。
- 本包不实现领域校验：一致性、关键数据台账与阶段门禁的实际计算由
  `evidence-model-core` / `evidence-api` 完成，本包只做编排与判定。
- 本包也不解析解释器：技能包只提供提示词与文档，没有需要启动的脚本。
- Pi SDK 通过动态 `import()` 加载，因此单元测试不需要凭据、模型或终端。

## 导出入口

- `.`：进程入口（Electron 主进程、测试、CLI），包含会话、工具、传感器全量导出。
- `./browser`：渲染器安全入口，只导出纯数据契约（`SensorReport`、`SensorIssue`、
  `AgentStreamEvent` 等），避免把 Node 侧模块带进 Vite 的浏览器构建。

## 测试

```bash
npx vitest run --project evidence-agent
```

会话测试使用真实 SDK 的内存会话，不发送模型请求。
