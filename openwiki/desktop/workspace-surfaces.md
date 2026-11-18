---
type: desktop
title: 工作区、台账与交付
description: 编辑器如何通过左侧导轨切换台账、打开诊断与协同工具，以及如何定位对象、使用快捷键和预览交付契约。
tags: [desktop, workspace, ledger, delivery, shortcuts]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-18T12:34:41.390Z
sources:
  - id: openwiki-source-2ff5ad29deef1166ab3731d6
    resource: repo://apps/desktop/src/renderer/components/canvas/CanvasFloatingHud.tsx
  - id: openwiki-source-c6160e86e9fe73aae407ea29
    resource: repo://apps/desktop/src/renderer/components/command/CommandPalette.tsx
  - id: openwiki-source-bb63e45b6dfb119f48ce6593
    resource: repo://apps/desktop/src/renderer/components/layout/ActivityDrawer.tsx
  - id: openwiki-source-29f60f1a4fe3d6d3c2e49178
    resource: repo://apps/desktop/src/renderer/components/layout/ActivityRail.tsx
  - id: openwiki-source-74158507676a0014907d29c4
    resource: repo://apps/desktop/src/renderer/screens/EditorScreen.spec.tsx
  - id: openwiki-source-9459ee1a8fc917f2d94619ce
    resource: repo://apps/desktop/src/renderer/screens/EditorScreen.tsx
  - id: openwiki-source-febf1dc4c40bace9f81ae6c9
    resource: repo://apps/desktop/src/renderer/state/commandRegistry.ts
  - id: openwiki-source-d4fc84c37b0edfd16ffd121b
    resource: repo://apps/desktop/src/renderer/state/useCommandRegistry.ts
  - id: openwiki-source-bb6258935fdbbe2efa81dede
    resource: repo://apps/desktop/src/renderer/state/useEditorShortcuts.spec.tsx
  - id: openwiki-source-e4eff0404180d86ccc5c9300
    resource: repo://apps/desktop/src/renderer/state/useEditorShortcuts.ts
  - id: openwiki-source-5c9b3359cf58a8175a7e8c84
    resource: repo://apps/desktop/src/renderer/state/useWorkspaceLayoutState.ts
  - id: openwiki-source-cd0c9b3dd84e3af20289b703
    resource: repo://apps/desktop/src/renderer/state/useWorkspaceViewMode.ts
  - id: openwiki-source-4f65ae6b144628015dbea7fa
    resource: repo://libs/desktop/feature-agent/src/components/agent/InlinePatchCopilot.spec.tsx
  - id: openwiki-source-ae2af3e0409175806d2572fb
    resource: repo://libs/desktop/feature-agent/src/components/agent/InlinePatchCopilot.tsx
  - id: openwiki-source-0e9598c3f82a767e6ca10632
    resource: repo://libs/desktop/feature-canvas/src/CanvasViewport.tsx
  - id: openwiki-source-294ae639434a4e29c9572cbc
    resource: repo://libs/desktop/feature-inspector/src/inspector/KeyDataLedgerSheet.tsx
  - id: openwiki-source-329e2fdd1b963b693d975c9a
    resource: repo://libs/desktop/feature-inspector/src/RightInspector.tsx
  - id: openwiki-source-245f4a200cbde2a0d89ec4b6
    resource: repo://libs/desktop/feature-story/src/state/useStoryPlayback.ts
generated: { by: "pi", at: "2026-11-18T12:34:41.390Z" }
---

# 工作区、台账与交付

`EditorWorkspace` 组合顶部栏、放映工具栏、左侧活动导轨、可调整宽度的中央工作区与右侧检查器、底部状态栏。界面的展开、布局和阅读模式不写入模型，也不进入撤销历史。

## 左侧四个入口

| 快捷键 | 入口 | 行为 |
| --- | --- | --- |
| Mod+1 | 总台账 | 在中央区域切换表格与画布；返回时恢复上次图形布局。 |
| Mod+2 | 门禁与诊断 | 展开或关闭底部问题面板，按严重性筛选并定位目标。 |
| Mod+3 | AI 协同 | 打开协同抽屉，查看访谈、工具活动及补丁复核。 |
| Mod+4 | 共创工作坊 | 打开七步业务提问与成对履约创建向导。 |

诊断徽标显示阻塞与警告的合计；AI 协同的圆点表示有待审补丁。协同和工作坊共用一个 `ActivityDrawer`：固定时占 300px，浮动时以 320px 宽覆盖在画布上。切换两项工具会替换抽屉；诊断使用独立的底部面板。

## 画布、台账与对象定位

默认画布模式为业务旅程，Alt+1 和 Alt+2 切换旅程与拓扑。浮动工具条管理缩放、密度、视图和场景入口；其层叠顺序低于浮动抽屉。中央区域和检查器宽度由 `react-resizable-panels` 保存，检查器可折叠。右侧字段台账 Sheet 和中央总台账共用同一模型会话。

台账的定位动作切回画布并聚焦对应节点。问题面板的定位还可指定实体属性或图中的上下文、关系；编辑器负责协调选区、范围过滤和画布定位。顶部放映工具栏支持业务流播放及按需打开的剧情详情。

## 交付与诊断

Alt+D 或命令面板打开交付对话框。它展示当前内存快照与项目打开时基线的交付投影和 API 差异；过期的预览不能导出，草稿导出不等于发布批准。底部问题面板也可通过 Alt+X 或状态栏打开。画布不会把上一修订的诊断标到当前模型对象上。

## 命令与按键归属

Mod 在 macOS 为 ⌘，处理程序也接受 Ctrl。Mod+K 打开命令面板，Mod+J 打开内联副驾，Mod+I 或 Mod+反斜杠折叠或恢复右侧检查器。画布支持 Mod+0 重设缩放、Shift+1 适配模型、Shift+2 聚焦当前选区。

已处理的按键不会重复派发；导轨快捷键不抢输入框焦点。补丁复核期间 Escape 优先撤回补丁，Mod+Enter 确认补丁但不抢文本输入。无待审补丁时，Escape 可退出放映或清理选区。命令面板复用同一组操作处理程序，在执行前关闭，避免对话框相互抢焦点。

## 验证入口

`ActivityRail.spec.tsx` 固定四个入口及顺序，`useWorkspaceLayoutState.spec.ts` 验证快捷键、抽屉与交付对话框。`EditorScreen.spec.tsx` 联测总台账切换与回到画布、问题定位、工作坊、放映和补丁复核。

相关：[渲染状态](./renderer-state.md) · [画布](./canvas-and-inspector.md) · [交付](../contracts/delivery-routes-and-diff.md) · [补丁审查](./ingestion-and-patch-review.md)
