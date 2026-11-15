---
type: guide
title: 快速开始与任务导航
description: 安装Evidence桌面与统一CLI，以FM v5建模、静态检查、导出OpenAPI/Step CI并对真实HTTP验收，以及按任务定位架构、桌面、语言和治理文档。
tags: [quickstart, onboarding, navigation, commands]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-15T14:07:58.904Z
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-5466111549d3bdae4dce66a7
    resource: repo://apps/cli/package.json
  - id: openwiki-source-52a825b501b0001cef1b2ecc
    resource: repo://apps/cli/src/commands/check.ts
  - id: openwiki-source-69d58f985d20203ea0c2f899
    resource: repo://apps/cli/src/router.ts
  - id: openwiki-source-5d33672c45ec58cd29dce507
    resource: repo://apps/desktop/src/main/main.ts
  - id: openwiki-source-0c1cc5dc86ad401eb9678504
    resource: repo://ENVIRONMENT.md
  - id: openwiki-source-a2b00d4266d693ffa57e8b71
    resource: repo://libs/evidence-api/src/commands.ts
  - id: openwiki-source-aac6631a251b846350b2d550
    resource: repo://libs/evidence-mcp/src/server/toolset.ts
  - id: openwiki-source-83f9ee9177192af59a8fc434
    resource: repo://libs/evidence-model-core/src/adapters/modelBundle.ts
  - id: openwiki-source-9008514a60858ff717f539ab
    resource: repo://libs/evidence-model-core/src/validation/fmCheck.ts
  - id: openwiki-source-5827654ee488871fab61b1a1
    resource: repo://libs/evidence-model-io/src/legacyRemoval.spec.ts
  - id: openwiki-source-f09309d6b09bb3169ef331c4
    resource: repo://libs/evidence-visualization/src/commands.ts
  - id: openwiki-source-28ab8d38fd5d45f412609ea7
    resource: repo://libs/evidence-visualization/src/publish/workbenchPublisher.ts
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-98d5ddb014a0fd4d678f6f2a
    resource: repo://tsconfig.json
generated: { by: "pi", at: "2026-11-15T14:07:58.904Z" }
---

# 快速开始与任务导航

Evidence是语言无关的后端业务建模工作台：先描述双方责任、请求时段、确认时刻、事实与派生规则，再投影接口和验收。模型不是ORM或后端实现；画布、CLI、传感器和生成器复用同一DomainModelDocument。

当前workspace为**两个应用（desktop/cli）、十二个TypeScript库**。Node.js22、pnpm12.16.1是一套开发工具链，没有Python/Go解释器、virtualenv或项目skill树；契约比对另需固定native oasdiff。

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

或单个procurement.evidence.json（fm_bundle envelope、同三集合和可选readme）。旧validation/instances、scenarios、模拟回放和桌面branch API已经移除；不要按旧示例新建它们。桌面随安装加载提示词/schema/assets，不从working copy发现建模指令。

## 推荐统一命令

```bash
# 1. 只读静态检查；明确scope才检查交付完整性
pnpm evidence check .evidence/fm --scope context.product-procurement --json

# 2. 移交/还原模型；输出路径相对调用方cwd
pnpm evidence pack .evidence/fm -o procurement.evidence.json
pnpm evidence unpack procurement.evidence.json --out .evidence/fm
pnpm evidence inspect procurement.evidence.json --json

# 3. 编译模型/追溯与离线审查页
pnpm evidence compile .evidence/fm --out dist/model.json
pnpm evidence lineage .evidence/fm --out dist/lineage.json
pnpm evidence review --project-root . --out review.html

# 4. 从有内联验收examples的模型导出标准契约/测试
pnpm evidence export --model examples/acceptance/procurement.evidence.json --out dist/acceptance
pnpm evidence export --model examples/acceptance/procurement.evidence.json --out dist/acceptance --verify

# 5. 对独立后端执行HTTP验收（先在另一个终端启动SUT）
node examples/dogfood-backend/server.mjs --port 8085 --mode v2
pnpm evidence test --target http://127.0.0.1:8085 --scenarios dist/acceptance --json

# 6. 比较最终OpenAPI兼容性（需api:setup）
pnpm evidence diff baseline.evidence.json procurement.evidence.json --format markdown
```

没有examples[].test时不要声称导出了验收，export可用--openapi只交契约；Hurl用--tests --format hurl导出、由Hurl CLI运行。out是会被原子整树替换的专用generated目录，不放手写资料。

旧evidence-model/api/workbench bin暂留为stderr弃用shim；推荐上述入口。api overlay/固定FM报告/完整topology输出可用`evidence api <inspect|check|project|deliver|export-tests|diff>`，参数以--help为准，不复制旧脚本的usage猜格式。

## 开始桌面工作

open选择含.evidence/fm的项目或Bundle；新项目选模板，或从业务文本/协议/蓝图读取draft、人工修正再compile创建。开项目不运行project指令，也不生成后端。

ELK异步布置compound Context，React Flow管视口，Inspector编辑语义；所有mutations/RFC6902共用Immer历史。Agent补丁先应用并给tool结果，再显示保留/最新时一步撤销；后续编辑后不能用旧review误撤工作。

rail为业务结构、诊断、生产漂移、AI协同；graph/table/split共享选择，split可看台账/OpenAPI/CEL/漂移。生产trace审计看saved模型，实时静态diagnostics看明确revision，不把二者混成一份结论。外部文件写入只提示reload，save并无自动merge/乐观锁。

外部Agent通过per-user socket；desktop同binary支持--mcp-stdio，当前13工具，四个write（patch+三算子）最终走renderer session，不直接写源。MCP/内置Agent的参数用共享Zod校验，算子优先。

## 第一天必须分清的门槛

1. **静态一致性≠scope完整性≠HTTP验收≠业务批准。** FM check v6不运行旧scenario，testExampleCount只是声明数量；humanConfirmation始终not-asserted-by-machine。
2. **草稿可看≠发布授权。** 兼容api workflow error退出1不写，只有gaps退出3仍可写draft；stage gate要完整scope/有效报告，API还要coverage/兼容性。机器不能代签。
3. **产物同步不靠CI悄修。** export --verify只比较missing/modified/extra、失败不写，开发重新export并提交。
4. **双验收gate有明确基线。** regression跑旧基线全部flows，DoD跑当前新增/变化；allow-pending只为DoD探索且报告仍未通过，strict CI不用它。详见下页。
5. **离线review是只读快照。** 默认.evidence/views/index.html，CSP禁网络、预计算布局；publisher拒覆盖symlink/非自有文件，预览与正式saved导出区分。

## 按任务找文档

| 任务/问题 | 页面 |
| --- | --- |
| CLI导出、真实验收、regression/DoD、pending、CI baseline | [统一CLI与双门禁](./workflows/cli-governance.md) |
| 包依赖、两应用、universal/Node/browser边界 | [系统架构](./architecture/overview.md) |
| FM可写什么、Zod strict/refinement、责任/引用红线 | [FM v5语言](./language/fm-dsl.md) |
| 金额/截止时间谁提供、native CEL属性lineage、文本来源 | [关键数据与来源](./language/key-data-and-provenance.md) |
| Tree/Bundle、pack/unpack、摘要、保存冲突 | [源格式](./model/source-formats.md) |
| Immer recipes、RFC6902安全、原子历史和选择 | [模型变更与会话](./model/commands-and-session.md) |
| 静态v6证明什么、scope、CEL精确整数/样例oracle | [检查与样例求值](./model/checks-and-simulation.md) |
| sensor severity、版本化stage gate、治理策略 | [传感器](./agents/sensor-orchestration.md) |
| Pi会话/随包指令、11工具、镜像与补丁 | [内置Agent](./agents/pi-harness.md) |
| 外部Cursor/Claude、socket、安全/超时/13工具 | [MCP](./agents/mcp-integration.md) |
| 模型→OpenAPI、overlay、内联examples投影 | [API契约](./contracts/api-projection.md) |
| 服务/路由、字段来源、oasdiff、冻结draft导出 | [交付差异](./contracts/delivery-routes-and-diff.md) |
| 单文件HTML、白名单、ELK预布局、CSP/发布 | [离线审查](./contracts/offline-workbench.md) |
| Electron/main/preload、项目存储、Chokidar监控 | [桌面宿主](./desktop/app-shell.md) |
| 单会话、异步布局竞态、live revision、跨pane定位 | [renderer状态](./desktop/renderer-state.md) |
| rail/drawer/ledger/split/hubs和键盘所有权 | [工作区界面](./desktop/workspace-surfaces.md) |
| ELK geometry、React Flow和Inspector/CEL编辑 | [画布与检查器](./desktop/canvas-and-inspector.md) |
| 文本摄取、draft采纳、Agent补丁审查 | [摄取与审查](./desktop/ingestion-and-patch-review.md) |
| setup、Nx/Forge、边界lint、CI/OpenWiki维护 | [构建与维护](./operations/build-and-package.md) |
| 选最窄测试、fixtures、注入/真实socket/SUT/browser验证 | [验证策略](./testing/verification-strategy.md) |

旧README/工作区说明可能残留command bus/泳道/内存仿真术语；本wiki以当前代码/tests核对，不把RFC的未来story/multi-language计划当已实现能力。
