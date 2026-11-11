# evidence-agent-core

进程内的 Pi Harness 底座。桌面端只用这一层的两个能力：

1. **锁定的 Python 解释器**（`createPythonEnvResolver`）——按 `.python-version` /
   `ENVIRONMENT.md` 的约定定位 `node_modules/.cache/evidence-fm-runtime`，从不回退到
   裸 `python3`。环境缺失时返回 `driftReport` 而不是降级运行。
2. **Pi Agent 会话**（`createEvidenceAgentSession`）——把 `@earendil-works/pi-coding-agent`
   收敛成一个窄接口（`PiSdkPort`），默认加载项目唯一技能源 `.agents/skills/`，并把 Pi 的
   事件流投影成桌面端可渲染的 `AgentStreamEvent`。

## 边界

- 本包不读写 `.evidence/`：模型补丁经 `evidence-modeling-orchestrator` 的工具进入
  `ModelSession`。
- 本包不实现业务校验：一致性、关键数据台账与阶段门禁由 `evidence-modeling-orchestrator`
  调用 Python 脚本完成。
- Pi SDK 通过动态 `import()` 加载，因此单元测试不需要凭据、模型或终端。

## 测试

```bash
npx vitest run --project evidence-agent-core
```

`PiSdkPort` 与 `ProcessRunner` 都是注入点：测试用假实现断言参数、环境变量与事件投影，
不会真的启动 Agent 或 Python。
