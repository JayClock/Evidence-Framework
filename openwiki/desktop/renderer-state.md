---
type: architecture
title: 渲染会话、异步布局与实时同步
description: 一个编辑窗口如何保持单一 ModelSession、异步 ELK 几何、递增实时 revision、跨面板定位，以及 Agent/MCP/交付/传感器的竞态隔离。
tags: [desktop, renderer, state, model-session, ipc, mcp, react]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-17T06:43:02.055Z
sources:
  - id: openwiki-source-55138c775f581f8c989ca7dc
    resource: repo://apps/desktop/src/main/agentRuntime.ts
  - id: openwiki-source-76f615743ac07abb0f83475e
    resource: repo://apps/desktop/src/main/mcpBridgeRuntime.ts
  - id: openwiki-source-75ea16b51af8189bcb64a227
    resource: repo://apps/desktop/src/renderer/components/ledger/DomainLedgerTable.tsx
  - id: openwiki-source-90c693a21769f2a2cd3f866e
    resource: repo://apps/desktop/src/renderer/components/split/CelRulesPane.tsx
  - id: openwiki-source-bedc9eb4fc31e9c041a560ab
    resource: repo://apps/desktop/src/renderer/components/split/OpenApiSpecViewer.tsx
  - id: openwiki-source-9459ee1a8fc917f2d94619ce
    resource: repo://apps/desktop/src/renderer/screens/EditorScreen.tsx
  - id: openwiki-source-febf1dc4c40bace9f81ae6c9
    resource: repo://apps/desktop/src/renderer/state/commandRegistry.ts
  - id: openwiki-source-691a65e70d0a88e8032e0166
    resource: repo://apps/desktop/src/renderer/state/mcpCapture.ts
  - id: openwiki-source-e8c506a8d05cddb8e6415b6b
    resource: repo://apps/desktop/src/renderer/state/useBilateralSync.spec.tsx
  - id: openwiki-source-64e02f46b7978332dd710c41
    resource: repo://apps/desktop/src/renderer/state/useBilateralSync.ts
  - id: openwiki-source-d4fc84c37b0edfd16ffd121b
    resource: repo://apps/desktop/src/renderer/state/useCommandRegistry.ts
  - id: openwiki-source-f0f06a0981a7ca97c510b44d
    resource: repo://apps/desktop/src/renderer/state/useEditorSession.ts
  - id: openwiki-source-50f41d92dd610018f85692d8
    resource: repo://apps/desktop/src/renderer/state/useGraphLayout.ts
  - id: openwiki-source-87e5669496e1e215691f3e0c
    resource: repo://apps/desktop/src/renderer/state/useLiveModelBridge.ts
  - id: openwiki-source-034a304691f6c1f77f682d25
    resource: repo://apps/desktop/src/renderer/state/useMcpBridge.ts
  - id: openwiki-source-694f14a9d64dcf9f23bb8a3b
    resource: repo://apps/desktop/src/renderer/state/useSensorsState.ts
  - id: openwiki-source-07d3a3a523a823055d2c6b41
    resource: repo://apps/desktop/src/renderer/state/useWorkspaceLayoutState.spec.ts
  - id: openwiki-source-5c9b3359cf58a8175a7e8c84
    resource: repo://apps/desktop/src/renderer/state/useWorkspaceLayoutState.ts
  - id: openwiki-source-060e6f7bbae79b74b7b3ae16
    resource: repo://apps/desktop/src/renderer/state/useWorkspaceSplitState.spec.ts
  - id: openwiki-source-c0750187b8b81a71c6768dd8
    resource: repo://apps/desktop/src/renderer/state/useWorkspaceSplitState.ts
  - id: openwiki-source-4390945ee74c598cb51e8f18
    resource: repo://apps/desktop/src/renderer/state/useWorkspaceViewMode.spec.tsx
  - id: openwiki-source-cd0c9b3dd84e3af20289b703
    resource: repo://apps/desktop/src/renderer/state/useWorkspaceViewMode.ts
  - id: openwiki-source-55662d405492cfd3a6e7e1bd
    resource: repo://libs/desktop/contracts/src/delivery.ts
  - id: openwiki-source-8a3964422b76faf8b78c4915
    resource: repo://libs/desktop/feature-agent/src/state/useAgentPatchBridge.ts
  - id: openwiki-source-120084d825f111cc158d4202
    resource: repo://libs/desktop/feature-agent/src/state/useAgentSession.ts
  - id: openwiki-source-0c662531e68a2db936eccc7f
    resource: repo://libs/desktop/feature-agent/src/state/usePatchReview.ts
  - id: openwiki-source-effa8775635d4ee2d4bfa795
    resource: repo://libs/desktop/feature-delivery/src/state/useDeliveryHub.spec.tsx
  - id: openwiki-source-32df59b611c02b85d275991a
    resource: repo://libs/desktop/feature-delivery/src/state/useDeliveryHub.ts
  - id: openwiki-source-245f4a200cbde2a0d89ec4b6
    resource: repo://libs/desktop/feature-story/src/state/useStoryPlayback.ts
  - id: openwiki-source-29536c90f762c67d4e41b9c9
    resource: repo://libs/desktop/testing/src/desktopApi.ts
generated: { by: "codex", at: "2026-11-17T06:43:02.055Z" }
---

# 渲染会话、异步布局与实时同步

EditorWorkspace 组合 controllers 而非复制模型：useEditorSession 持会话；focus/view/layout hooks 持意图与 chrome；bridges 发布实时模型、接受补丁和消费主进程结果。useEditorShortcuts 不持业务状态，只绑定同一 handler table。

## 单会话与异步几何

useEditorSession 在 ref 创建一份 ModelSession，layout effect 在 paint 前订阅所有 session 事件，避免首个 Agent/MCP 写入漏更新。readState 同步读取 document/graph/selection/history/validation；**布局不在 readState 同步重建**，交 useGraphLayout(graph,viewMode,layoutMode) 等待 topology ELK 或业务 swimlane。

useGraphLayout 为每次 effect 建 cancellation 标记，只有未清理的请求能发布结果；result 的 graph 引用、viewMode 与 layoutMode 还须等于当前输入。新图/密度立即返回 EMPTY_LAYOUT、layoutPending=true，而不是绘制旧模型几何；失败返回空布局和 layoutError。迟到旧成功/失败均不能污染新结果，unmount 使回调失效。

任何 document-changed 置 dirty，selection/history 也刷新快照但不凭空编辑。save 读取当前 session document 发 projects.save，失败保留 dirty 并显 saveError，成功记录 savedAt，且保存期间没有新编辑才清 dirty；reload 显式 projects.open 并 replaceDocument(resetHistory=true)，清错误/外部提示。磁盘 watcher 先标 externalChangeAt。显式 reload 可替换文档；story invalidation 的 reloadFromDiskIfClean 只有读前读后都无编辑才自动更新，相等内容不重置历史，避免自身保存通知抹掉 undo。

所有 Inspector、键盘、Agent、MCP 编辑使用 mutate/applyPatchBatch，共享历史；baseline 是 initialDocument，保存不接受变更、不重置 baseline。

## 双向定位 bus

BilateralSyncBus 每窗口一个，发 focus-entity（entityId/attributeName）或 focus-rule（ruleId/entityId），附 source 和递增 token。不存当前值、不 replay，迟挂载读不到过去意图；fan-out 用 listener 副本，处理中 unsubscribe 不跳过其他人。caller 不造 token。

ledger 忽略 table、code panes 忽略 code、shell 忽略 canvas，防反馈环；shell 从任意 selection 变化公告 canvas 事件，返回方向集中校验对象存在、解除会隐藏它的 scope、selectAttribute 并发 pan token。相同对象重复定位仍有新 token；ledger flash 和 editor reveal 依它重触发。切 CEL rule 可改已开分屏，不凭一个焦点事件强开关闭的分屏。hook handler 需 useCallback 避免重复订阅。

## 实时发布先于补丁答复

useLiveModelBridge mount 发布一次，每 document-changed（非 selection）递增 revision，发送 rootPath/document/baseDocument。session emit 同步执行：applyPatchBatch 内已通知 live bridge，返回后 Agent respondPatch，因此下一 tool read 看到刚编辑的镜像而非上次 React render。最新发送失败显示 alert，旧 revision 晚到失败不覆盖新状态。

main agentRuntime 接受同 root 且更高 revision 的 mirror，工具/传感器优先读它；新 revision 清 latestReport 并重启 debounce，first baseline 保留。sensor run 以 sequence+captured live snapshot 防过期发布，报告带 documentRevision；editor 在 report missing/loading/error、live bridge error 或 revision 不等时不给 canvas diagnostics。

live bridge revision、editor 的 MCP revisionRef、delivery generation 各守自己的消费者，不把三个数字当全局一致事务时钟。

## Agent、MCP 与 review

Agent patch bridge layout effect 接收请求，snapshot before → 共享 Zod 解析 → 一次 applyPatchBatch(agent:rationale) → respond op names → 真变更才 onApplied。失败不改文档、不建 review；no-op/test-only 不产生虚假修改。usePatchReview 用引用判断 after 是否仍在屏，最新才 undo，一旦后续编辑发生只关闭 review，accept 永不再写模型。

MCP 常驻 onRequest 订阅，但每次请求**直接从 session 取 document/graph**，不是只信 render 更新的 ref；layout-effect session 订阅同步递增 revision，prop 只以 max 对齐，同一 React commit 前连续补丁仍正确。支持 state/model/selection/captureRect/patch，未知方法 INTERNAL_ERROR，无选区 NO_SELECTION。

MCP RFC 6902 batch 以 mcp:rationale 一步历史，失败保持 revision；成功仅真实变更增加 revision，之后 validate 诊断是 block 但默认不自动回滚。截图 renderer 只计算 viewport/stage/target 交集、整数像素和 inset=0，无布局返回 null；main capturePage 前后 finally 切 capture-mode。

## 交付、传感器与对话结果

useDeliveryHub 在整个 editor 生命周期订阅，150ms debounce；新 change 立即使旧 generation 失效，包括下一请求尚在 debounce 时。主进程 reply revision 须匹配，失败清 analysis/error/stale；accepted input+analysis 才能 export，携 expectedModelDigest，busy/stale/block 时不写。打开 hub 不重新定义 baseline 或另订阅模型。

useSensorsState 先 latestReport，只有空才触发 fresh，push 按 root 过滤；refresh 绕 debounce。useAgentSession 折叠五事件，transcript 最末8000字符，toolCallId 状态表，运行中 submit=steer、finally 清 running，root 变化重置。story playback 按启用状态接收 debounced 快照，管理故事播放/What-If 与画布 focus；保存来源 invalidation 通过 clean reload 保护新编辑。各 controller 都不成为第二模型源。

## Chrome 与命令能力

useWorkspaceLayoutState 一对象持 rail tab/pinned、problems/activeIssue、inline copilot 与 exclusive hub（delivery/drift）；diagnostics tab 特别开底部 problems，DriftRadar 可作为 rail drawer、split pane 或独立 hub，不再 simulation/replay。Mod+1..6 切 topology/diagnostics/drift/copilot/clauses/workshop rail，尊重 editable/defaultPrevented 和修饰键。

useWorkspaceViewMode 的 journey/topology/table/split 不进模型/历史/保存，默认 journey（业务泳道）；V 切图/表，Alt+1/2/3/4 用 event.code（避 macOS符号）直选；已消费事件退让，裸字母尊重输入/CodeMirror。Split state 从 mode 派生 isSplit，无第二 boolean，关闭保留 pane/direction/size。

buildCommands 是 capabilities+handlers 的纯函数，disabled rows 保留解释；CHORDS 是显示键帽唯一源，groupCommands 固定分类，useCommandRegistry 依 caller memo 对象稳定结果。palette 和 header 复用 handler，不复制业务逻辑。

## 测试 seam

desktop-testing 的 installDesktopApi 提供 channel call log、agentMock 的 stream/report/patch 与 mcpMock 的 request/response/capture/status，UI 无需 Electron/socket/真实模型。useGraphLayout specs 覆盖旧结果、错误、unmount；bridge specs 覆盖 mount/selection区分、rapid calls、test-only/失败 revision；delivery/sensors/patchReview specs 覆盖 debounce竞态和后续编辑保护；BilateralSync/workspace/command registry specs 保护 token、意图、typing guards 与非模型状态。

相关：[会话事务](../model/commands-and-session.md) · [画布](./canvas-and-inspector.md) · [MCP](../agents/mcp-integration.md) · [传感器](../agents/sensor-orchestration.md)
