---
type: workflow
title: 统一 CLI 与双门禁验收工作流
description: evidence 如何从 FM 模型导出 OpenAPI 与 Bruno 集合，对真实服务执行 Regression 和 DoD，并验证生成产物、响应漂移和契约兼容性。
tags: [cli, acceptance, governance, bruno, oasdiff, drift, ci]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-18T09:45:40.969Z
sources:
  - id: openwiki-source-17a7254439d5e92a919764bb
    resource: repo://.github/workflows/evidence-governance.yml
  - id: openwiki-source-4c0b31aad45d3c1bd1d286ce
    resource: repo://apps/cli/src/commands/api.ts
  - id: openwiki-source-0665c978968bd863d445c79a
    resource: repo://apps/cli/src/commands/export.ts
  - id: openwiki-source-fbc96cb4b0e8dd1af286891a
    resource: repo://apps/cli/src/commands/story.ts
  - id: openwiki-source-97029bfc63aaa8f0d97e713c
    resource: repo://apps/cli/src/commands/test.ts
  - id: openwiki-source-69d58f985d20203ea0c2f899
    resource: repo://apps/cli/src/router.ts
  - id: openwiki-source-4f4956186309f29a9271894d
    resource: repo://libs/evidence-acceptance/src/renderDeliverables.ts
  - id: openwiki-source-2d3f86d874f890c44f539c19
    resource: repo://libs/evidence-acceptance/src/renderer/brunoSuite.ts
  - id: openwiki-source-cfb863e81258afec257b30c8
    resource: repo://libs/evidence-acceptance/src/runner/acceptanceRunner.ts
  - id: openwiki-source-0b736da4ae21db6f38508367
    resource: repo://libs/evidence-acceptance/src/runner/brunoCli.ts
  - id: openwiki-source-706dba0858eef2721b63a216
    resource: repo://libs/evidence-acceptance/src/runner/driftInspector.ts
  - id: openwiki-source-a2d80ddb56c0c51c2eb2ba47
    resource: repo://libs/evidence-acceptance/src/runner/suiteSelection.ts
  - id: openwiki-source-a8ee2373695bb6cdbd087639
    resource: repo://libs/evidence-api/src/loader/migrateOverlay.ts
  - id: openwiki-source-c22dc8548266abcfb6970baf
    resource: repo://templates/ci/evidence-ci.gitlab-ci.yml
generated: { by: "pi", at: "2026-11-18T09:45:40.969Z" }
---

# 统一 CLI 与双门禁验收工作流

apps/cli是cac应用，库拥有执行逻辑。静态check、契约兼容和真实HTTP验收是三件不同事；任何一层通过不能替另外一层背书。开发先安装并build：

```bash
pnpm install
pnpm api:setup
pnpm exec nx build cli
pnpm evidence --help
```

## 一入口与共享执行层

router注册check/test/export/diff、pack/unpack/compile/inspect/lineage、story 及兼容 api <command>。context注入cwd/stdout/stderr/color；路径按调用方cwd解析，不写死repository root。重复非repeatable参数、混用alias、未知flag、多余positionals/--尾参数明确usage失败。scope/tag可重复，help/version不执行业务；JSON模式错误保持机器可读，非JSON错误stderr。

旧 evidence-model/api可执行入口暂保，弃用提示仅stderr、不污染JSON stdout；它们与统一app引用库commands，不反向import app。根model:*和api:*脚本已走apps/cli。旧timeline/simulate/role-play和Scenario/Instance格式移除，不能用兼容shim复活。

`evidence api migrate-overlay --in old.json --out new.json [--model model.evidence.json]` 根据实际模型迁移 v5 路径、旧 ledger 与 journey 引用，输出新 6.0 overlay，不覆盖旧文件。未知路由/歧义参数拒绝。`evidence story [model] --no-ai` 离线生成声明 flow 的事实卡片，可按 flow/format 筛选和导出。

## 从模型到产物

loadModel按树或Bundle加载，parse issues导致FM_INVALID，不修补源。`check [model] --scope ... --json`输出静态FM v6（testExampleCount只是声明数）；compile/lineage有checkable约束，pack/unpack/inspect见[源格式](../model/source-formats.md)。旧 review/workbench 已删除；story 从声明 flow 生成事实卡片或可选 AI 故事，不运行后端。

```bash
pnpm evidence check examples/b2b-escrow/model/b2b-escrow.evidence.json --json
pnpm evidence export --model examples/b2b-escrow/model/b2b-escrow.evidence.json --out dist/acceptance
pnpm evidence export --model examples/b2b-escrow/model/b2b-escrow.evidence.json --out dist/acceptance --verify
```

`export` 默认同时生成 OpenAPI 3.1 和 Bruno 集合，`--openapi` / `--tests` 可选择子集。验收导出没有 `--format`；旧套件要从模型重新导出。`renderDeliverables` 先检查投影错误和 OpenAPI，再将 `examples[].test` 编译成 `bruno.json`、按 flow 分组的 `.bru` 文件及 `evidence-acceptance.json`。全部成功前**不写任何文件**。`--out` 必须是专用目录：校验真实路径，拒绝与模型重叠或替换 cwd，然后以同级临时目录切换整树；不要在里面放手写文件。

--verify走同一内存编译，但只比现有树**精确bytes**，不写/不创建目录、不跟内部symlink。缺失MISSING、改动MODIFIED、额外EXTRA分列，symlink按stale处理，失败退出1并给重新export建议；生成+commit应是开发动作，CI只verify，避免CI替模型作者悄修产物。

## 对真实后端执行标准HTTP

```bash
pnpm example:setup
node examples/b2b-escrow/implementations/ts-fastify/dist/server.js --test-mode --port 8085
# 另一个终端
pnpm evidence test --target http://127.0.0.1:8085 --scenarios dist/acceptance --verbose
```

`test --scenarios` 接受**一个生成的集合目录**。Evidence 读取并校验验收元数据，确认它与原生集合文件一致，再把选中的 flow 渲染到临时目录，逐个用固定 Bruno CLI 的 safe sandbox 执行；不执行集合里手改的脚本。直接用 Bruno 打开集合可调试原生 HTTP 请求和断言，但不执行 Evidence 门禁或响应 Schema 校验。

运行 HTTP 测试前做 HEAD 探活（404/405 等任意响应都证明可达，不跟重定向，也不用 POST 改状态）。`--target` 必须为合法 HTTP(S) URL，`--timeout` 是正整数且不超过 2147483647ms。Evidence 把 Bruno 报告归一化为逐步状态、断言、错误和耗时；缺失或不一致的结果不会算作通过。

模型examples里的asOf编译出请求clock和派生期望。test --as-of必须UTC，**只改请求x-evidence-asof，不重编期望值**，可能故意制造时间漂移失败。此header只供可信测试backend，生产授权/时钟不得信客户端。生成的 Bruno 断言保留内联 oracle 的 int/uint 精确十进制字符串，不经 Number 舍入。

## Regression与DoD是两套验收集合

```bash
pnpm evidence diff baseline.evidence.json current.evidence.json --format markdown
pnpm evidence test --target http://127.0.0.1:8085 --scenarios dist/acceptance \
  --gate regression --baseline-model baseline.evidence.json --strict-drift --report-dir reports
pnpm evidence test --target http://127.0.0.1:8085 --scenarios dist/acceptance \
  --gate dod --baseline-model baseline.evidence.json --strict-drift --report-dir reports
```

`--baseline-model` 需配合 `--gate`。基线由原模型重新编译为中立验收投影，而不是拿当前集合作替代。

- regression+baseline：**执行baseline全部flows**，保护旧合同，不是当前flows里“没改动”的子集。
- DoD + baseline：执行当前新增或语义变化的 flow，按 ID 对齐，重复 ID 拒绝。指纹基于中立投影，规范化捕获引用，保留步骤、时钟、状态、断言和 Schema 验证语义；生成文件名、捕获变量名或 Schema 文档注解变更不会凭空制造增量。
- 无baseline：只选显式regression/dod tags，不能自动推测基线。
- filter按name substring或*? glob、重复tag要求全部命中，始终选**完整flow**保留上游捕获，不切散依赖steps。

通常空筛选失败，**唯一显式空成功例外**：baseline存在的DoD、没有filter/tag、当前与基线无增量，返回selectedFlowCount0和emptyReason，表示无需增量而非后端已经跑过。不能把它统计为已执行全绿。

## Pending不把红灯涂绿

--allow-pending只用于DoD；若断言失败但没有step execution error，也没有strict-drift发现，报告passed=false、pending=true，终端黄色/进度仍保留失败，可退出0供探索。HTTP连接/运行错误或strict drift不能豁免；regression不可用。严格CI不传该参数，因此未完成DoD真实失败。

默认traffic-light适合人，--verbose保留失败详情，NO_COLOR关闭色。--json、--report markdown|junit互斥；--report-dir一次写同一执行报告的JSON/Markdown/XML（名为gate或acceptance），不是为了多格式重跑SUT。退出passed/pending0，其他1；diff单独0无breaking/1breaking/2输入工具失败。

## 两种drift不能混淆

Evidence 用 AJV 2020-12 和 formats 检查**本次 HTTP 响应**，不修改 payload 或加载远端引用。默认 Schema 失败会阻断；`--detect-drift` 将漂移设为建议并列出带 RFC 6901 路径的问题，`--strict-drift` 仍阻断。Bruno 的其他业务断言不受影响。Schema 声明开放的对象不会因出现额外字段自动失败。

桌面/MCP的audit_production_drift则比较saved FM与OTLP trace的Evidence commits，是另一种语义审计，不由HTTP开关代替。

## 契约gate与CI基线纪律

diff比较最终valid OpenAPI，固定oasdiff1.38.0，level≥2 breaking；默认Markdown，旧diff api写法默认JSON。api:setup显式准备cache，compare绝不联网下载，无tool/版本错失败闭合并保stdout/stderr。

Evidence Governance先check→export --verify→从PR base/push before不可变SHA物化baseline→diff；base commit/path不存在只允许明确bootstrap策略，git show失败不能退HEAD。契约卫生成功后按 golang-gin/java-spring/python-fastapi/ts-fastify 四种独立实现矩阵，make prepare 跑各自 native tests，再跑预期红绿 conformance，随后 strict regression 和 DoD；上传 native/conformance/各 gate 的 JSON/MD/JUnit 与 backend log。这些外部实现工具链由对应 matrix job 单独安装，仓库 TypeScript 开发与 Fastify 验证仍只需 Node/pnpm。验收作业从工作区锁文件安装并查验 Bruno CLI，不使用全局 `bru`。GitLab 模板以独立 Fastify 复用严格门禁，见 `templates/ci`。

## 代表测试与边界

router/commands specs保护cac严格参数与cwd；legacy-shims e2e保护stderr-only警告/库依赖；export specs保护both-before-write/atomic/verify missing-stale-extra/symlinks；runner/suiteSelection保护官方执行、完整flow/基线语义/空DoD；governance/cli e2e对独立 Fastify/fault 后端验证兼容、旧回归/新DoD、pending与strict drift，不靠mock SUT推断业务成功。

相关：[快速开始](../quickstart.md) · [API投影](../contracts/api-projection.md) · [交付差异](../contracts/delivery-routes-and-diff.md) · [测试地图](../testing/verification-strategy.md)
