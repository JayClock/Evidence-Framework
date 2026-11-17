# 文件

- [Electron 宿主、IPC 契约与项目生命周期](app-shell.md) - 桌面壳如何把 Electron 与领域引擎隔开：main 注册 project/ingestion/story/delivery/drift/agent/mcp 通道并管理窗口与项目存储，preload 只暴露 contracts 定义的 EvidenceDesktopApi，`--mcp-stdio` 走无窗口代理。
- [画布几何、布局与检查器编辑](canvas-and-inspector.md) - 画布链的三层分工——无 DOM 的 ELK 拓扑与权责泳道几何、React Flow 视口与履约边/诊断/故事高亮，以及走同一 ModelSession 撤销的属性、台账与 CEL 业务公式编辑。
- [资料摄取与补丁审查](ingestion-and-patch-review.md) - 业务文本、合同与蓝图如何先读成可修正草稿、再由人审校编译落盘，以及已提交的 Agent JSON Patch 如何在同一会话中回答结果、给出一次撤销并在后续编辑后安全关闭。
- [Renderer 组合、会话与状态所有权](renderer-state.md) - EditorScreen 如何组合 feature 库，useEditorSession 与 useGraphLayout 持有唯一 ModelSession 与异步几何，实时镜像、定位 bus 和 workspace chrome 各守一层状态，commandRegistry 与 useEditorShortcuts 如何保持单一键盘 owner。
- [工作区界面与交互入口](workspace-surfaces.md) - 工作台的界面组合：48px 页头与六项 ActivityRail 抽屉、graph/table/split 与五个副视口、delivery/drift hub 与场景工作台、命令面板与状态栏，以及 Dashboard 入口和 feature 库的所有权边界。
