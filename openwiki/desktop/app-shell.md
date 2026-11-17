---
type: architecture
title: 桌面宿主与项目生命周期
description: Electron 启动、窗口/IPC、安全边界、树与 Bundle 项目持久化，以及 Chokidar 发现、重建、去抖和释放生命周期。
tags: [desktop, electron, ipc, preload, project-store, windows]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-15T14:07:58.904Z
sources:
  - id: openwiki-source-f85ce0e3a462797434d822a8
    resource: repo://apps/desktop/src/main/agentIpcHandlers.ts
  - id: openwiki-source-c8d6c908e749a45544b1e625
    resource: repo://apps/desktop/src/main/deliveryIpc.ts
  - id: openwiki-source-64d2ba689444145d517c3142
    resource: repo://apps/desktop/src/main/driftIpc.ts
  - id: openwiki-source-71f7c0262d5ba642c71843ea
    resource: repo://apps/desktop/src/main/ingestionIpc.ts
  - id: openwiki-source-29a03c686cfbb53a357cc349
    resource: repo://apps/desktop/src/main/installAssets.ts
  - id: openwiki-source-5d33672c45ec58cd29dce507
    resource: repo://apps/desktop/src/main/main.ts
  - id: openwiki-source-e8d8a05aad1d7c63bcff6353
    resource: repo://apps/desktop/src/main/modelSource.ts
  - id: openwiki-source-934367cee5dc2ef07c9fb835
    resource: repo://apps/desktop/src/main/modelWatcher.ts
  - id: openwiki-source-7bb156d03ddba2cff4399f8b
    resource: repo://apps/desktop/src/main/projectIpc.ts
  - id: openwiki-source-5b34bee2ec1dee5c3ad249ac
    resource: repo://apps/desktop/src/main/projectStore.spec.ts
  - id: openwiki-source-7d6301f8bedb09df7ce20329
    resource: repo://apps/desktop/src/main/projectStore.ts
  - id: openwiki-source-310af6f70610151f6693b6d6
    resource: repo://apps/desktop/src/main/reviewIpc.ts
  - id: openwiki-source-c72ee53c66b83fbe248c4854
    resource: repo://apps/desktop/src/main/reviewPreview.ts
  - id: openwiki-source-ee67360b547d6559739a21c9
    resource: repo://apps/desktop/src/main/templates/starterModels.ts
  - id: openwiki-source-96631daa0b2c8e332a97ecb3
    resource: repo://apps/desktop/src/main/windows.ts
  - id: openwiki-source-e7883d7e0923e51ae8b6bf50
    resource: repo://apps/desktop/src/preload/index.ts
  - id: openwiki-source-6651f1ec072a303df17f1059
    resource: repo://apps/desktop/src/renderer/App.spec.tsx
  - id: openwiki-source-11fabacb6c2c8bcce85a2dd4
    resource: repo://apps/desktop/src/renderer/App.tsx
  - id: openwiki-source-22956292b0951fa33ef92a77
    resource: repo://apps/desktop/src/renderer/screens/DashboardScreen.tsx
  - id: openwiki-source-f0f06a0981a7ca97c510b44d
    resource: repo://apps/desktop/src/renderer/state/useEditorSession.ts
generated: { by: "pi", at: "2026-11-15T14:07:58.904Z" }
---

# 桌面宿主与项目生命周期

apps/desktop 是 Electron 可视化宿主（另有 apps/cli 终端应用）。main 持文件系统/进程资源，renderer 持 ModelSession；contextIsolation=true、nodeIntegration=false，preload 仅通过 contextBridge 暴露 typed evidenceAPI，不泄漏 fs/ipcRenderer。

## 启动与窗口

ready 后创建 recent-projects.json store，注册 Agent、项目、摄取、review、**drift**、delivery IPC，再同步 MCP client config、启动本地 bridge、成功后注册 MCP IPC，最后开 dashboard。配置同步失败降级空列表，bridge 启动失败写 stderr 并继续；before-quit 释放 Agent/bridge。macOS 使用 light theme、activate 在无窗口时重开 dashboard，其他平台 window-all-closed 退出。

同一 binary 带 --mcp-stdio 则不打开窗口、不读 store、不注册客户端，仅连接已运行 desktop socket；失败写 stderr/退出1。

Dashboard 1024×680（min900×600），editor1440×900（min1180×760），无框隐藏标题栏。Map 以 rootPath 去重 editor，重复打开 focus，closed 只清自己条目；MCP 取 Map 首窗而非 focus 顺序。hash routing 支持 dev URL 与 packaged file：#/editor?rootPath=encoded，其余回 dashboard，缺 root 明确错误。

Dashboard mount 同时读 recents/templates，模板数量来自真实构造；open 后更新 recent 再 openEditorWindow。blank 不重复作为 starter 卡。创建 dialog 可选目录或 Bundle save path；create 后开 editor。摄取 compile 也通过同一 store/createFromDocument 落地。

## Preload 合同

EvidenceDesktopApi 分 projects、agent、mcp、drift、ingestion、system；旧 simulation/replay group 已删除，也没有 interview branches API。projects 包含保存/变更通知、review 与 live/saved delivery；agent 负责会话、实时镜像、sensors、选区和补丁往返；mcp 负责状态/request/response/capture-mode；drift 只有 audit 和 trace picker。

请求多为 invoke，订阅均返回 unsubscribe；agent.respondPatch 和 mcp.respond 用单向 send 回答 main 发起请求。channel 名按 shared 模块统一。renderer tests 注入 evidenceAPI 假实现，不启动 Electron。

## 文件存储与源路径

ProjectStore 不缓存模型，open 每次读盘，save 写传入 document；recents 独立持久化，最多20条，按 root 去重，temp+rename，坏 recent 文件当空列表。

树项目要求 .evidence/fm/model.json；Bundle 以 *.evidence.json 识别，summary.kind=file、modelRoot=file。空初始模型允许 EMPTY_MODEL_ISSUE_CODE；其他无实体不可读来源列出错误。create 从模板/名称生成模型 ID，文件目标补扩展名；已有 Bundle 或 model manifest 明确拒绝覆盖，只在成功写出后加入 recent。

save Bundle 用 writeModelBundle，保留 readme 和内联 examples（无旧 validation）；树用 writeModelDirectory。返回 written/unchanged/removed 与 savedAt，同内容不重写、缺失对象删除，保持 Git 低 churn。fingerprint 是源文件路径+内容（或 Bundle 字节）的 sha1，空/缺失为 null；不是 renderer API，也不同于 review 的 sha256 指纹。

modelSource.ts 统一：树 modelSourceOf=<root>/.evidence/fm、projectDirectoryOf=root；Bundle source=file、directory=parent。所有导出/监控/运行时应复用它，不往 Bundle 路径下拼目录。

## Chokidar 监控是提示，不是静默替换

打开/创建按 WebContents id 建立 watcher，新 open 关闭旧 watcher，窗口销毁释放。现在 watchModelSource 使用 **Chokidar v4 实际路径**，不是旧三个 non-recursive fs.watch：

- 从 target parent 向上找最近存在祖先，能发现初次保存、根目录删除/重建。
- 剪枝到 model.json 与 entities/relationships/rules 内 JSON（可嵌套），忽略生成物、README、旧 validation 和无关 sibling。
- Bundle 监视 parent 但仅接收目标文件，支持反复 atomic rename-save。
- ignoreInitial、不跟 symlink、atomic、awaitWriteFinish（150ms稳定/50ms轮询），再默认200ms合批；paths 去重排序。
- ready promise 表示初始发现完成；error 仅警告降级；close 取消 timer、清 pending、await 底层 close，之后不得通知。

projectIpc 将 {rootPath,changedAt,paths} 送 evidence:project:changed；renderer 只记 externalChangeAt 并提示重新加载。reloadFromDisk 明确 projects.open，绝不在有未保存工作时偷偷替换画布。

## 主进程服务边界

review preview 用实时 document + disk fingerprint 检查，不写盘，安装 assets 渲染；正式 export 从 saved 来源，diff 先选 Bundle baseline、再 save path，取消不生成，联合 API 推导顶层 scope。preview 前后磁盘变化拒绝混合快照。

Delivery live pair 分析显式 revision；export 在 async picker 前冻结，校验 expectedModelDigest/零 blocking，附 draft-status.json 的 releaseAuthorized=false；saved pair 重新读磁盘。都返回 saved/cancelled/failed。

Drift IPC 在 main 读 trace JSON，lazy import DriftService（测试可注入），对 saved 模型 audit；dispose 移除 audit/picker 两 handler，已无 replay。摄取可选模型 reader 和规则 fallback，compile 拒绝空实体，再写项目/开窗。

Agent runtime 按 root single-flight，绑定创建窗口，补丁发 renderer UUID/15秒往返，关窗立即失败并释放 runtime。MCP 同一 WebContents 回答模型和截图矩形，status 推送所有窗口并可拉取，见专页。

## 验证入口

projectStore specs 保护树/Bundle/空项目、覆盖拒绝、幂等保存、recent 和摘要；modelWatcher specs 保护初始静默、嵌套/缺根/重建、合批、atomic Bundle、多余 sibling 与 close。App tests 保护 hash；review/delivery/drift/ingestion IPC specs 通过注入 dialog/service 保护生命周期与取消，integration specs 验证真实树往返。

相关：[renderer 会话](./renderer-state.md) · [源格式](../model/source-formats.md) · [构建资源](../operations/build-and-package.md) · [MCP](../agents/mcp-integration.md)
