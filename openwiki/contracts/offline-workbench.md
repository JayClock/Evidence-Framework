---
type: contract
title: 离线审查工作台
description: 已检查模型如何编译为带异步 ELK 预布局、白名单数据、差异图、CSP 与原子发布的只读单文件 HTML，以及桌面预览与正式导出的边界。
tags: [visualization, review, html, csp, publishing, offline, diff-review]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-15T14:07:58.904Z
sources:
  - id: openwiki-source-310af6f70610151f6693b6d6
    resource: repo://apps/desktop/src/main/reviewIpc.ts
  - id: openwiki-source-c72ee53c66b83fbe248c4854
    resource: repo://apps/desktop/src/main/reviewPreview.ts
  - id: openwiki-source-49979aadcf2c9124e1bfe05a
    resource: repo://apps/desktop/src/renderer/components/review/ReviewHubModal.tsx
  - id: openwiki-source-21281d5442df56210e5181e5
    resource: repo://apps/desktop/src/renderer/state/useReviewExport.ts
  - id: openwiki-source-9907bd51adc4e23040fa45e9
    resource: repo://apps/desktop/src/shared/ipc.ts
  - id: openwiki-source-f9545887d42c08adbc8605cb
    resource: repo://libs/evidence-visualization/assets/business-graph.js
  - id: openwiki-source-48fb01e439d97ccec8f31fc0
    resource: repo://libs/evidence-visualization/assets/workbench.css
  - id: openwiki-source-4bf9db6573e464cc7c93d296
    resource: repo://libs/evidence-visualization/assets/workbench.js
  - id: openwiki-source-f09309d6b09bb3169ef331c4
    resource: repo://libs/evidence-visualization/src/commands.ts
  - id: openwiki-source-3ae8adf574661c7d35742fbe
    resource: repo://libs/evidence-visualization/src/generate/collectWorkbench.ts
  - id: openwiki-source-96d2a612a941794b7305e7a6
    resource: repo://libs/evidence-visualization/src/generate/generateWorkbench.spec.ts
  - id: openwiki-source-25991f0e9374ce7206572f30
    resource: repo://libs/evidence-visualization/src/generate/generateWorkbench.ts
  - id: openwiki-source-ac002c88920d5a6721fa64c4
    resource: repo://libs/evidence-visualization/src/projection/deliveryView.ts
  - id: openwiki-source-f855c04b318ee4c7f7e562d0
    resource: repo://libs/evidence-visualization/src/projection/workbenchDiff.spec.ts
  - id: openwiki-source-70196ff361d4b6f750e16532
    resource: repo://libs/evidence-visualization/src/projection/workbenchDiff.ts
  - id: openwiki-source-79b4c884b8e8b7e473d88494
    resource: repo://libs/evidence-visualization/src/projection/workbenchLayout.ts
  - id: openwiki-source-1424b0cd227894b90f6674f4
    resource: repo://libs/evidence-visualization/src/projection/workbenchProjection.ts
  - id: openwiki-source-28ab8d38fd5d45f412609ea7
    resource: repo://libs/evidence-visualization/src/publish/workbenchPublisher.ts
  - id: openwiki-source-788a2130bc7c34cc6c185ad2
    resource: repo://libs/evidence-visualization/src/render/workbenchAssets.ts
  - id: openwiki-source-e24bc99595a43e4b823f1ebd
    resource: repo://libs/evidence-visualization/src/render/workbenchRenderer.spec.ts
  - id: openwiki-source-4e22d925c6c713609335897f
    resource: repo://libs/evidence-visualization/src/render/workbenchRenderer.ts
  - id: openwiki-source-9af6f5e65ffc9bd0735eb1fb
    resource: repo://libs/evidence-visualization/tests/browser/review-browser.mjs
generated: { by: "pi", at: "2026-11-15T14:07:58.904Z" }
---

# 离线审查工作台

`evidence-visualization` 编译一个无需服务、无需联网的只读 HTML。推荐入口 `evidence review`；旧 evidence-workbench generate 只是 stderr 弃用 shim，共用库 commands。默认 `.evidence/views/index.html`，支持 project-root/out、重复 scope、require-api 和 assets，成功输出 output/counts/validation，失败退出 1。

## 收集与发布不允许混合快照

generateWorkbench 读 fingerprint → collect → render → 再 fingerprint → publish。collector 自己也比对指纹，变化抛 WorkbenchInputError；发布前变化保留已有视图。模型树与可选 `.evidence/api/api.json` 按排序路径/NUL/字节哈希，排除首层 generated 和 __pycache__，拒绝 symlink。显式 modelRoot 的 Bundle 只 fingerprint 普通快照文件及 API overlay，而不读另一份树；宿主必须传实际来源。

出现 API overlay 或 requireApi 就是联合审核，必须显式非空 scope；没有 overlay 时 requireApi 可从模型生成路由，不要求预先造 API 文件。FM 必须 valid 且输入未变；联合审核还需 complete。loader、overlay、投影 error、check/projection digest 不符或 fingerprint 变化均拒绝，不输出部分页面。

检查只来自 document 的静态 FM v6 和内联 examples，不再读取 Scenario/Instance/replay suite；页面不宣称服务运行已验证。

## 异步布局在生成期计算

`workbenchLayoutOf` 使用与 desktop 相同的 createDomainGraph → **await computeGraphLayout**（headless ELK）→ toSerializableLayout，空模型返回 EMPTY_GRAPH_LAYOUT。current 和 baseline 都在 Node 收集期等待自己的布局。浏览器只消费内联 nodes/edges/compound groups 和 edge sections/bends，不加载 ELK，不重新求解业务拓扑。

因此布局 API 的 async 不引入常驻服务或网络依赖，桌面与离线图共享几何结果。business-graph.js 按可序列化坐标绘卡片和 compound frames，线路使用预计算路由，不画旧手写泳道第二意见；表达式只显示文本，不在页面执行。

## 白名单、隐私与状态

projectWorkbenchData 按名选择字段，不把源记录直接塞进 payload。select/scalarValues/fieldRows 仅复制明确字段；缺 ID 或重复 ID 拒绝，dangling edge targets 保留在 unresolved 去重排序。节点覆盖模型对象/属性/规则和 API/交付对象，edges 包含所有权/责任/引用/规则绑定及交付关系；edge identity 按 from/to/label 去重。

validation.fm 来自 checked，正式 collector 页面为通过，作者预览可为 false；api 不适用为 null，runtime 恒 false。counts.entities 包含 Context，但概览“业务对象”仅统计 evidence/participant/role。旧验证场景树、instance/replay 面板已撤除，导航是业务结构与 API，不再三分区。

源路径、访谈材料、sourceRefs/inputFiles/input digest/Git 历史不导出。delivery service 的 notes 是固定 taxonomy 说明，非实体私密 notes；diff 的 baselineFingerprint 是已显示 compiled baseline 的摘要，是此规则的明确例外。

deliveryViewOf 把同一 snapshot 压成 service kind/lane/context/supplies/consumes/固定 notes、排序 route lines、links、limitations，丢掉完整 OpenAPI 和输入路径摘要。服务节点在树根，通过“部署边界”边连接 Context；async links 标为异步。无联合 API 时使用 buildDelivery，不虚构接口审查已通过。

## 安全与发布所有权

renderWorkbenchHtml 内联 JSON、CSS 和拼接 business-graph.js/workbench.js 的**唯一执行脚本**。payload 转义 <、>、&、U+2028/U+2029，防业务标签闭合 script；拒绝含结束标签的资源，模板脚本数量必须正确。CSP 对最终脚本做 sha256 pin，default/connect/object/base/form 均禁外部行为；label 作为文本，不能解析成 markup。

资源优先显式 assetsDirectory、Electron resourcesPath/assets、安装包邻接 assets；不扫描项目指令/资源，不因 working copy 换一套代码。缺资源明确列尝试路径。desktop packaged assets 来自 app.asar 旁 unpacked install tree。

文件以 `<!-- evidence-object-workbench -->` 标识所有权：publisher 拒绝 symlink 或无 marker 的外来文件，不能覆盖用户文件。允许目标先写同目录 uuid 临时页再 rename，失败清理 temp，始终是完整旧页或新页。

## 差异审查和页面行为

baseline 由人选 `*.evidence.json`，不是 undo stack 或 Git。projectWorkbenchDiff 单独投影/布局 baseline，拒绝模型 ID 不同，只保留白名单改变字段和 attribute diff、counts、baselineFingerprint、baseline nodes/layout，不改 current data。

current 图标 added/modified；移除对象在 baseline 图自己的坐标显示，带颜色及 +/~/- 标记。点击 baseline 变更打开 diff detail，返回概览；定位选择正确图、聚焦并 dispatch review-focus。页面提供 search、breadcrumbs、back、copy ID、⌘/Ctrl K 与 Escape，完成只读 notice 后设置 body.dataset.ready，供 browser suite 等待。

## 桌面预览不是保存

main previewReview 接收实时 document/revision，推导顶层 entry scopes，计算 FM/strict validation/台账、await layout，返回 issues、HTML 和 saved/unsaved notice。没保存不写文件；已保存且有效目录项目可通过 collectWorkbench 获正式内容，API 不可用加入 notice。前后磁盘 fingerprint 不同拒绝。不会再从 disk 读 scenario inputs。

ReviewHubModal 用 sandbox=allow-scripts 的 srcDoc iframe，不能访问宿主；每次打开一个快照，revision 变化标 stale 并禁定位/提示直到刷新。正式 export 从保存来源生成：普通 review 默认 review.html，diff 先选 Bundle、默认 diff-review.html；取消 picker 返回 cancelled。若存在 API overlay，按顶层 entry context 推 scope，无 scope 不猜。useReviewExport 单飞并只对 saved/failed 显示 notice，取消静默。

## 验证地图

generate specs 覆盖 scope/digest/变更拒绝、overlay、Bundle、原子替换与 foreign-file；projection/diff/layout specs 覆盖白名单、隐私、dangling、重复 ID 和异步布局；renderer/publisher specs 覆盖 escaping、CSP hash、脚本数量和所有权。node VM tests 执行随包脚本；真实 Chrome/CDP suite 检查 ELK 几何、compound routing、legend、labels、零错误/零外部请求、无 provenance 泄漏和运行后字节不变。desktop preview/export specs 覆盖不写盘与 false FM verdict。

相关：[API 投影](./api-projection.md) · [画布](../desktop/canvas-and-inspector.md) · [构建资源](../operations/build-and-package.md) · [CLI](../workflows/cli-governance.md)
