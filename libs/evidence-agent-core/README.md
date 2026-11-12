# evidence-agent-core

进程内的 Pi Harness 底座。桌面端只用这一层的两个能力：

1. **Pi Agent 会话**（`createEvidenceAgentSession`）——把 `@earendil-works/pi-coding-agent`
   收敛成一个窄接口（`PiSdkPort`），默认加载项目唯一技能源 `.agents/skills/`，并把 Pi 的
   事件流投影成桌面端可渲染的 `AgentStreamEvent`。传入 `sessionFile` 时改为续写该份
   记录，分支因此能拥有自己的对话谱系。
2. **记录分叉**（`forkSessionLines`）——纯函数，按检查点只保留祖先链并改写
   `session` 头（新 `id` 与 `parentSession`），被放弃的兄弟分支留在原文件里。

## 边界

- 本包不读写 `.evidence/`：模型补丁经 `evidence-modeling-orchestrator` 的工具进入
  `ModelSession`。
- 本包不实现业务校验：一致性、关键数据台账与阶段门禁由 `evidence-modeling-orchestrator`
  在进程内完成。
- 本包也不解析解释器：技能包只提供提示词与文档，没有需要启动的脚本。
- Pi SDK 通过动态 `import()` 加载，因此单元测试不需要凭据、模型或终端。

## 测试

```bash
npx vitest run --project evidence-agent-core
```

`PiSdkPort` 是注入点：测试用假实现断言参数与事件投影，不会真的启动 Agent。
