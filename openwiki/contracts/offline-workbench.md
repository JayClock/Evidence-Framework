---
type: contract
title: 离线工作台退役与迁移
description: 旧 HTML 工作台与 review 入口退役后，如何使用原生桌面交付中心和统一 CLI 审查模型与契约。
tags: [migration, desktop, delivery, cli, review]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-20T12:30:09.424Z
sources:
  - id: openwiki-source-69d58f985d20203ea0c2f899
    resource: repo://apps/cli/src/router.ts
  - id: openwiki-source-c8d6c908e749a45544b1e625
    resource: repo://apps/desktop/src/main/deliveryIpc.ts
  - id: openwiki-source-5d33672c45ec58cd29dce507
    resource: repo://apps/desktop/src/main/main.ts
  - id: openwiki-source-9459ee1a8fc917f2d94619ce
    resource: repo://apps/desktop/src/renderer/screens/EditorScreen.tsx
  - id: openwiki-source-32df59b611c02b85d275991a
    resource: repo://libs/desktop/feature-delivery/src/state/useDeliveryHub.ts
  - id: openwiki-source-40275cb92c3610938f16ade3
    resource: repo://pnpm-workspace.yaml
generated: { by: "pi", at: "2026-11-20T12:30:09.424Z" }
---

# 离线工作台退役与当前审查入口

旧 `evidence-visualization` 单文件 HTML 工作台、`evidence review` 命令及桌面 review preview/export IPC 已移除。本页保留为旧链接的迁移入口；旧页面的 CSP、资源发现和发布所有权约定不再描述当前可运行的功能。

当前桌面用原生画布、Inspector、问题面板、故事和交付中心审查实时 ModelSession。画布布局由共享 canvas-interaction/ELK 计算；交付中心比较编辑器打开时的 baseline 与当前文档，展示业务 URI、服务所有权、HAL 契约和原生 oasdiff 变化。

终端使用统一 `evidence`：`check` 验证模型，`export` 导出 OpenAPI 与 Bruno 集合，`test` 以生成的集合目录为输入，对真实 HTTP 服务验收，`diff` 比较最终契约。不存在新的 HTML 发布命令替代旧 workbench。

交付中心的 live preview 分析 renderer 提供的当前/基线文档；live export 在目录选择前冻结并分析快照，校验预览的 modelDigest，写出与工作区文件预览一致的产物，包括 `api-changes.md` 与 `draft-status.json`。draft-status 明示 `releaseAuthorized: false`，可审查草稿不等于发布批准。saved preview/export 则重新读取磁盘来源。

相关：[桌面工作区](../desktop/workspace-surfaces.md) · [画布与 Inspector](../desktop/canvas-and-inspector.md) · [交付与差异](./delivery-routes-and-diff.md) · [CLI 工作流](../workflows/cli-governance.md)
