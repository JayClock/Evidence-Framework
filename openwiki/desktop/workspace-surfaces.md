---
type: frontend
title: 工作区、台账、交付与漂移
description: EditorWorkspace 的 rail/drawer、画布/台账/分屏、review/delivery/drift hubs、问题条和命令键盘的所有权、定位与过期状态。
tags: [desktop, renderer, ui, keyboard, navigation, surfaces]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-15T14:07:58.904Z
sources:
  - id: openwiki-source-c997db8538f06be1bf5c434c
    resource: repo://apps/desktop/src/renderer/components/agent/InlinePatchCopilot.spec.tsx
  - id: openwiki-source-d79cdd745e8c94680663fc45
    resource: repo://apps/desktop/src/renderer/components/agent/InlinePatchCopilot.tsx
  - id: openwiki-source-2ff5ad29deef1166ab3731d6
    resource: repo://apps/desktop/src/renderer/components/canvas/CanvasFloatingHud.tsx
  - id: openwiki-source-c6160e86e9fe73aae407ea29
    resource: repo://apps/desktop/src/renderer/components/command/CommandPalette.tsx
  - id: openwiki-source-54bfa14340461b5df12c5a93
    resource: repo://apps/desktop/src/renderer/components/console/ProblemsPanel.tsx
  - id: openwiki-source-e0008b039e09cb0ae867a401
    resource: repo://apps/desktop/src/renderer/components/drift/DriftRadar.tsx
  - id: openwiki-source-bb63e45b6dfb119f48ce6593
    resource: repo://apps/desktop/src/renderer/components/layout/ActivityDrawer.tsx
  - id: openwiki-source-29f60f1a4fe3d6d3c2e49178
    resource: repo://apps/desktop/src/renderer/components/layout/ActivityRail.tsx
  - id: openwiki-source-49979aadcf2c9124e1bfe05a
    resource: repo://apps/desktop/src/renderer/components/review/ReviewHubModal.tsx
  - id: openwiki-source-f33a2c1f54f15e4161b2463b
    resource: repo://apps/desktop/src/renderer/components/split/SecondaryStage.tsx
  - id: openwiki-source-9459ee1a8fc917f2d94619ce
    resource: repo://apps/desktop/src/renderer/screens/EditorScreen.tsx
  - id: openwiki-source-febf1dc4c40bace9f81ae6c9
    resource: repo://apps/desktop/src/renderer/state/commandRegistry.ts
  - id: openwiki-source-64e02f46b7978332dd710c41
    resource: repo://apps/desktop/src/renderer/state/useBilateralSync.ts
  - id: openwiki-source-d4fc84c37b0edfd16ffd121b
    resource: repo://apps/desktop/src/renderer/state/useCommandRegistry.ts
  - id: openwiki-source-bb6258935fdbbe2efa81dede
    resource: repo://apps/desktop/src/renderer/state/useEditorShortcuts.spec.tsx
  - id: openwiki-source-e4eff0404180d86ccc5c9300
    resource: repo://apps/desktop/src/renderer/state/useEditorShortcuts.ts
  - id: openwiki-source-07d3a3a523a823055d2c6b41
    resource: repo://apps/desktop/src/renderer/state/useWorkspaceLayoutState.spec.ts
  - id: openwiki-source-5c9b3359cf58a8175a7e8c84
    resource: repo://apps/desktop/src/renderer/state/useWorkspaceLayoutState.ts
  - id: openwiki-source-c0750187b8b81a71c6768dd8
    resource: repo://apps/desktop/src/renderer/state/useWorkspaceSplitState.ts
  - id: openwiki-source-cd0c9b3dd84e3af20289b703
    resource: repo://apps/desktop/src/renderer/state/useWorkspaceViewMode.ts
  - id: openwiki-source-0e9598c3f82a767e6ca10632
    resource: repo://libs/desktop/feature-canvas/src/CanvasViewport.tsx
  - id: openwiki-source-294ae639434a4e29c9572cbc
    resource: repo://libs/desktop/feature-inspector/src/inspector/KeyDataLedgerSheet.tsx
  - id: openwiki-source-329e2fdd1b963b693d975c9a
    resource: repo://libs/desktop/feature-inspector/src/RightInspector.tsx
generated: { by: "pi", at: "2026-11-15T14:07:58.904Z" }
---

# 工作区、台账、交付与漂移

EditorWorkspace 是界面组合点：48px TopHeader、48px activity rail、可选 drawer、resizable centre/inspector、32px BottomStatusBar；problems/inline copilot/hubs/palette 只在需要时覆盖。页面呈现状态不进模型、不进 undo，也不保存到 FM。

## 一张画布，按需工具

RAIL_TABS 当前为 **topology、diagnostics、drift、copilot**；诊断 badge 是 block+warn，copilot 待审 patch 是点。diagnostics 特别开画布底部38%问题条，不另叠 drawer。其他 tab 共用 ActivityDrawer：pinned300px占宽、floating320px从left-12盖在画布上、一次只有一个。选对象后 unpinned 退回画布，pinned 保持；Mod+F 先开 topology、下一 paint 以 token 聚焦搜索。

画布 controls/HUD 位于 activity drawer 以下的 stacking context，不能遮住 drawer。HUD 管视图/密度/分屏、paper、zoom/minimap，**不创建对象**（创建需 Context/角色红线）。controls/inline copilot 带 capture-hide，data-region/data-pane 等是测试和 MCP 几何协议。

centre 与 inspector 为 resizable pair，中心 min35，right 默认20%、14–26、可折0；横向 ratio 用 autoSaveId。右侧 ledger Sheet 为 modal、55vw，可 Alt+L/按钮开，同 session 编辑，不需返回合并。后台 load/error/live-sync alert 明确不同于空模型。

## graph/table/split 与副面板

useWorkspaceViewMode：graph、table、split；V切graph/table，Alt+1/2/3按event.code选模式，避免macOS Alt+2产生™。split isSplit 从mode派生，无第二boolean；pane/direction/size关闭后保留，ratio 按方向持久化。

四副面板是 **ledger/openapi/cel/drift**，不是 simulation。OpenAPI 与 CEL badges 分别 route/rule count。SecondaryStage 只渲染 panes[activePane]，inactive unmount，因此 YAML/JSON 等 local state重置；不能依赖隐藏 pane 常驻。maximize 临时 fixed，不关split，close先取消maximize。Drift 不自动回放，用户明确选 trace 才 audit。

## DriftRadar 与两个契约 hub

同一个 DriftRadar 可用于 rail、split embedded region 和 modal hub；useDriftAudit 选择文件后经 main读取 saved模型+OTLP JSON，显示span/commit数、passed阻塞结论、findings、errors和remediation。无结果只显示未审计，不把空表当绿灯；loading防重入，读取失败明确error。旧 SimulationSandbox/useSimulation/replay pane已删除。

activeHub 保留 **delivery | drift | review | null** 的互斥值，第二hub替换第一个，不叠加；fixed dialog位于studio之外，也盖住header/status。DeliveryHub 显示当前accepted内存投影与opening baseline，原生oasdiff差异和draft未授权；Drift hub仍看saved来源，不能和未保存预览混淆。

ReviewHubModal mount取一份live snapshot、revision变更标stale，不静默换读者看到内容；定位/Agent修复在stale或busy禁用。其dialog处理Escape、Tab/Shift+Tab循环，开时聚焦、关后恢复；embedded不trap。问题交Agent时关hub、开copilot、定位并以token预填prompt，消费后不能重复重放。DeliveryHub/DriftRadar自身只有关闭按钮，未实现同样键盘trap，Escape可能到workspace；不要把视觉modal当作完整focus管理保证。

## 一选择，多种定位意图

画布、台账、OpenAPI行、CEL规则用 bilateral focus bus 的source/token同步；shell是resolver，校验geometry存在，必要时清隐藏target的scope，selectAttribute并pan。entity#attribute精确到行，Context/relationship只定位不造实体选择。返回非table模式时重新聚焦选择，避免丢失阅读位置；diagnostic badge同时开problems activeIssue并focusIssue。详情见[renderer状态](./renderer-state.md)。

## 快捷键与事件所有权

CHORDS是palette键帽来源（显示⌘，handler也接受Ctrl）；rail自有⌘1..4表，HUD打印⌘0/⇧1。常用键：⌘S保存，⌘K命令，⌘F结构搜索，⌘J inline副驾，⌘B拓扑，⌘I/⌘\\折Inspector；Alt+D交付、Alt+R review、Alt+Shift+S漂移hub（旧内部handler仍名openSandbox），Alt+X问题、Alt+S旋转split、Alt+4 contract、Alt+L台账；⌘Shift+E导出review、⌘Shift+R重查；undo/redo、zoom/fit/selection复用会话/画布handler。

事件先尊重defaultPrevented/capture surface。ledger Sheet的Escape capture关闭自己且不清背后选区；inline copilot无pending patch时capture关闭，有pending则退让。workspace Escape：pending patch先revert（typing guard之前），其次closeSplit，最后clearSelection；Mod+Enter accept在typing guard之后，避免抢文本输入。bare键/Alt与rail/view chords尊重input/textarea/select/contenteditable/CodeMirror，Mod digits还要求无Alt/Shift。

Alt+3同时出现在split模式和ledger入口的映射中，具体以注册handler/defaultPrevented顺序为准，不能仅凭显示表承诺无冲突。

## Palette 是索引，不是另一实现

buildCommands(capabilities,handlers) 复用header/keyboard行为；disabled rows保留理由（dirty时正式review先保存、busy时等待），query非空才显示对象targets。运行先关palette再perform，防OS dialog在focus trap后悬挂。useCommandRegistry以memo对象稳定结果，groupCommands固定分组。ui-kit统一Dialog/Sheet/Resizable/Tooltip/CodeEditor/Toaster，不在每个surface复制一套focus/density逻辑。

## 验证地图

EditorScreen specs联测四rail、drawer交还/固定、台账↔画布、分屏tabs、pending patch Escape与scope不进历史。ActivityRail/Drawer、SecondaryStage、DriftRadar、DeliveryHub、ReviewHubModal独测标记、badges、mount/unmount、空/错误/过期与键盘。shortcuts/workspace hooks tests保护typing/defaultPrevented/捕获仲裁；CommandPalette保护disabled解释和先关闭再执行。

相关：[画布](./canvas-and-inspector.md) · [交付](../contracts/delivery-routes-and-diff.md) · [补丁审查](./ingestion-and-patch-review.md) · [传感器](../agents/sensor-orchestration.md)
