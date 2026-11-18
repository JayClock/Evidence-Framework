---
type: testing
title: 测试边界与验证策略
description: 按Zod契约、Immer事务、native CEL、ELK、Node I/O、桌面IPC与真实HTTP验收选择最窄测试，以及fixture、工具准备和CI双门禁的边界。
tags: [testing, vitest, fixtures, digests, injection, desktop, cli, acceptance]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-18T09:45:40.969Z
sources:
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-66c2ef915cc65b281496d068
    resource: repo://apps/cli/vitest.config.mts
  - id: openwiki-source-55138c775f581f8c989ca7dc
    resource: repo://apps/desktop/src/main/agentRuntime.ts
  - id: openwiki-source-c8d6c908e749a45544b1e625
    resource: repo://apps/desktop/src/main/deliveryIpc.ts
  - id: openwiki-source-5a8bb195f6c36951b548492b
    resource: repo://apps/desktop/tests/integration.spec.ts
  - id: openwiki-source-47ca9da7961156aadbba9a5c
    resource: repo://apps/desktop/tests/phase-3-loop.spec.ts
  - id: openwiki-source-15aba07b973e26bd886a7db3
    resource: repo://apps/desktop/vitest.config.mts
  - id: openwiki-source-634783f4e08965a7ab7ec587
    resource: repo://examples/b2b-escrow/implementations/ts-fastify/test/app.test.mjs
  - id: openwiki-source-29536c90f762c67d4e41b9c9
    resource: repo://libs/desktop/testing/src/desktopApi.ts
  - id: openwiki-source-6d71eb468fb1263201f30ef6
    resource: repo://libs/evidence-acceptance/README.md
  - id: openwiki-source-87c8cacafc41063592c13c80
    resource: repo://libs/evidence-acceptance/src/acceptance.e2e.spec.ts
  - id: openwiki-source-a905a355f408774f2cb0edc5
    resource: repo://libs/evidence-agent/src/session/evidenceAgentSession.ts
  - id: openwiki-source-062416ee8e7e3d6d3b09aaad
    resource: repo://libs/evidence-api/package.json
  - id: openwiki-source-48c413ac4f0282e1b0126f20
    resource: repo://libs/evidence-api/src/delivery/routes.spec.ts
  - id: openwiki-source-561a740200649f731d1630c1
    resource: repo://libs/evidence-api/src/openapi/openapi.spec.ts
  - id: openwiki-source-2050d152180fc886e9fc0d4f
    resource: repo://libs/evidence-api/src/testing/fixtures.ts
  - id: openwiki-source-65aecc4d0c320b921968555c
    resource: repo://libs/evidence-model-core/src/validation/fmCheck.spec.ts
  - id: openwiki-source-d72e0b169ed5313d27b92071
    resource: repo://libs/evidence-model-core/tests/fixtures/README.md
  - id: openwiki-source-6ba748254f38112b13d529da
    resource: repo://nx.json
  - id: openwiki-source-d8dbf281c85f8a886745ac24
    resource: repo://tools/workspace-rules/boundary-drill.mjs
  - id: openwiki-source-b58f839a189d87a7e1f37d39
    resource: repo://vitest.config.mts
generated: { by: "pi", at: "2026-11-18T09:45:40.969Z" }
---

# 测试边界与验证策略

优先验证改变的行为，不因文档更新一律跑全仓。源码/tests是权威；“读过测试”不等于“已执行通过”。本页是测试地图，不是永久最新CI绿灯证明。

## 工具与运行项目

Node22/pnpm12.16.1，install --frozen-lockfile后若涉及API compatibility先api:setup。Vitest root发现workspace config，CLI和核心库是node，desktop单jsdom项目包含 renderer/main/tests，features 的 tests 已移到各自库；Nx从Vitest推test与per-file目标、默认^build。cli target还依build，真实spawn测dist不能跳过构建。source condition须配置一致，model-core/cli已显式source+node。

```bash
pnpm exec vitest run --config libs/evidence-model-core/vitest.config.mts src/session/jsonPatches.spec.ts
pnpm exec nx test cli
pnpm exec nx test desktop
pnpm exec nx run-many -t typecheck lint --all
```

直接Vitest筛选路径须相对当前config root或传可匹配的repository路径；不确定name先读各config，不猜旧scoped project名。

## 按边界选最窄验证

| 行为 | 代表测试 | 保护什么 |
| --- | --- | --- |
| FM语法/语义 | schema strictValidate/zodPipeline/exampleTest | strict unions/refinements、稳定code/path/objectId、未知字段/legacy拒绝、无输入突变 |
| 模型编辑 | core mutations/*、session/createModelSession/jsonPatches | guarded red lines、原子失败/no-op、forward/inverse历史、结果snapshot、selection与RFC6901/6902安全 |
| CEL/lineage/oracle | celEvaluator/celAnalysis/transientSandbox、traceability/fmCheck | native scoped AST、macro shadowing、精确int64/uint64、显式asOf、typed/JSON边界、静态v6不冒充执行 |
| headless布局 | canvas engine/layoutEngine、adapter/elkToLayout、serializable | compound/空Context/cycle、container偏移/section连接、pair routes、密度/不改源 |
| 画布/Inspector | feature-canvas adapter/CanvasViewport、Inspector/CEL specs | local/world一致、早期handles、scope/diagnostics/token、单批undo、原生CEL诊断 |
| 文件与发现 | model-io adapters/legacyRemoval、desktop projectStore/modelWatcher | tree/Bundle/readme/examples、幂等save/canonical unpack、旧validation拒绝、atomic-save/root-rebuild/close |
| 桥与竞态 | Agent/MCP/runtime/useGraphLayout/useDeliveryHub |同步revision、旧reply丢弃、ack顺序、超时、冻结export、过期review不撤后续工作 |
| API与兼容性 | projection/openapi/outputRenderer、oasdiffRunner/breakingScenarios |最终contract/overlay、schema/consumer types、稳定bytes/manifest、原生工具版本/错误闭合 |
| HTTP验收 | `brunoRenderer.spec`、`acceptance.e2e`、`runner/suiteSelection`、`cli governance.e2e` | 固定 Bruno 对真实 SUT 执行；检查捕获、派生断言、双门禁、漂移、退出码与报告 |
| stories/来源/AI | flowAggregator/story/whatIf/journeyPreview、clauseTrace、aiConfig/safeStorage |声明 flow 与前缀隔离、结构化来源精确匹配、凭证隔离及模型切换 |

## 注入昂贵依赖，不伪造被测合同

PiSdkPort和runtime sessionFactory/sensors/transport让会话测试无需模型凭据；delivery/dialog 和 AI runtime 注入避免真实 OS 弹窗与模型调用。installDesktopApi是renderer channel log+Agent/MCP模拟器，UI不启动Electron。时钟/文件/engine可注入保证可复现。

并非一切都mock：bridge spec开真实Unix socket验证0600/超时/复用；oasdiff integration执行固定binary；HTTP e2e启动独立backend；旧离线 workbench/CDP suite 已撤除。模拟其他层只为隔离当前层，不能拿假的runner宣称真实HTTP已绿。

## Fixture与摘要

model-core valid-traceable-subscription现在是静态责任模型，两条派生链、一个key-data待决，无旧六instances/三scenarios；invalid-missing-confirmation一致但不完整。可执行 acceptance examples 在 examples/b2b-escrow；独立 ts-fastify 使用自己的 frozen lockfile，先 example:setup 再 example:test。原生测试跟随创建 Location 主 GET 并检查 HAL 集合，真实 HTTP 故障测试分别破坏金额、业务时钟与 payload。

schema product-procurement是稳定真实树快照，validator case clone后修改；API full-lifecycle/overlay/OpenAPI fixture 及 evidence-api/testing生成真实FM报告，不手写虚假check。API fixtures 通过 test-only export 复用，其他跨包按既有路径复用，fixture保.evidence/fm布局，改canonical/hash要明确重pin。v6已无timelineSummary.sha256，不能继续要求旧timeline pin；当前tests保护modelDigest格式、输入bytes变化与canonical一致性。

## 桌面组合回路

integration把采购fixture复制temp：parse/strict、await ELK每对象/Context/pair几何、一跳highlight、real store两次save第二零churn/再parse、50mutations+50undos回原文档、编辑后再save字节不变。

phase-3-loop把real runtime、fake Pi、transport和real ModelSession接起来，实际注册11工具而非旧六个，RFC6902补丁可一步undo；full sensor证明本地静态管线，无旧trace frontier/simulator断言。phase-4及renderer suites保护审查和导出/键盘闭环，不启动真实LLM。

## CLI与CI的两种“测试”

常规 CI 安装锁定依赖并检查工作区 Bruno CLI，准备 oasdiff 与独立 Fastify 后运行原生测试、七条边界验证、lint/typecheck/test、CLI 构建与入口检查、示例产物只读核验及 Desktop 构建。drill临时写probe，需在允许修改源码环境运行，不在wiki生成页循环中运行。

Evidence Governance另有产品门禁：静态check→generated artifacts只读--verify→从不可变Git SHA物化baseline→oasdiff破坏性gate；成功后四种独立实现矩阵分别对隔离 SUT 执行 strict regression/DoD并保JSON/Markdown/JUnit。Git show失败不能退到当前模型伪造baseline，expected backend failure/DoD pending与CI allow-pending豁免不得混淆。

`evidence test` 对已生成的 Bruno 集合执行 HTTP 验收，不是 Vitest 源码测试；空筛选/未执行不得当绿，static check testExampleCount只是声明数。详见[CLI工作流](../workflows/cli-governance.md)。

## 执行结果如何记录

每次改动选择最窄unit→必要integration；需要dist先build，需要native diff先setup；保留完整失败stdout/stderr，不只截“1 failed”。执行结果应记录在具体变更说明中，并注明 Node 版本、测试范围与失败后重跑；不能把本页测试地图视作永久的 CI 通过凭据。

相关：[构建](../operations/build-and-package.md) · [静态与CEL](../model/checks-and-simulation.md) · [API](../contracts/api-projection.md)
