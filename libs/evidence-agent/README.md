# evidence-agent

进程内的 Pi Harness 底座，同时拥有桌面端建模副驾的两个切面：

1. **Agent 会话**（`session/`）——把 `@earendil-works/pi-coding-agent` 收敛成一个窄接口
   （`PiSdkPort`），把内置建模指令（`prompts/`：角色、建模红线、一轮如何推进）追加到
   Pi 的系统提示词后启动，并把 Pi 的事件流投影成桌面端可渲染的 `AgentStreamEvent`。
   会话以 `noSkills: true` 启动，不扫描工作目录寻找 `SKILL.md`。传入 `sessionFile` 时
   改为续写该份记录，分支因此能拥有自己的对话谱系。记录分叉（`forkSessionLines`）是纯
   函数，按检查点只保留祖先链并改写 `session` 头（新 `id` 与 `parentSession`）。
2. **治理与传感器**（`governance/`、`sensors/`）——治理判定循环把模型漂移收敛成一个
   决策；传感器引擎把模型核心的一致性检查、关键数据台账、API 覆盖与链路审计编排成一份
   `SensorReport`，并据此判定阶段门禁。
3. **工具注入**（`tools/`）——`createEvidenceToolsExtension` 把模型补丁、API 差异投影
   等能力注册给 Pi，Agent 因此只能在受控契约内读写模型。生产链路读取（`telemetry/`）
   把 OTLP 导出还原成 Evidence 提交记录，供漂移审计使用。

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

`PiSdkPort` 是注入点：测试用假实现断言参数与事件投影，不会真的启动 Agent。
