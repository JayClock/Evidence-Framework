# 文件

- [MCP 外部工具与桌面桥](mcp-integration.md) - 外部 IDE 和 CLI Agent 如何经 per-user 本地 socket 驱动已打开的桌面模型：14 个工具（9 个只读、5 个可写）、64 MiB 消息上限与双端超时、--mcp-stdio 无窗口代理、客户端注册同步，以及主进程如何把调用转成 renderer 事务和只读审计。
- [内置 Pi Agent 与工具扩展](pi-harness.md) - 桌面内置建模 Agent 的端到端说明：随包提示词与 noSkills、会话生命周期与五种事件投影、11 个工具与共享算子库、main 的 runtime transport 与传感器调度，以及 renderer 如何只读事件并把补丁交回模型事务。
- [传感器、门禁与生产漂移](sensor-orchestration.md) - 进程内传感器引擎如何一次读取模型树产出带 severity 与 source 的结构化报告、version 6 阶段门禁为何不能被草稿或旧报告打开、live revision 与 debounce 如何挡住过期结论，以及生产漂移与治理决策的只读边界。
