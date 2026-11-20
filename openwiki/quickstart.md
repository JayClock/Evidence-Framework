---
type: guide
title: 快速开始与任务导航
description: 安装Evidence桌面与统一CLI，以 FM v6 建模、静态检查、导出 OpenAPI 与 Bruno 集合并对真实 HTTP 服务验收，以及按任务定位架构、桌面、语言和治理文档。
tags: [quickstart, onboarding, navigation, commands]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-20T12:30:09.424Z
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-4c0b31aad45d3c1bd1d286ce
    resource: repo://apps/cli/src/commands/api.ts
  - id: openwiki-source-52a825b501b0001cef1b2ecc
    resource: repo://apps/cli/src/commands/check.ts
  - id: openwiki-source-97029bfc63aaa8f0d97e713c
    resource: repo://apps/cli/src/commands/test.ts
  - id: openwiki-source-69d58f985d20203ea0c2f899
    resource: repo://apps/cli/src/router.ts
  - id: openwiki-source-5d33672c45ec58cd29dce507
    resource: repo://apps/desktop/src/main/main.ts
  - id: openwiki-source-034a304691f6c1f77f682d25
    resource: repo://apps/desktop/src/renderer/state/useMcpBridge.ts
  - id: openwiki-source-eb64da3d440064cfd8e29c7a
    resource: repo://docs/api-projection-v6.md
  - id: openwiki-source-0c1cc5dc86ad401eb9678504
    resource: repo://ENVIRONMENT.md
  - id: openwiki-source-00036286abae2d8c898e2cef
    resource: repo://libs/evidence-acceptance/src/commands.ts
  - id: openwiki-source-cd086b179a9af7a48561ba25
    resource: repo://libs/evidence-api/src/delivery/routes.ts
  - id: openwiki-source-77f78c07571bd5f81a39b9b1
    resource: repo://libs/evidence-mcp/src/server/toolset.spec.ts
  - id: openwiki-source-83f9ee9177192af59a8fc434
    resource: repo://libs/evidence-model-core/src/adapters/modelBundle.ts
  - id: openwiki-source-9008514a60858ff717f539ab
    resource: repo://libs/evidence-model-core/src/validation/fmCheck.ts
  - id: openwiki-source-5827654ee488871fab61b1a1
    resource: repo://libs/evidence-model-io/src/legacyRemoval.spec.ts
  - id: openwiki-source-52858d6130375e8776a048e7
    resource: repo://libs/evidence-schema/src/ast/document.ts
  - id: openwiki-source-c265f00105116b029505cbda
    resource: repo://libs/evidence-schema/src/ast/entity.ts
  - id: openwiki-source-e32f800f7852b379dbe14855
    resource: repo://libs/evidence-schema/src/ast/rule.ts
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-98d5ddb014a0fd4d678f6f2a
    resource: repo://tsconfig.json
generated: { by: "pi", at: "2026-11-20T12:30:09.424Z" }
---

# 快速开始与任务导航

Evidence是语言无关的后端业务建模工作台：先描述双方责任、请求时段、确认时刻、事实与派生规则，再投影接口和验收。模型不是ORM或后端实现；画布、CLI、传感器和生成器复用同一DomainModelDocument。

当前 workspace 为**两个应用（desktop/cli）、十七个 TypeScript 库**。Node.js 22、pnpm 12.16.1 是框架开发工具链；`pnpm install` 安装固定 Bruno CLI，契约比较另需固定原生 oasdiff。项目目录不提供 skill 树。

## 从干净环境启动

```bash
pnpm install
pnpm api:setup                 # 显式下载/校验固定oasdiff；install不会代跑
pnpm exec nx build cli
pnpm evidence --help
pnpm desktop                   # Electron Forge工作台
```

oasdiff在node_modules/.cache，删除依赖/cache后重新setup；无需Go/Docker，比较时不联网补装。build/test/lint根脚本是Nx wrappers，按需最窄验证，不一定每次启动先全仓测试。工作区包通过@evidence-poc/source读src，遗漏resolve.conditions会退dist。

## 模型文件长什么样

```text
my-project/
  .evidence/
    fm/
      model.json               # manifest和entry Contexts
      entities/                # entity内可含examples[].test
      relationships/
      rules/
      README.md                # 可选说明
      generated/               # 派生物，不是模型输入
    api/api.json               # 可选受控route/journey overlay
```

或单个procurement.evidence.json（fm_bundle envelope、同三集合和可选readme）。旧validation/instances、scenarios、模拟回放和桌面branch API已经移除；不要按旧示例新建它们。桌面随安装加载提示词/schema，不从working copy发现建模指令。

## 推荐统一命令

```bash
# 1. 只读静态检查；明确scope才检查交付完整性
pnpm evidence check .evidence/fm --scope context.product-procurement --json

# 2. 移交/还原模型；输出路径相对调用方cwd
pnpm evidence pack .evidence/fm -o procurement.evidence.json
pnpm evidence unpack procurement.evidence.json --out .evidence/fm
pnpm evidence inspect procurement.evidence.json --json

# 3. 编译模型与属性追溯
pnpm evidence compile .evidence/fm --out dist/model.json
pnpm evidence lineage .evidence/fm --out dist/lineage.json

# 4. 从有内联验收examples的模型导出标准契约/测试
pnpm evidence export --model examples/b2b-escrow/model/b2b-escrow.evidence.json --out dist/acceptance
pnpm evidence export --model examples/b2b-escrow/model/b2b-escrow.evidence.json --out dist/acceptance --verify

# 5. 对独立后端执行HTTP验收（先在另一个终端启动SUT）
pnpm example:setup
node examples/b2b-escrow/implementations/ts-fastify/dist/server.js --test-mode --port 8085
pnpm evidence test --target http://127.0.0.1:8085 --scenarios dist/acceptance --json

# 6. 比较最终OpenAPI兼容性（需api:setup）
pnpm evidence diff baseline.evidence.json procurement.evidence.json --format markdown
```

没有 `examples[].test` 时用 `--openapi` 只生成契约；`--tests` 只导出 Bruno 集合，不接受 `--format`。`--out` 会被整树替换，不放手写资料。`test --scenarios` 指向生成目录而非单个请求文件。

旧 evidence-model/api bin暂留为stderr弃用shim；推荐上述入口。api overlay/固定FM报告/完整topology输出可用`evidence api <inspect|check|project|deliver|export-tests|diff|migrate-overlay>`，参数以--help为准，不复制旧脚本的usage猜格式。

## API v6 与迁移

公共 URI 从业务聚合根开始，如 /product-procurements/{contractId}，不加部署 Context/lane。每个创建都有主 GET，HAL self/Location 指向该 URI；集合有自己的 self、_embedded 摘要与 total。服务用 routePrefixes 和精确 routes 表达所有权，Traefik 按 Method+完整路径路由。`evidence api migrate-overlay --in old.json --out new.json --model model.evidence.json` 读取实际基数迁移旧 overlay，必须写新文件。详见 [API v6](./contracts/api-projection.md)。

## 开始桌面工作

open选择含.evidence/fm的项目或Bundle；新项目选模板，或从业务文本/协议/蓝图读取draft、人工修正再compile创建。开项目不运行 project 指令，也不生成后端。AI 设置读取共享 Pi 配置，可选择默认模型和思考级别、重载配置或打开配置目录。无可用模型时，静态建模、规则摄取和离线事实故事仍可用。

默认旅程按邀请投标、投标、合同签约、履约履行四阶段展开；topology 由 ELK 布置，Inspector 编辑语义。Mod+K 打开画布 Storming 先铺凭证；节点内 Inquiry 追溯来源、模拟 What-If 或继续建模。Agent 补丁由主进程先提交，renderer 重放到同一撤销历史，最新事务可一步回退。

左侧导轨是实体表、门禁与诊断、对象目录，对应 Mod+1、Mod+2、Mod+4。实体表与画布共用选区；Alt+D 打开全窗交付产物预览。诊断只匹配当前 revision；外部变更可在无未存编辑时安全加载。

外部Agent通过per-user socket；desktop同binary支持--mcp-stdio，当前 17 个工具，八个写工具走 renderer 会话事务，不直接写源。MCP/内置Agent的参数用共享Zod校验，算子优先。

## 第一天必须分清的门槛

1. **静态一致性≠scope完整性≠HTTP验收≠业务批准。** FM check v6不运行旧scenario，testExampleCount只是声明数量；humanConfirmation始终not-asserted-by-machine。
2. **草稿可看≠发布授权。** 兼容api workflow error退出1不写，只有gaps退出3仍可写draft；stage gate要完整scope/有效报告，API还要coverage/兼容性。机器不能代签。
3. **产物同步不靠CI悄修。** export --verify只比较missing/modified/extra、失败不写，开发重新export并提交。
4. **双验收gate有明确基线。** regression跑旧基线全部flows，DoD跑当前新增/变化；allow-pending只为DoD探索且报告仍未通过，strict CI不用它。详见下页。
5. **故事与本地预演不等于验收。** story --no-ai 仅显示声明事实，journey preview 只读可见前缀；对真实后端的验收由 `evidence test` 驱动 Bruno。旧离线 workbench 已撤除。

## 按任务找文档

| 任务/问题 | 页面 |
| --- | --- |
| CLI导出、真实验收、regression/DoD、pending、CI baseline | [统一CLI与双门禁](./workflows/cli-governance.md) |
| 包依赖、两应用、universal/Node/browser边界 | [系统架构](./architecture/overview.md) |
| FM可写什么、Zod strict/refinement、责任/引用红线 | [FM v6 语言](./language/fm-dsl.md) |
| 金额/截止时间谁提供、native CEL属性lineage、文本来源 | [关键数据与来源](./language/key-data-and-provenance.md) |
| Tree/Bundle、pack/unpack、摘要、保存冲突 | [源格式](./model/source-formats.md) |
| Immer recipes、RFC6902安全、原子历史和选择 | [模型变更与会话](./model/commands-and-session.md) |
| 静态v6证明什么、scope、CEL精确整数/样例oracle | [检查与样例求值](./model/checks-and-simulation.md) |
| sensor severity、版本化stage gate、治理策略 | [传感器](./agents/sensor-orchestration.md) |
| Pi会话/随包指令、15 项工具、镜像与补丁 | [内置Agent](./agents/pi-harness.md) |
| 外部Cursor/Claude、socket、超时与 17 项工具 | [MCP](./agents/mcp-integration.md) |
| 模型→OpenAPI、overlay、内联examples投影 | [API契约](./contracts/api-projection.md) |
| 服务/路由、字段来源、oasdiff、冻结draft导出 | [交付差异](./contracts/delivery-routes-and-diff.md) |
| 旧 HTML 工作台退役与当前替代入口 | [迁移说明](./contracts/offline-workbench.md) |
| Electron/main/preload、项目存储、Chokidar监控 | [桌面宿主](./desktop/app-shell.md) |
| 单会话、异步布局竞态、live revision、跨pane定位 | [renderer状态](./desktop/renderer-state.md) |
| 对象目录、实体表、Storming、交付 Hub 与快捷键 | [工作区界面](./desktop/workspace-surfaces.md) |
| ELK geometry、React Flow和Inspector/CEL编辑 | [画布与检查器](./desktop/canvas-and-inspector.md) |
| 文本摄取、draft采纳、Agent补丁审查 | [摄取与审查](./desktop/ingestion-and-patch-review.md) |
| setup、Nx/Forge、边界lint、CI/OpenWiki维护 | [构建与维护](./operations/build-and-package.md) |
| 选最窄测试、fixtures、注入/真实socket/SUT/browser验证 | [验证策略](./testing/verification-strategy.md) |

旧README/工作区说明可能残留command bus/泳道/内存仿真术语；本wiki以当前代码/tests核对，故事与四种独立后端示例均有当前源码；运行哪一种、通过哪些验证必须分别说明。
