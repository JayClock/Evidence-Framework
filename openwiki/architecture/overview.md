---
type: architecture
title: 系统架构与依赖边界
description: 两个应用宿主与十八个共享库如何围绕 FM 文档协作，以及 Zod、原生 CEL、Immer、ELK 和 Node I/O 的职责与依赖方向。
tags: [architecture, workspace, dependencies, nx, data-flow, monorepo]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-17T07:06:17.114Z
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-5466111549d3bdae4dce66a7
    resource: repo://apps/cli/package.json
  - id: openwiki-source-55138c775f581f8c989ca7dc
    resource: repo://apps/desktop/src/main/agentRuntime.ts
  - id: openwiki-source-5d33672c45ec58cd29dce507
    resource: repo://apps/desktop/src/main/main.ts
  - id: openwiki-source-f278221a7db6307920fce03f
    resource: repo://apps/desktop/src/main/mcpRequestHandler.ts
  - id: openwiki-source-9459ee1a8fc917f2d94619ce
    resource: repo://apps/desktop/src/renderer/screens/EditorScreen.tsx
  - id: openwiki-source-f0f06a0981a7ca97c510b44d
    resource: repo://apps/desktop/src/renderer/state/useEditorSession.ts
  - id: openwiki-source-b5ea8c8713a5b04ee1c21d2d
    resource: repo://apps/desktop/vite.main.config.mjs
  - id: openwiki-source-15aba07b973e26bd886a7db3
    resource: repo://apps/desktop/vitest.config.mts
  - id: openwiki-source-18fab4844d8695b257bd644b
    resource: repo://docs/workspace-layout.md
  - id: openwiki-source-0c1cc5dc86ad401eb9678504
    resource: repo://ENVIRONMENT.md
  - id: openwiki-source-2fda883e9b76745f69f487f7
    resource: repo://eslint.config.mjs
  - id: openwiki-source-3487fdf20c88f517d0a744eb
    resource: repo://libs/evidence-acceptance/package.json
  - id: openwiki-source-100de7a731086244071952a9
    resource: repo://libs/evidence-agent/package.json
  - id: openwiki-source-9d54a30ae7fe8603951dd3dd
    resource: repo://libs/evidence-agent/src/browser.ts
  - id: openwiki-source-a51a313ecc5551e788fbf06c
    resource: repo://libs/evidence-agent/src/sensors/native/nativeStageGate.ts
  - id: openwiki-source-ebeef9d445379fe3773732df
    resource: repo://libs/evidence-agent/src/sensors/sensorsEngine.ts
  - id: openwiki-source-d411e4580a06325c2c5fcf75
    resource: repo://libs/evidence-api/src/adapter/fmAdapter.ts
  - id: openwiki-source-7dad3c227e7d6e118c34b56a
    resource: repo://libs/evidence-api/src/projector.ts
  - id: openwiki-source-d3aaf211f80d2af88a870c87
    resource: repo://libs/evidence-api/src/types.ts
  - id: openwiki-source-7c4f607b2d42287b8ffedc0c
    resource: repo://libs/evidence-model-core/package.json
  - id: openwiki-source-b4abb2821db0f045818014a1
    resource: repo://libs/evidence-model-core/src/session/createModelSession.ts
  - id: openwiki-source-bcadd1e63a7d140ce717e9ea
    resource: repo://libs/evidence-model-io/package.json
  - id: openwiki-source-4fa503355d9f3a8084bea718
    resource: repo://libs/evidence-model-io/src/adapters/modelRoot.ts
  - id: openwiki-source-dd948eb74e58734da3b37ea9
    resource: repo://libs/evidence-schema/package.json
  - id: openwiki-source-52858d6130375e8776a048e7
    resource: repo://libs/evidence-schema/src/ast/document.ts
  - id: openwiki-source-2d798afa87a0b2d7dccd51cb
    resource: repo://libs/evidence-tools/package.json
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-40275cb92c3610938f16ade3
    resource: repo://pnpm-workspace.yaml
  - id: openwiki-source-ad6afd03545cc41ebdb6326a
    resource: repo://tools/oasdiff/setup.mjs
  - id: openwiki-source-d8dbf281c85f8a886745ac24
    resource: repo://tools/workspace-rules/boundary-drill.mjs
  - id: openwiki-source-df1e4d0dc0a35c64fd0e652b
    resource: repo://tsconfig.base.json
  - id: openwiki-source-98d5ddb014a0fd4d678f6f2a
    resource: repo://tsconfig.json
generated: { by: "codex", at: "2026-11-17T07:06:17.114Z" }
---

# 系统架构与依赖边界

Evidence 的真相源是 `DomainModelDocument`：manifest、entities、relationships、rules。桌面实时编辑与磁盘模型是同一契约的不同时间快照，而不是两套领域语言。当前 workspace 有 **apps/desktop 和 apps/cli 两个应用**，九个 evidence 库和九个 desktop 库；旧说明中的“只有一个应用”已过时。

## 责任与依赖方向

| 层 | 所有者及关键机制 |
| --- | --- |
| schema/universal | evidence-schema：Zod FM v5 AST、语法与跨对象 refinement、稳定 FM 诊断、工具输入、canonical JSON；依赖 zod、fast-json-stable-stringify、tslib，不依赖工作区上层 |
| domain/universal | model-core：图、guarded draft mutations、Immer 会话/历史、RFC 6902、原生 cel-js、追溯和静态 FM 检查；同步 SHA-256 使用 noble/hashes |
| domain/universal | canvas-interaction：headless async ELK 布局、模型/ELK 适配、可序列化布局和作用域，不持有 DOM/React Flow 视口 |
| io/node | model-io：源树/Bundle 发现、字节摘要、读写、pack/unpack 及共享模型命令 |
| projection | evidence-api：模型与可选 overlay → v6 路由、HAL、服务、OpenAPI、部署；不依赖 acceptance |
| projection/node | acceptance：消费 API，编译内联样例、导出 Step CI/Hurl、运行 HTTP 验收、drift 和原生 oasdiff |
| domain/universal | evidence-tools：Pi/MCP 共用的 guarded patch/recipe registry |
| orchestration/node | agent：Pi session、提示词、Zod 工具、传感器、门禁、治理和 trace reader；browser 子入口提供纯数据合同 |
| orchestration/node | mcp：外部工具与本地桥，不依赖 agent 或 visualization；二者在桌面宿主相遇 |
| ui/feature/browser | desktop-contracts 与 ui-kit、canvas/inspector/story/delivery/drift/agent features；testing 为独立支持库 |
| app | desktop 组合 Electron/React 工作台；cli 组合共享库命令，使用 cac 注册参数，不复制领域规则 |

旧 evidence-agent-core/modeling-orchestrator 已合并。库不能反向依赖 app；acceptance 可消费 api，api 不可依赖 acceptance；共享工具不依赖 SDK 适配器。

## 构建与依赖合同

运行时依赖在实际 importer 的 package.json 声明，工作区边使用 workspace:*；根只放开发工具。pnpm hoisted linker 可能掩盖缺失声明，因此 Nx dependency-checks 与 enforce-module-boundaries 是必要门禁。

ESLint 同时约束 type、layer、platform、scope：universal 只能引用 universal；browser 只允许 browser/universal 或明确 browser-safe 表面，禁直接引用 Electron、MCP SDK、Pi SDK。schema 不得依赖投影，evidence 不得依赖 desktop/testing。

库 export 的 `@evidence-poc/source` 条件指向 src，tsconfig customConditions、Vite/Vitest resolve.conditions 必须一致；遗漏会退到 dist，出现未构建模块错误。agent/api 的 browser 子入口、model-core/testing、各命令入口延续此合同。根 tsconfig 引用十八库及 cli；desktop 继续由自己的 Forge/typecheck target 检查。

## 从建模到交付

1. `.evidence/fm/` 源树或 `*.evidence.json` Bundle 经 model-io 加载，core 规范化为同一文档。generated/cache/dot 内容不作为源；旧 validation Scenario/Instance 已撤除。
2. renderer ModelSession 用 `mutate(recipe)` 或 `applyPatchBatch` 原子变更，维护选择、撤销/重做与惰性图；Agent/MCP 补丁也进同一 renderer 会话。
3. 静态检查以 Zod strict + semantics、CEL 和 scoped completeness 给出 FM check v6；内联 examples 提供 CEL 编译期 oracle，不代表真实 HTTP 成功。
4. API 投影生成 draft snapshot，携带 model/design/check-report digest、排序诊断和 limitations。固定 check 报告失效或摘要过期成为显式 gap，不抹掉草稿可见性；正式交付再要求门禁。
5. Stage gate 消费 v6 报告，要求一致、完整、有效、输入未变化、无 errors/gaps 且覆盖非空 scope；API 目标还重新投影检查和比摘要。
6. CLI 导出 OpenAPI + Step CI/Hurl，再对真实后端 HTTP 验收；旧 evidence-visualization 与离线 workbench 已撤除。

## 两个宿主与进程边界

桌面 main 注册项目、摄取、AI、drift、delivery、Agent IPC，创建 Agent runtime 与 MCP bridge。`--mcp-stdio` 是同一可执行文件的无窗口代理模式，转发到已运行桌面，不读取项目存储。preload 暴露 typed EvidenceDesktopApi，renderer 不拿 fs/ipcRenderer。

renderer 拥有实时会话、异步布局与 UI；main 执行 Node 文件操作、传感器、交付和 trace。saved 导出描述磁盘来源；live delivery export 冻结预览快照并校验摘要，不能混淆。

cli 是唯一推荐终端入口：check、pack/unpack/compile/inspect/lineage、export/test/diff 和兼容 api 子命令。旧 evidence-model/api bin 暂留为 stderr 弃用 shim，执行库内共享逻辑，不反向依赖 cli app。

## 一套工具链，不是一切都在 JS 内

Node.js 22 + pnpm 是唯一仓库开发工具链；模型引擎、检查、投影和生成器为 TypeScript，无 Python/Go 解释器要求。但契约比较确实执行固定原生 **oasdiff**：`pnpm install` 后另跑 `pnpm api:setup`，无需 Go/Docker。测试后端的多语言示例只是接入参考，不是新增运行时。

## 深入入口

- [源格式](../model/source-formats.md) · [模型事务](../model/commands-and-session.md)
- [FM 语言](../language/fm-dsl.md) · [静态与 CEL](../model/checks-and-simulation.md)
- [桌面会话](../desktop/renderer-state.md) · [画布](../desktop/canvas-and-inspector.md)
- [传感器](../agents/sensor-orchestration.md) · [MCP](../agents/mcp-integration.md)
- [API](../contracts/api-projection.md)
- [CLI 工作流](../workflows/cli-governance.md) · [构建](../operations/build-and-package.md)
