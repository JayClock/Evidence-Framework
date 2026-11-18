---
type: architecture
title: Pi 建模 Agent 与受控工具
description: 桌面内置 Pi 会话的 SDK 适配、代码随包提示词、Zod 工具、实时补丁和传感器反馈，以及会话与窗口的生命周期。
tags: [agent, pi-sdk, session, tools, prompts, desktop]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-18T12:34:41.390Z
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
  - id: openwiki-source-9459ee1a8fc917f2d94619ce
    resource: repo://apps/desktop/src/renderer/screens/EditorScreen.tsx
  - id: openwiki-source-39112fa2dcba304148e956e8
    resource: repo://libs/desktop/feature-agent/src/components/agent/AgentCopilot.tsx
  - id: openwiki-source-ae2af3e0409175806d2572fb
    resource: repo://libs/desktop/feature-agent/src/components/agent/InlinePatchCopilot.tsx
  - id: openwiki-source-8a3964422b76faf8b78c4915
    resource: repo://libs/desktop/feature-agent/src/state/useAgentPatchBridge.ts
  - id: openwiki-source-120084d825f111cc158d4202
    resource: repo://libs/desktop/feature-agent/src/state/useAgentSession.ts
  - id: openwiki-source-0c662531e68a2db936eccc7f
    resource: repo://libs/desktop/feature-agent/src/state/usePatchReview.ts
  - id: openwiki-source-9d54a30ae7fe8603951dd3dd
    resource: repo://libs/evidence-agent/src/browser.ts
  - id: openwiki-source-1c67fed1db077d0e39bb80ad
    resource: repo://libs/evidence-agent/src/index.ts
  - id: openwiki-source-be4ecf29feda5ec973d60afb
    resource: repo://libs/evidence-agent/src/prompts/index.ts
  - id: openwiki-source-c24d79f7e7415c37828b5d3c
    resource: repo://libs/evidence-agent/src/prompts/prompts.spec.ts
  - id: openwiki-source-d916b31bf94d895d48e443c4
    resource: repo://libs/evidence-agent/src/session/evidenceAgentSession.spec.ts
  - id: openwiki-source-a905a355f408774f2cb0edc5
    resource: repo://libs/evidence-agent/src/session/evidenceAgentSession.ts
  - id: openwiki-source-21e429ef3ad2c80275000765
    resource: repo://libs/evidence-agent/src/session/sessionFork.spec.ts
  - id: openwiki-source-5e54ccdb55500cd5f0abd4a7
    resource: repo://libs/evidence-agent/src/session/sessionFork.ts
  - id: openwiki-source-cdc6f461741d851702ef8581
    resource: repo://libs/evidence-agent/src/session/streamEvents.ts
  - id: openwiki-source-6af8fc5a6e80831b1dfa13b9
    resource: repo://libs/evidence-agent/src/tools/evidenceTools.spec.ts
  - id: openwiki-source-418388028b19fdeb893f56a8
    resource: repo://libs/evidence-agent/src/tools/evidenceTools.ts
  - id: openwiki-source-61df2059d9e39c9d1980ffbf
    resource: repo://libs/evidence-agent/src/tools/registerZodTool.ts
  - id: openwiki-source-4c008c3497d98e90590e5286
    resource: repo://libs/evidence-tools/README.md
generated: { by: "pi", at: "2026-11-18T12:34:41.390Z" }
---

# Pi 建模 Agent 与受控工具

`@evidence-poc/evidence-agent` 合并会话、提示词、工具和传感器；`.` 是 Node 入口，`./browser` 避免 renderer 引入会话运行时。旧 agent-core/modeling-orchestrator 包名不再是实现位置。

## 会话边界与生命周期

`session/evidenceAgentSession.ts` 把 SDK 收窄为可注入 `PiSdkPort`，动态导入真实 SDK，测试不需凭据或真实模型。会话按需启动并 single-flight；失败清除 starting promise 允许重试；prompt/steer 等待启动，abort 在未启动时为空操作，dispose 取消订阅并释放会话和监听器。SDK steer 的 handled/queued 结果保留；桌面 runtime 对尚未开始的访谈 steer 则明确拒绝。

资源加载器设置 `noSkills: true`，以 appendSystemPromptOverride 追加随包指令，不扫描项目 skill 树。customTools、tools、noTools、sessionDirectory 和 sessionFile 按需传给 SDK；sessionFile 打开既有 transcript，否则创建会话，getSessionFile 在启动前为空。桌面接受 sessionFile 但当前 IPC 不传它。注意桌面 `customTools: []` **不是沙箱**：未禁用 Pi 默认工具，禁止直接写模型还依赖指令与受审查的补丁通道。

摄取 reader 复用工厂，在临时目录做 tool-less 单轮（noTools: all），拼接流式输出，120 秒超时，agent-error 转失败，finally 释放会话，避免项目尚不存在时写出模型。

## 桌面 AI 配置

Agent 和摄取 reader 共用主进程 AiConfigService 的 getModelOptions，显式传入 modelRuntime/model/thinkingLevel/agentDir；启动时不自动读取 CLI 凭证。配置位于 userData，模型设置与加密凭证分开，只有显式导入才读取本机 Pi CLI auth。支持厂商预设和自定义 OpenAI 兼容端点；测试连接有超时，配置变更会使旧 Agent session 失效后重新创建。

## 指令、事件与界面

`EVIDENCE_INSTRUCTIONS` 由角色、红线、算子、工作流组成普通 TS 字符串。提示词测试防止引用不存在的工具或遗留 skill 路径；桌面只传一个 extension factory，不覆盖 modeling instructions。

Pi 事件投影成五种纯数据：text-delta、tool-call-started、tool-call-completed、agent-settled、agent-error，其余丢弃。renderer `useAgentSession` 汇总最多末尾 8000 字符文本、工具运行状态、错误；运行中 submit 变成 steer。AgentCopilot 与 InlinePatchCopilot 共用控制器，⌘/Ctrl+Enter 发送、Escape 停止；前者附 workshop step，后者附选中对象。选区由 editor 单独发布，不存入会话私有状态。

## 十一个工具与 Zod 权威

`tools/evidenceTools.ts` 的 `EvidenceToolsHandlers` 隔离 Electron/文件系统：runSensors、applyModelPatch、getCanvasContext、loadDocument、可选 baseline/refreshApi 和 modelRoot 由 runtime 注入。

- 只读 API 工具：`get_api_diff` 在副本应用可选 **proposedPatches** 后比较，绝不提交；`sync_api_projection` 刷新传感器诊断，不写盘、不接受新基线。
- `run_sensors` 返回 passed、isStageGateReady、blockCount、warnCount、decisionOwed、issues 的紧凑文本，完整 SensorReport 放 details。
- `get_canvas_selection` 读取当前画布上下文。
- `annotate_contract_clauses` 将协议分成业务、领域、法务；`read_service_blueprint` 从表格解析草稿。两者不写模型，蓝图读不出返回 isError 而不是空草稿。
- `apply_model_patch` 接收共享 `ModelPatchRequestSchema` 的 `{ rationale, patches }`，不再接受 typed commands。成功文本列 op；renderer 拒绝转 isError，便于下一轮修正。
- 四个算子：introduce_fulfillment_pair、add_breach_compensation、roleify_and_invert_dependency、isolate_domain_calculator。它们与 apply_model_patch 一起复用 evidence-tools registry 的 schema、描述、非幂等写注解与执行路径；每次重新 loadDocument，用 guarded recipe 生成标准补丁，再共用宿主 handler；引用不合法则给出“算子未执行”，不发送部分修改。

`registerZodTool.ts` 只把 Zod 转为无引用 JSON Schema 给 Pi 1.5.2 ABI，执行时仍 `schema.parse(input)`。无法表达在 JSON Schema 的 refinement 不会丢失；TypeBox 仅兼容类型标记，没有 TypeBox runtime。

## 补丁往返和审查

工具 → runtime transport.requestPatch → 主进程分配 UUID/15 秒 timer → renderer `useAgentPatchBridge`。窗口已销毁即时失败；超时返回失败，不悬挂。renderer 再解析共享 schema，一次 `applyPatchBatch(..., agent:<rationale>)` 原子提交，返回 op 名称；失败带错误，成功且真正变更时才通知 before/after 审查。每批共用人类编辑的撤销历史，校验配置由 ModelSession 决定，不把写成功等同门禁通过。

`usePatchReview` 记录差异与 canvas overlay；只有屏幕仍是该批修改后的模型时允许一键撤销，避免撤销后续工作。详见[补丁审查](../desktop/ingestion-and-patch-review.md)。

## Runtime 所有权与模型镜像

主进程按 project root single-flight 创建 runtime，第二窗口共享原会话；事件和报告只送创建它的 WebContents，销毁窗口时 dispose。模型读取优先 renderer 已发布镜像，否则磁盘；不同 root 或非递增 revision 被拒绝/忽略，首次 baseline 跨修订保留。默认 800ms debounce 聚合编辑，报告带 revision；run sequence 与当前 revision 双检查防止慢旧结果覆盖新结果。dispose 清镜像、timer、会话并使晚到报告失效。

`sessionFork` 对 JSONL transcript 的 id/parentId 祖先链做纯复制，重写 session id、timestamp、parentSession，报告叶节点和丢弃分支数；无 fork 点保留全 transcript。MISSING_HEADER、INVALID_LINE、ENTRY_NOT_FOUND 明确拒绝，循环链终止且不修改源数据。

## 验证入口

会话/fork specs 覆盖 lazy single-flight、恢复、失败重试、事件和谱系；tools/registerZodTool specs 覆盖 refinement、恶意/缺失参数、11 工具、只读预览与算子拒绝。agentRuntime 和 useAgentPatchBridge specs 分别覆盖报告竞态和真实补丁反馈/撤销。测试 seam 使用假 SDK，不要求真实模型调用。

相关：[MCP](./mcp-integration.md) · [传感器](./sensor-orchestration.md) · [模型会话](../model/commands-and-session.md)
