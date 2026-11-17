---
type: testing
title: 测试边界与验证策略
description: 按改动范围在 Vitest 多项目、注入式夹具与真实进程 e2e 之间选择最窄验证，并说明 desktop 共享夹具、oasdiff 安装前提与 CI 双门禁。
tags: [testing, vitest, fixtures, injection, desktop, cli, acceptance, oasdiff]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-16T23:54:38.352Z
sources:
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-17a7254439d5e92a919764bb
    resource: repo://.github/workflows/evidence-governance.yml
  - id: openwiki-source-5466111549d3bdae4dce66a7
    resource: repo://apps/cli/package.json
  - id: openwiki-source-bc7b6b74cfa83600f7da0929
    resource: repo://apps/cli/tests/cli.e2e.spec.ts
  - id: openwiki-source-02a26c76270021edd7d42c0b
    resource: repo://apps/cli/tests/governance.e2e.spec.ts
  - id: openwiki-source-bd419873501c28f93dc23d21
    resource: repo://apps/desktop/package.json
  - id: openwiki-source-f85ce0e3a462797434d822a8
    resource: repo://apps/desktop/src/main/agentIpcHandlers.ts
  - id: openwiki-source-fe198b09c0b1eeb6a6ebe4d9
    resource: repo://apps/desktop/src/main/agentRuntime.spec.ts
  - id: openwiki-source-55138c775f581f8c989ca7dc
    resource: repo://apps/desktop/src/main/agentRuntime.ts
  - id: openwiki-source-22e5a1c5bf9c17bde5844023
    resource: repo://apps/desktop/src/renderer/test-setup.ts
  - id: openwiki-source-5a8bb195f6c36951b548492b
    resource: repo://apps/desktop/tests/integration.spec.ts
  - id: openwiki-source-47ca9da7961156aadbba9a5c
    resource: repo://apps/desktop/tests/phase-3-loop.spec.ts
  - id: openwiki-source-15aba07b973e26bd886a7db3
    resource: repo://apps/desktop/vitest.config.mts
  - id: openwiki-source-af477b8a3e3d3695b6300a12
    resource: repo://libs/desktop/feature-agent/src/state/usePatchReview.spec.tsx
  - id: openwiki-source-690529fdca44c81ae6adf1f9
    resource: repo://libs/desktop/feature-agent/vite.config.mts
  - id: openwiki-source-edc991b2100ea4e9efee0580
    resource: repo://libs/desktop/testing/package.json
  - id: openwiki-source-cf894537783228da51991c0d
    resource: repo://libs/desktop/testing/README.md
  - id: openwiki-source-29536c90f762c67d4e41b9c9
    resource: repo://libs/desktop/testing/src/desktopApi.ts
  - id: openwiki-source-791c5463a50a2ee7b53d74ac
    resource: repo://libs/desktop/testing/src/index.ts
  - id: openwiki-source-9217799fd2ecf02b1a568ae2
    resource: repo://libs/desktop/testing/src/liveDelivery.ts
  - id: openwiki-source-ffac4daf9ed60f616acc7f42
    resource: repo://libs/desktop/testing/src/story.ts
  - id: openwiki-source-286f209cd8559a2a87975703
    resource: repo://libs/desktop/testing/vitest.setup.ts
  - id: openwiki-source-3487fdf20c88f517d0a744eb
    resource: repo://libs/evidence-acceptance/package.json
  - id: openwiki-source-87c8cacafc41063592c13c80
    resource: repo://libs/evidence-acceptance/src/acceptance.e2e.spec.ts
  - id: openwiki-source-b08ff43cedd6cc1e612c288f
    resource: repo://libs/evidence-acceptance/src/diff/oasdiffRunner.spec.ts
  - id: openwiki-source-d7e13f22c3acec1fe75d3f7c
    resource: repo://libs/evidence-acceptance/src/diff/oasdiffRunner.ts
  - id: openwiki-source-a905a355f408774f2cb0edc5
    resource: repo://libs/evidence-agent/src/session/evidenceAgentSession.ts
  - id: openwiki-source-2050d152180fc886e9fc0d4f
    resource: repo://libs/evidence-api/src/testing/fixtures.ts
  - id: openwiki-source-1370a1a61b4f506fc0953cbf
    resource: repo://libs/evidence-api/tests/fixtures/full-lifecycle/README.md
  - id: openwiki-source-734e51ec98bcb854abf097d0
    resource: repo://libs/evidence-api/tests/fixtures/README.md
  - id: openwiki-source-761175c9daae6ba4b731889e
    resource: repo://libs/evidence-mcp/src/bridge/bridge.spec.ts
  - id: openwiki-source-36b616eafb8331e3eddb8d31
    resource: repo://libs/evidence-model-core/src/purity.spec.ts
  - id: openwiki-source-65aecc4d0c320b921968555c
    resource: repo://libs/evidence-model-core/src/validation/fmCheck.spec.ts
  - id: openwiki-source-d72e0b169ed5313d27b92071
    resource: repo://libs/evidence-model-core/tests/fixtures/README.md
  - id: openwiki-source-2195e5025de151b6fc80d592
    resource: repo://libs/evidence-schema/tests/fixtures/README.md
  - id: openwiki-source-6ba748254f38112b13d529da
    resource: repo://nx.json
  - id: openwiki-source-ad6afd03545cc41ebdb6326a
    resource: repo://tools/oasdiff/setup.mjs
  - id: openwiki-source-d8dbf281c85f8a886745ac24
    resource: repo://tools/workspace-rules/boundary-drill.mjs
  - id: openwiki-source-b58f839a189d87a7e1f37d39
    resource: repo://vitest.config.mts
generated: { by: "openwiki/0.9.0", at: "2026-11-16T23:54:38.352Z" }
---

# 测试边界与验证策略

优先验证被改变的行为，不为文档更新或无关改动跑全仓。源码与测试是权威；“读过测试”不等于“已执行通过”，一次绿灯也不等于当时的能力仍然可用。本页是测试地图与选型规则，不是永久有效的 CI 绿灯证明。

## 运行环境与项目划分

Node 22 / pnpm 12.16.1。`pnpm install --frozen-lockfile` 之后，凡涉及 API 兼容性判断先跑 `pnpm api:setup`。根 `vitest.config.mts` 只做项目发现：把工作区里除根配置以外的 `vite.config.*` 与 `vitest.config.*` 都当作 project，因此每个包的环境、setup 与解析条件由它自己的配置决定。

- **node 项目**：cli、evidence-model-core、evidence-acceptance 等使用 `environment: 'node'`，解析条件显式写 `['@evidence-poc/source', 'node', 'import', 'default']`。
- **desktop 应用**：`apps/desktop/vitest.config.mts` 故意只有一个 project（`@evidence-poc/desktop`），环境是 `jsdom`，`include` 覆盖 `src/renderer/**/*.spec.{ts,tsx}`、`src/main/**/*.spec.ts` 与 `tests/**/*.spec.ts`，`setupFiles` 指向 `src/renderer/test-setup.ts`。React 测试要 DOM，而 store 测试只用 jsdom 里依然可用的 Node API，所以不拆两个 project。
- **desktop feature 库**：每个库用 `vite.config.mts` 自带 project（如 `desktop-feature-agent`），同样 jsdom，但 `setupFiles` 指向共享的 `../testing/vitest.setup.ts`。
- **`@evidence-poc/source` 条件**：desktop 与 feature 库的 `resolve.conditions` 走源码导出（`@evidence-poc/source`、`module`、`browser`），node 项目走 node/import；`tsconfig.base.json` 的 `customConditions` 与 `vite.*.config.mjs` 必须保持一致，否则测试解析到的产物与构建解析到的产物不是同一份。
- **Nx**：`@nx/vitest` 插件推导 `test` / `test-ci` 目标（默认 watch 模式），`targetDefaults.test` 依赖 `^build`。cli 的 `test` 额外依赖自己的 `build`，因为 e2e 直接 `execFile` 跑 `apps/cli/dist/cli.js`；cli、desktop、evidence-acceptance 的 `test` 都设了 `cache: false`——这些套件会起进程、占端口、读真实二进制，缓存命中的绿灯不能当作证据。

```bash
# 单文件：路径相对该 config 的 root
pnpm exec vitest run --config libs/evidence-model-core/vitest.config.mts src/session/jsonPatches.spec.ts

# 按 project 名筛选（名字来自各 config 的 test.name）
pnpm exec vitest run --project evidence-api

# 交给 Nx 处理依赖与构建
pnpm nx test cli
pnpm nx test desktop
pnpm nx affected -t lint typecheck test
```

不确定 project 名时先读对应 config，不要猜旧的 scoped 名称。

## 按改动范围选最窄 target

经验规则：先定位“这个行为由哪个包的契约承诺”，再选该包最小的 spec；只有当改动跨过进程边界（dist、socket、HTTP、真实二进制）时才升到 e2e。全量 `pnpm nx run-many --target=test --all` 只属于往 main 推送或横切契约改动的场景，不是日常默认动作。

| 行为 | 代表测试 | 保护什么 |
| --- | --- | --- |
| FM 语法/语义 | `evidence-schema` 的 `strictValidate` / `zodPipeline` / `exampleTest` | strict unions/refinements、稳定 code/path/objectId、未知字段与 legacy 拒绝、输入不被突变 |
| 模型编辑 | `evidence-model-core` 的 `mutations/*`、`session/createModelSession`、`session/jsonPatches` | guarded red lines、原子失败/no-op、forward/inverse 历史、结果 snapshot、RFC6901/6902 安全 |
| CEL/lineage/oracle | `celEvaluator` / `celAnalysis` / `transientSandbox`、`traceability` / `fmCheck` | native scoped AST、macro shadowing、精确 int64/uint64、显式 `asOf`、typed/JSON 边界 |
| headless 布局 | `evidence-canvas-interaction` 的 `engine/layoutEngine`、`adapter/elkToLayout`、`layout/serializable` | compound/空 Context/cycle、container 偏移与 section 连接、pair routes、不改源文档 |
| 画布/Inspector | `feature-canvas`（`CanvasViewport`、`useReactFlowAdapter`）、`feature-inspector`（`RightInspector` 与 CEL 子目录） | local/world 一致、早期 handles、scope/diagnostics/token、单批 undo、原生 CEL 诊断 |
| 文件与发现 | `evidence-model-io` 的 `adapters/*` 与 `legacyRemoval`、desktop `projectStore` / `modelWatcher` | tree/Bundle/readme/examples、幂等 save 与 canonical unpack、旧 validation 拒绝、atomic-save/root-rebuild/close |
| 桥与竞态 | `evidence-mcp` 的 `bridge.spec`、`feature-agent` 的 `useAgentPatchBridge` / `usePatchReview`、`useGraphLayout` / `useDeliveryHub` | 同步 revision、旧 reply 丢弃、ack 顺序、超时、冻结 export、过期 review 不撤后续工作 |
| API 与兼容性 | `evidence-api` 的 `projection` / `openapi` / `renderer/outputRenderer`、`evidence-acceptance` 的 `breakingScenarios` / `oasdiffRunner`、cli 的 `diff api` | 最终 contract 与 overlay、schema/consumer types、稳定 bytes/manifest、原生工具的错误闭合 |
| HTTP 验收 | `acceptance.e2e`、`runner/suiteSelection`、cli `governance.e2e` | 真实 SUT、derived 断言、依赖 closure、regression/dod、drift、退出码与报告 |
| 打包与旧入口 | cli `model-commands.e2e`、`legacy-shims.e2e`、`story-command.e2e` | pack/unpack/inspect 在调用者 cwd 的往返、废弃 bin 仍可执行且 stdout 是合法 JSON、无 AI 的故事投影 |

## 三类证据不要混用

**1）注入依赖的单元测试**——被测层自己的合同，靠替换昂贵的外部实现来隔离：

- `apps/desktop/src/main/agentRuntime.spec.ts` 注入 `transport`、`sensors` 与 `sessionFactory`，验证“用最新未保存文档、保留第一个 baseline、丢弃过期 run”（L163）、编辑后的防抖检查（L303）、把画布选区交给工具（L329）、以及渲染进程裁决回传给工具（L362），完全不碰真实模型。
- `agentIpcHandlers.ts` 暴露 `createRuntime` 与 `patchTimeoutMs` 作为测试注入口（`AgentIpcOptions`），使 IPC 层可以在没有真实 runtime 的情况下被驱动。
- `usePatchReview.spec.tsx` 用真实 `ModelSession` 加 `installDesktopApi()` 的脚本化 `window.evidenceAPI`，验证 patch 的 added/modified/removed 命名、accept/revert 语义，以及“后续编辑落地后 revertable 变为 false”的不变量。
- `evidenceAgentSession.ts` 把 Pi SDK 收窄成 `PiSdkPort`（L13-L34）后注入，因此会话测试不需要模型凭据，也不需要真实磁盘上的 Pi 安装。

**2）真实 socket / SUT / 二进制的 e2e**——证明“离了替身也成立”：

- `libs/evidence-mcp/src/bridge/bridge.spec.ts` 在 `tmpdir()` 里开真实 Unix socket（Windows 上是命名管道），验证 socket 权限 `0o600`、无监听时返回 `isRunning: false` 与 `APP_NOT_RUNNING`、错误码透传、关闭后可复用端点。
- `libs/evidence-acceptance/src/acceptance.e2e.spec.ts` 先 `export-tests` 生成 suite，再 `spawn` `examples/acceptance/backend.mjs --port 0 --fault <fault>`，用官方 `@stepci/runner` 执行。故障开关 `amount` / `accept-derived` / `clock` / `extra-field` 各让一条断言变红，证明 derived 断言与 schema 校验真的会失败，而不是永远绿。
- `apps/cli/tests/cli.e2e.spec.ts` 跑构建产物 `apps/cli/dist/cli.js`，配合 `examples/dogfood-backend/server.mjs` 完成 check → export → 真实 HTTP 验收 → `diff api`；`model-commands.e2e` 与 `legacy-shims.e2e` 同样只针对 dist。
- `apps/cli/tests/governance.e2e.spec.ts` 用 v1/v2 两种后端与故障矩阵验证：v1 regression 绿、dod 红并落 `reports/dod.md` / `reports/dod.xml`、`--allow-pending` 只把结果标成 pending 而不假装通过、v2 两个 gate 在 `--strict-drift` 下绿、`--filter`/`--tag` 保留依赖闭包。

**3）构建边界验证**——证明代码能被打进某个运行面，而不是“在 jsdom 里能过”：

- `libs/evidence-model-core/src/purity.spec.ts` 用 Vite `build()`（`write: false`）加 browser 解析条件和 `reject-node-builtins` 插件，导入 model-core 入口；任何 `node:` 内建或内建模块都会让构建抛错。这是 model-core 可被渲染进程复用的证据。
- `tools/workspace-rules/boundary-drill.mjs` 反向验证 lint 约束：它为每条规则临时写出真实会被拒绝的 import（7 个用例），跑 `nx lint <project> --skip-nx-cache`，要求失败信息里出现预期片段，最后在 `finally` 里删除探针。通过的 lint 本身不是证据，被拒绝的 import 才是。

模拟其他层只为隔离当前层。拿 fake transport 或 fake runner 的绿灯去宣布“真实 HTTP / 真实 oasdiff 已验证”是错的。

## 共享桌面夹具与注入式 API

`libs/desktop/testing` 是 desktop 应用与 feature 库共用的测试专用包（不进产物），通过子路径导出，避免每个库各存一份：

- `@evidence-poc/desktop-testing` → `createDesktopFixture()`：紧凑的双 Context 模型（采购方/供应方角色、参与方、合同/请求/确认），所有 renderer 测试渲染同一份文档，夹具不会在项目之间漂移。
- `@evidence-poc/desktop-testing/desktopApi` → `installDesktopApi()`、`projectSummary()`、`healthyReport()`、`defaultTemplates()`。`installDesktopApi` 安装脚本化的 `window.evidenceAPI` 并返回调用日志、`agentMock`（emitEvent / emitReport / requestPatch / patchResponses / canvasContexts）与 `mcpMock`，所以组件测试从不触碰 Electron IPC，也不需要真实 socket。
- `@evidence-poc/desktop-testing/liveDelivery` → `liveDeliveryPreview(revision, preview)`：合成 `LiveDeliveryPreview`（digest、openapi、diff、changeLog、apiSummary），供交付面板与 `useDeliveryHub` 使用。
- `@evidence-poc/desktop-testing/story` → `storyFlow()` / `storyResult()`：构造带 gaps、`basedOn`、`asOf` 的场景轨迹与故事投影，供故事播放与 `EditorScreen` 使用。
- `libs/desktop/testing/vitest.setup.ts`：feature 库共用的 jsdom polyfill（`ResizeObserver`、`scrollIntoView`、pointer capture、仅 scale 的 `DOMMatrixReadOnly`）加 Testing Library `cleanup()`。`apps/desktop` 自己那份 `src/renderer/test-setup.ts` 做同一组桩，但它的 `ResizeObserver` 会以 1200×640 回调一次，让画布在测试里有尺寸可测。

旧路径已经不存在：`apps/desktop/src/renderer/test-support/desktopApi.ts` 与 `apps/desktop/tests/phase-4-review-loop.spec.ts` 均已移除。渲染进程与审查回路的测试现在分布在 `apps/desktop/src/renderer/**/*.spec.tsx` 和 `libs/desktop/feature-*` 的 spec 中，任何“phase-4 套件”的说法都应改指这些位置。

## 桌面组合回路

`apps/desktop/tests/integration.spec.ts` 把 `libs/evidence-schema/tests/fixtures/product-procurement` 复制进临时 `.evidence/fm`：parse 后 `issues` 为空、`strictValidateDomainModel` 通过；每个 Context 生成几何、每个 fulfillment pair 至少两点；hover 请求得到 dimmed 与相邻 node/edge/context；真实 `projectStore` 连续两次 save，第二次 `written`/`removed` 都为空；50 次 mutation 后 50 次 undo 回到原文档；编辑后再 save 字节不变且仍可 reparse。

`apps/desktop/tests/phase-3-loop.spec.ts` 把真实 `createAgentRuntime`、fake Pi 会话、注入 transport 和真实 `ModelSession` 串起来：工具表恰好注册 11 个（`get_api_diff`、`sync_api_projection`、`run_sensors`、`apply_model_patch`、`get_canvas_selection`、`annotate_contract_clauses`、`read_service_blueprint`、`introduce_fulfillment_pair`、`add_breach_compensation`、`roleify_and_invert_dependency`、`isolate_domain_calculator`），RFC6902 补丁经 transport 回到会话后可一步 undo；另一条用例只用 in-process `createSensorsEngine().runFullSensors` 证明没有解释器时 `unavailableSensors` 仍为空、`fmCheck.valid` 为真、key data 有内容。整个过程不启动真实 LLM、Electron 或模型凭据。

## CLI / acceptance e2e 的前提：`api:setup` 与 uncached

`pnpm api:setup`（`tools/oasdiff/setup.mjs`）按平台下载并校验 sha256，把固定版本 `1.38.0` 装到 `node_modules/.cache/evidence/oasdiff/1.38.0/<platform>-<arch>/oasdiff`；`OasdiffRunner` 从自身模块目录逐级向上找这个缓存，找不到才退回 PATH 上的 `oasdiff`，并支持 `EVIDENCE_OASDIFF_BIN` 覆盖。CI 在跑测试之前执行 `pnpm api:setup`。

因此：

- cli e2e 与 governance e2e 里的 `diff api` 会真正执行已安装的原生二进制，没装工具时应视为环境未就绪，而不是“兼容性没问题”。
- `oasdiffRunner.spec.ts` 用 `vi.mock('node:util', ...)` 把 `promisify` 换成替身，只验证参数、隔离目录、超时、失败闭合与输出解析。它**不能**证明本机 oasdiff 可用；这条证据只存在于 cli/governance e2e。
- cli、desktop、evidence-acceptance 的 `test` 目标都设 `cache: false`，cli 还依赖自己的 `build`。用 Nx 缓存命中的输出宣称 e2e 通过，等于用上次的结果回答这次的问题。
- `evidence test` 是用户模型导出 suite 的 HTTP 验收，不是 Vitest 源码测试；空筛选、未执行、`--allow-pending` 的 pending 都不能当绿。细节见 [CLI 与治理工作流](../workflows/cli-governance.md)。

## Fixture 与摘要

- `libs/evidence-schema/tests/fixtures/product-procurement/` 是 `libs/evidence-api/tests/fixtures/full-lifecycle/fm` 的逐字快照（schema v5，商品采购全生命周期），复制而非引用，以便 API 侧演进时 schema/model-core 测试保持稳定。
- `libs/evidence-model-core/tests/fixtures/models/valid-traceable-subscription/` 是静态责任模型，两条派生链、一个 key data 决策待决；`invalid-missing-confirmation/` 是一致但不完整的模型。两个树的磁盘布局与真实 `.evidence/fm/` 一致，`readModelRoot` 按项目方式读取。
- `libs/evidence-api/tests/fixtures/full-lifecycle/fm/` 由适配器、CLI、交付与 OpenAPI 测试共用；纯内存多步演进构造器在 `libs/evidence-api/src/testing/procurement.ts`，测试从模型实时派生契约，不保存手写 API 设计或过期快照。
- `libs/evidence-api/src/testing/fixtures.ts` 的 `checkReportFor()` 走真实管线：`readModelRoot` + `readModelRootBytes` + `buildFmCheckReport` + `modelDigestOf`，所以测试拿到的是 `check_fm` 会给出的报告，而不是手写对象。
- 夹具纪律：永远不要为了让测试通过而手改夹具，克隆后改克隆；有意刷新时重新 pin 任何被断言的摘要。当前 schema 已无 `timelineSummary.sha256`，不要再要求旧 timeline pin；受保护的是 `modelDigestOf` 的格式、文件顺序无关性与输入字节变化（`fmCheck.spec.ts` 的 `modelDigestOf` 与 `inputChanged` 用例）。
- 可执行验收 examples 在 `examples/acceptance/`（`procurement`、`procurement-deposit`、`procurement-breach` 等），独立 SUT 是 `examples/dogfood-backend/server.mjs`（`--mode v1|v2`、`--fault ...` 与拦截器）；拦截器的 Node 版本由 `node --test examples/dogfood-backend/interceptors/node.test.mjs` 单独验证。

## 两个 CI 工作流与 boundary drill

`.github/workflows/ci.yml`（每次 push / PR）：`install --frozen-lockfile` → `pnpm api:setup` → `pnpm boundaries:drill` → PR 上 `nx affected --target=lint`、push 上 `nx run-many --target=lint --all` → `nx run-many --target=typecheck --all` → `nx run-many --target=test --all` → `nx build cli` 后 `evidence --help` / `--version` → `nx build desktop`。drill 会临时写入探针文件，必须在允许修改源码树的环境运行；不要在 wiki 生成这类只读循环里执行它。

`.github/workflows/evidence-governance.yml` 是产品门禁：`check` → `export --verify`（只读校验已提交产物）→ 从不可变 Git SHA 物化 baseline（`git cat-file`/`git show` 失败时绝不回退到当前模型伪造 baseline，首次引入模型时显式 bootstrap）→ `diff` 破坏性 gate 并输出 Markdown 摘要 → `regression` / `dod` 矩阵对隔离的 v2 SUT 以 `--strict-drift` 执行并保留 JSON/Markdown/JUnit。expected backend failure 与 DoD pending 不是同一种红，`--allow-pending` 的豁免也不能与真实通过混淆。

## 如何记录执行结果

每次改动选最窄 unit，必要时升一级 integration；需要 dist 就先 build，需要原生 diff 就先 setup。保留完整 stdout/stderr 与真实命令，不要只截 “1 failed”；同时写下“这次实际跑了哪些文件/项目”，因为本页列出的其余套件并不会随之执行。

相关：[构建与打包](../operations/build-and-package.md) · [CLI 与治理工作流](../workflows/cli-governance.md) · [传感器编排](../agents/sensor-orchestration.md) · [渲染进程状态](../desktop/renderer-state.md) · [架构总览](../architecture/overview.md)
