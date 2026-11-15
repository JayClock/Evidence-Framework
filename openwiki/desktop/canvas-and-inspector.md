---
type: frontend
title: ELK 画布与属性检查器
description: headless ELK 的 compound 图与正交线路如何异步投影到 React Flow，以及声明式 Inspector、来源台账与原生 CEL 诊断如何通过同一模型事务编辑。
tags: [canvas, layout, elk, react-flow, inspector, cel, renderer]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-15T14:07:58.904Z
sources:
  - id: openwiki-source-2ff5ad29deef1166ab3731d6
    resource: repo://apps/desktop/src/renderer/components/canvas/CanvasFloatingHud.tsx
  - id: openwiki-source-f0f06a0981a7ca97c510b44d
    resource: repo://apps/desktop/src/renderer/state/useEditorSession.ts
  - id: openwiki-source-50f41d92dd610018f85692d8
    resource: repo://apps/desktop/src/renderer/state/useGraphLayout.ts
  - id: openwiki-source-0e9598c3f82a767e6ca10632
    resource: repo://libs/desktop/feature-canvas/src/CanvasViewport.tsx
  - id: openwiki-source-f061fbcec05a0bf931e07581
    resource: repo://libs/desktop/feature-canvas/src/colors.ts
  - id: openwiki-source-f172557f5294fb7b6d40b660
    resource: repo://libs/desktop/feature-canvas/src/diagnosticIndex.ts
  - id: openwiki-source-6e68c0c1e5717ade71a301bb
    resource: repo://libs/desktop/feature-canvas/src/DiagnosticMarkers.tsx
  - id: openwiki-source-77f399164de91035c6ccef6e
    resource: repo://libs/desktop/feature-canvas/src/EntityNode.tsx
  - id: openwiki-source-4627c03fe3c69aaf82172492
    resource: repo://libs/desktop/feature-canvas/src/FulfillmentEdge.tsx
  - id: openwiki-source-7a1228eb46af6c602fefd762
    resource: repo://libs/desktop/feature-canvas/src/NodeCard.tsx
  - id: openwiki-source-244606812e456b871be3ae42
    resource: repo://libs/desktop/feature-canvas/src/useReactFlowAdapter.spec.ts
  - id: openwiki-source-6d874554d1c41740fadb809b
    resource: repo://libs/desktop/feature-canvas/src/useReactFlowAdapter.ts
  - id: openwiki-source-e2b5a1cbd3a170a50d182ec0
    resource: repo://libs/desktop/feature-inspector/package.json
  - id: openwiki-source-082c14eef6df0c4c3ab791f2
    resource: repo://libs/desktop/feature-inspector/src/inspector/ApiFieldBadge.tsx
  - id: openwiki-source-000b39f31699cab4b8d68ff9
    resource: repo://libs/desktop/feature-inspector/src/inspector/AttributeDataGrid.tsx
  - id: openwiki-source-20d2555563b1abcb73788ed3
    resource: repo://libs/desktop/feature-inspector/src/inspector/cel/CelCodeMirrorEditor.tsx
  - id: openwiki-source-dee623b77a0e08e0c4e4a734
    resource: repo://libs/desktop/feature-inspector/src/inspector/cel/celCompletion.ts
  - id: openwiki-source-49d65fe1a848743b22a1f221
    resource: repo://libs/desktop/feature-inspector/src/inspector/cel/celLanguage.ts
  - id: openwiki-source-2dc78a0ad51effda9e61ea16
    resource: repo://libs/desktop/feature-inspector/src/inspector/DerivedRuleSection.tsx
  - id: openwiki-source-2705304ded6d7ebcd7c41094
    resource: repo://libs/desktop/feature-inspector/src/inspector/FulfillmentPairSection.tsx
  - id: openwiki-source-294ae639434a4e29c9572cbc
    resource: repo://libs/desktop/feature-inspector/src/inspector/KeyDataLedgerSheet.tsx
  - id: openwiki-source-3046611767bc0c00a44d0bdb
    resource: repo://libs/desktop/feature-inspector/src/inspector/KeyDataProvenancePicker.tsx
  - id: openwiki-source-329e2fdd1b963b693d975c9a
    resource: repo://libs/desktop/feature-inspector/src/RightInspector.tsx
  - id: openwiki-source-e455638d22c6c7e96fc2208a
    resource: repo://libs/desktop/ui-kit/src/components/code/celLanguage.ts
  - id: openwiki-source-5fd24ccc578cf591f24df968
    resource: repo://libs/desktop/ui-kit/src/index.ts
  - id: openwiki-source-fccb570e109bfa43112e2a49
    resource: repo://libs/evidence-canvas-interaction/src/adapter/domainToElk.ts
  - id: openwiki-source-a9f2ab41a3c0d7cc61e3fa58
    resource: repo://libs/evidence-canvas-interaction/src/adapter/elkToLayout.spec.ts
  - id: openwiki-source-a89ce242205c67a68caf95d4
    resource: repo://libs/evidence-canvas-interaction/src/adapter/elkToLayout.ts
  - id: openwiki-source-fc3115a3d9d8f16505989d87
    resource: repo://libs/evidence-canvas-interaction/src/engine/layoutEngine.spec.ts
  - id: openwiki-source-848e24844e664baadc8329eb
    resource: repo://libs/evidence-canvas-interaction/src/engine/layoutEngine.ts
  - id: openwiki-source-0ae760ad3a5c96a106b90cc0
    resource: repo://libs/evidence-canvas-interaction/src/layout/serializable.ts
  - id: openwiki-source-3b8cee887561dc24e2e125cf
    resource: repo://libs/evidence-canvas-interaction/src/ruler/math.ts
  - id: openwiki-source-8d0ffb3d7528805a524ee47f
    resource: repo://libs/evidence-canvas-interaction/src/selection/contextScope.ts
  - id: openwiki-source-40ed2cf21089af3de30a0699
    resource: repo://libs/evidence-canvas-interaction/src/selection/hoverHighlight.ts
  - id: openwiki-source-765a818dd2c076288d6080cc
    resource: repo://libs/evidence-schema/src/inspector/groups.ts
  - id: openwiki-source-f7425e64fedf4f34deb929e7
    resource: repo://libs/evidence-schema/src/inspector/registry.ts
generated: { by: "pi", at: "2026-11-15T14:07:58.904Z" }
---

# ELK 画布与属性检查器

职责分四层：canvas-interaction 负责无 DOM/React 的 ELK 适配和几何；desktop feature-canvas 渲染 React Flow；feature-inspector 负责模型编辑；schema/inspector 注册字段与参考约束。app 组合它们，不直接进口 React Flow/CodeMirror。

## 异步 ELK 取代手工泳道

`computeGraphLayout(graph,{viewMode})` 返回 Promise：domainToElk 构 compound tree → bundled headless elk.layout → elkToLayout。layered/RIGHT、INCLUDE_CHILDREN、ORTHOGONAL、NETWORK_SIMPLEX、LAYER_SWEEP、固定 randomSeed=1；输入只读，不需 DOM/text measurement。

卡片固定密度：simplified220×82、standard220×156、expanded240×200。Context children 按 contextRef/parentContextRef 嵌套，未知父引用留 root；**空 Context 仍有260×84边界**。父层次循环显式抛 Cyclic Context hierarchy，不再静默停止/省略。内部 root/edge ID 避免和业务 ID 冲突。

所有有效 relationship，以及每 fulfillment request→confirmation/proof 成对边交给 ELK；无端点引用交由 schema 报错，布局跳过它让有效草稿仍可见。已移除旧 fulfillment row/frame、reserved lifecycle lanes、shared band 与 sharedResultIds 算法；同一实体只建一个 compound node。

elkToLayout 保留 local box 和累积 worldBox，把 edge.container（或所在 node）的坐标加到 ELK sections 上，按 incoming/outgoing 链连接、去重相接点；缺 route、未知 container、断开的 section 显式拒绝，不用手写 midpoint 猜线。返回节点/Context 的索引、关系正交 routes、独立 fulfillmentPairs、显式 roleRefs/responsibleRoleRef 的责任 links、bounds。

跨 Context 或 plays_role 虚线，plays_role 才有箭头；旧 moment_trace/role_inversion/shared_thing 私有跨界分类已撤除。toSerializableLayout 只复制命名几何/ID/路由，不携实体和 Map，供离线 HTML 消费相同结果。

## React Flow 只管理视口

adapter 父 Context 先列，使用 **local box + parentId/extent=parent**，free node 是 root 坐标；另存 worldBox 供范围/诊断。显式 initialWidth/Height 与 invisible source/target handles 让首次测量前边就能渲染。关系保留世界坐标 polyline；pairLink 直接使用 ELK fulfillmentPairs，不再从旧 frame 合成线。

CanvasViewport 经 ReactFlowProvider 管理 pan、pinch、marquee/fit animation，非业务模型拖拽编辑器：不可 draggable/connectable，wheel zoom 关闭，pane click 清选区。范围0.25–4现在在 renderer 配置，旧 viewport math/fit/boxSelection 模块不再是库 API。partial marquee 只回报首个 entity，Context 是不可交互底纸。

fit/scope/density/focus/zoom 由 token 驱动，避免重渲染重放快捷键，bounds 至少1×1；scope 或密度变化清 hover 并重框。HUD render prop 只暴露 zoom/fit/reset/grid/minimap，app 叠加视图/密度/分屏。controls 带 capture-hide，层级低于 activity drawer；三种背景 dots/lines/none、折叠 radar 与业务 legend 不修改模型。

scope 是 canonical layout 的 mask：目标 Context subtree、拥有对象与一跳邻居、需要的 frame（祖先仅 frame）、触边和 bounds；不重新布局另一张图。computeHighlight 只扩一跳，未知 ID 返回空/不 dim，hover 优先、否则选择保持可读。

## 节点、边、补丁与诊断

NodeCard 用 category spine 和 interval/moment/card 表现时段/时刻，显示 party/responsibility/API badges；standard 更多 ID、时间、属性和计数。API 待刷新不伪装覆盖成功。out-of-scope 不可点击/键盘进入。

FulfillmentEdge 绘制 ELK polyline、diagnostic halo、plays_role arrow、cardinality chips 和 hover label；simplified 隐藏未 hover/highlight 的 plays_role。pairLink 是细虚线无箭头，语义为履约声明而非虚构关系。ChangeRing 只标当前模型新增/删除/修改，不改对象颜色。

DiagnosticIndex 只用已知 target（#前实体/关系）或真实 Context fallback，不解析消息猜引用；按 issueId 去重、保留最高 severity。Markers 画 outline/count，忽略 out-of-scope，点击把原 issues 交 app 定位。报告过期时 app 丢弃整个 index，见[renderer 状态](./renderer-state.md)。

## 声明式 Inspector 与事务

schema registry 声明 general/责任/attributes，fulfillment/rules 是专用 section；每字段给 editor/options/reference/helper。reference 约束 category/kind/sameContext，责任 picker 只供同合同 party role，单引用允许“未声明”。ID 只读，text/select/boolean/reference/attribute-table 等控件由注册信息驱动。

字段编辑现在 `session.mutate(draft=>...Mutator)`，不再 dispatch Command。文本 local draft 在 blur/Enter 且值改变才提交，Escape 恢复，按 entity ID key 重挂避免草稿串对象。CEL/provenance 在属性行/台账的绑定上下文编辑，不在通用 rail 乱造文本提供方。

FulfillmentPairSection 从 graph.fulfillmentPair 显示 completion/confirmation/breach，pair/breach 调 guarded mutator，拒绝在面板显示原因。AttributeDataGrid 添加/更新/cascade删除属性、来源 picker、DerivedRuleSection 都同一会话事务；派生绑定可一次创建/更新规则并连接目标，一次撤销。

ApiFieldBadge 复用 browser-safe fieldFor：Input、CEL Derived、Service Timestamp。KeyDataProvenancePicker 由模型分类，只提供绑定派生/取消 keyData 等真实决议，无自由文本“供应方”。宽 KeyDataLedgerSheet 和 formula bar 编辑同 session，显示待决/闭合计数；Alt+L/按钮打开，Escape stopPropagation 避免连带清选区。

## CEL 是原生分析，不是 tokenizer 裁判

ui-kit CodeEditor 服务只读 CEL/OpenAPI；feature-inspector CelCodeMirrorEditor 管 model-aware completion/lint/history/commit。tokenizer 仅着色；真正语法、作用域和未知标识符来自 model-core 的 cel-js native scoped AST。many bindings 的宏作用域变量不能被误报为模型 alias，源码 offset 诊断定位 gutter。200ms lint 提供输入反馈，不替代全局门禁。

completion 从 rule aliases/实体属性/many 宏上下文生成；blur/Mod+Enter 去重提交，外部 undo/patch 在 prop 真变化时同步 draft。两个呈现 tokenizer 若扩内建词需一致，但不能靠加关键词“修好”原生语法错误。

## 测试地图

engine/layoutEngine 与 adapter/elkToLayout specs 覆盖密度、嵌套/空 Context、cycle 拒绝、cross-boundary sections、容器坐标、pair edges、序列化和不改源。feature-canvas adapter/CanvasViewport specs 覆盖父前子、local/world 对齐、早期 handles、scope/diagnostic/token/overlay。Inspector/registry/CEL specs 覆盖字段约束、单次事务撤销、来源与 native 作用域诊断；离线 browser suite 验证同一 ELK 线路离线可绘制。

相关：[模型事务](../model/commands-and-session.md) · [关键数据](../language/key-data-and-provenance.md) · [离线页](../contracts/offline-workbench.md) · [补丁审查](./ingestion-and-patch-review.md)
