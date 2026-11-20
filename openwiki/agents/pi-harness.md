---
type: architecture
title: Pi 建模 Agent 与受控工具
description: 桌面如何加载共享 Pi 配置、隔离项目会话、投影流式事件，并用主进程事务提交画布补丁。
tags: [agent, pi-sdk, session, tools, prompts, desktop]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-20T12:30:09.424Z
sources:
  - id: openwiki-source-f85ce0e3a462797434d822a8
    resource: repo://apps/desktop/src/main/agentIpcHandlers.ts
  - id: openwiki-source-fe198b09c0b1eeb6a6ebe4d9
    resource: repo://apps/desktop/src/main/agentRuntime.spec.ts
  - id: openwiki-source-55138c775f581f8c989ca7dc
    resource: repo://apps/desktop/src/main/agentRuntime.ts
  - id: openwiki-source-db59d33fa24fde2a30d85df7
    resource: repo://apps/desktop/src/main/ai/aiConfigIpc.ts
  - id: openwiki-source-bac6e4737fa193d3a8a82a82
    resource: repo://apps/desktop/src/main/ai/aiConfigService.ts
  - id: openwiki-source-75fef9367be5e52e08590eac
    resource: repo://apps/desktop/src/main/ingestionModelReader.spec.ts
  - id: openwiki-source-1c1b4203dc4b1050778717b6
    resource: repo://apps/desktop/src/main/ingestionModelReader.ts
  - id: openwiki-source-5d33672c45ec58cd29dce507
    resource: repo://apps/desktop/src/main/main.ts
  - id: openwiki-source-9459ee1a8fc917f2d94619ce
    resource: repo://apps/desktop/src/renderer/screens/EditorScreen.tsx
  - id: openwiki-source-120084d825f111cc158d4202
    resource: repo://libs/desktop/feature-agent/src/state/useAgentSession.ts
  - id: openwiki-source-0c662531e68a2db936eccc7f
    resource: repo://libs/desktop/feature-agent/src/state/usePatchReview.ts
  - id: openwiki-source-9d54a30ae7fe8603951dd3dd
    resource: repo://libs/evidence-agent/src/browser.ts
  - id: openwiki-source-1c67fed1db077d0e39bb80ad
    resource: repo://libs/evidence-agent/src/index.ts
  - id: openwiki-source-d916b31bf94d895d48e443c4
    resource: repo://libs/evidence-agent/src/session/evidenceAgentSession.spec.ts
  - id: openwiki-source-a905a355f408774f2cb0edc5
    resource: repo://libs/evidence-agent/src/session/evidenceAgentSession.ts
  - id: openwiki-source-cdc6f461741d851702ef8581
    resource: repo://libs/evidence-agent/src/session/streamEvents.ts
  - id: openwiki-source-6af8fc5a6e80831b1dfa13b9
    resource: repo://libs/evidence-agent/src/tools/evidenceTools.spec.ts
  - id: openwiki-source-418388028b19fdeb893f56a8
    resource: repo://libs/evidence-agent/src/tools/evidenceTools.ts
  - id: openwiki-source-f3dd6cff8734842de5630223
    resource: repo://libs/evidence-tools/src/index.ts
generated: { by: "pi", at: "2026-11-20T12:30:09.424Z" }
---

# Pi 建模 Agent 与受控工具

`@evidence-poc/evidence-agent` 提供建模会话、提示词、工具和传感器；Node 入口加载运行时，`./browser` 供 renderer 使用，不引入 Node 会话。桌面只给 Pi 一个应用 extension factory。

## Pi 会话和配置

`openEvidenceSessionRuntime` 动态加载 Pi SDK，用原生 `SessionManager` 和 session runtime 管理历史、绑定和会话替换。桌面用规范化项目路径的 SHA-256 隔离项目 transcript，存于桌面 `userData/sessions`，而非项目或 Pi CLI 历史目录。首次提示启动 Pi；`start/prompt/steer` 共享启动 promise，失败可重试，dispose 取消订阅并等待悬而未决的启动退出。独立的 Agent runtime 在配置变更时销毁旧模型会话、保留 transcript 路径用于重开；旧模型代的结果不会再写入。

桌面使用 Pi 的 `getAgentDir()` 配置：凭据和自定义模型在 Pi 配置目录维护；桌面列出可用模型，保存默认模型与受支持的思考级别到 Pi 设置，支持重新加载配置、打开配置目录、测试连接。模型选项由主进程共享给 Agent、摄取和故事调用；renderer 不接收凭据。无可用模型时返回 `AI_NOT_CONFIGURED`。文档摄取复用会话工厂，但用临时目录和内存会话、`noTools: 'all'`；最终助理消息校准流式文本，模型错误或取消转失败，单轮 120 秒超时并清理会话。

## 指令、事件与画布入口

运行时用随包的角色、红线、算子和工作流指令替换 Pi 默认 system prompt；不加载项目和用户的 skills、扩展、提示模板、theme 或上下文文件，禁用默认内置工具。提示词测试核对工具名并防止重新引入遗留 skill 路径。

事件跨 IPC 时只有纯数据：文本与思考增量、最终助理消息、工具开始/结束、settled、错误。最终消息重整文本和未遮蔽思考；底层 `agent_end` 不代表 settled（可能重试）。Renderer 汇总文本、思考和工具状态，不引入 SDK。建模入口位于画布：全局 Storming 不继承选中节点，卡片内 Inquiry 用明确目标构造 focus，不再有独立右侧 Copilot。

## 工具与单写者补丁

- Pi 注册 15 项工具；其中九项来自 `evidence-tools`（含八项写工具与只读 What-If 模拟）。写算子读取最新文档、构造 guarded RFC 6902 补丁，再走统一宿主写入；只读与写工具在 Pi 分别标为 parallel 和 sequential。
- 通用写入口 `apply_model_patch` 解析 `{ rationale, patches }`；Zod 仍在执行时校验，成功返回 op 名称，宿主拒绝转工具错误。不接受 typed commands。
- `get_focused_node_context` 返回选区或指定凭证的数据、来源及配对；无焦点返回凭证索引。协议与蓝图工具只读；无法解析蓝图返回工具错误。
- `get_api_diff` 在副本试算 proposedPatches，`sync_api_projection` 刷新诊断但不改模型、不接受基线。`run_sensors` 文本为紧凑门禁投影，details 包含完整报告。

同一个规范化项目 root 的 Agent 写流只有一个 renderer 所有者；不同窗口不能加入。主进程校验 sender、editorId 和 revision，在最新镜像上准备并提交整批补丁；空变更不发布，真实变更推进 revision，发布事务并在 prompt 返回时附上已提交事务（即使后续失败）。不等待 renderer 确认才算提交。Renderer 按次序重放、共用人类编辑撤销历史、记录前后差异和画布 overlay。仅当当前画布仍是该补丁后的模型、且 Agent 不在运行时才可一键回退。

## 模型镜像和测试

Agent 读取优先 live 镜像，否则从磁盘加载。模型通知检查根路径和递增 revision；默认 800ms debounce，保留首个基线。传感器结果带 revision，只有仍对应当前镜像且未被更新 run 取代时才发布。销毁窗口释放 owner、会话和定时器。

`evidenceAgentSession.spec.ts` 覆盖事件投影、禁用内置工具与启动/销毁竞态；`evidenceTools.spec.ts` 覆盖只读预览、Zod 拒绝、宿主拒绝转工具错误和算子；`agentRuntime.spec.ts` 覆盖模型重载、报告竞态和无 renderer 确认的事务提交。

相关：[MCP](./mcp-integration.md) · [传感器](./sensor-orchestration.md) · [补丁审阅](../desktop/ingestion-and-patch-review.md) · [画布](../desktop/canvas-and-inspector.md)
