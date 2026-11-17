---
type: contract
title: API v6 聚合根契约与 HAL 投影
description: 模型与可选 overlay 如何投影 draft API snapshot、OpenAPI 3.1、服务与超媒体，以及内联 examples 如何编译成标准 HTTP 验收。
tags: [api, projection, openapi, overlay, diagnostics, cli, contract]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-17T06:43:02.055Z
sources:
  - id: openwiki-source-4c0b31aad45d3c1bd1d286ce
    resource: repo://apps/cli/src/commands/api.ts
  - id: openwiki-source-00036286abae2d8c898e2cef
    resource: repo://libs/evidence-acceptance/src/commands.ts
  - id: openwiki-source-feaf4e64c269397a25f93a3d
    resource: repo://libs/evidence-agent/src/sensors/native/nativeApiSensor.ts
  - id: openwiki-source-d411e4580a06325c2c5fcf75
    resource: repo://libs/evidence-api/src/adapter/fmAdapter.ts
  - id: openwiki-source-5ada2ea19d2cb99c0b704bb8
    resource: repo://libs/evidence-api/src/apiLoader.spec.ts
  - id: openwiki-source-e945d84c4f7201722caecdad
    resource: repo://libs/evidence-api/src/delivery/addressing.ts
  - id: openwiki-source-32449ef9d6385b1251eee70e
    resource: repo://libs/evidence-api/src/delivery/fieldContract.spec.ts
  - id: openwiki-source-f03cbc6b1d6e72ee81aab365
    resource: repo://libs/evidence-api/src/delivery/files.ts
  - id: openwiki-source-e2bfe2b62dac07a26ade079e
    resource: repo://libs/evidence-api/src/delivery/modelDelivery.ts
  - id: openwiki-source-cd086b179a9af7a48561ba25
    resource: repo://libs/evidence-api/src/delivery/routes.ts
  - id: openwiki-source-9e4629be8b18a94ae1ff1f90
    resource: repo://libs/evidence-api/src/delivery/segments.ts
  - id: openwiki-source-db628d3d14b8f1801370c287
    resource: repo://libs/evidence-api/src/delivery/topology.ts
  - id: openwiki-source-e7b8e25706f35341e5dd6899
    resource: repo://libs/evidence-api/src/diagnostics.ts
  - id: openwiki-source-6f06bbf6d9d8a380c42129bc
    resource: repo://libs/evidence-api/src/http/hateoasWeaver.spec.ts
  - id: openwiki-source-a0e07a861eaab8e52f8f4245
    resource: repo://libs/evidence-api/src/http/hateoasWeaver.ts
  - id: openwiki-source-57fd648ccc0d7f08ee97d2b8
    resource: repo://libs/evidence-api/src/inspect.ts
  - id: openwiki-source-adefb9cc5fd30bc9ad8a24df
    resource: repo://libs/evidence-api/src/loader/apiLoader.ts
  - id: openwiki-source-a8ee2373695bb6cdbd087639
    resource: repo://libs/evidence-api/src/loader/migrateOverlay.ts
  - id: openwiki-source-561a740200649f731d1630c1
    resource: repo://libs/evidence-api/src/openapi/openapi.spec.ts
  - id: openwiki-source-dda93af372b2aced5e221a86
    resource: repo://libs/evidence-api/src/projection.spec.ts
  - id: openwiki-source-7dad3c227e7d6e118c34b56a
    resource: repo://libs/evidence-api/src/projector.ts
  - id: openwiki-source-007097f0c3a549d556bab2ea
    resource: repo://libs/evidence-api/src/renderer/outputRenderer.spec.ts
  - id: openwiki-source-65cec3fa94938b2f2b5d4a29
    resource: repo://libs/evidence-api/src/renderer/outputRenderer.ts
  - id: openwiki-source-13153af2029f2aa63c0edef3
    resource: repo://libs/evidence-api/src/schemas/apiSchema.ts
  - id: openwiki-source-b6b6c0e38c718ba7eef29b0f
    resource: repo://libs/evidence-api/src/testing/openapi.ts
generated: { by: "codex", at: "2026-11-17T06:43:02.055Z" }
---

# API v6 聚合根契约与 HAL 投影

`evidence-api` 读取 FM 文档或树/Bundle，加可选 JSON overlay，产生 `EvidenceApiSnapshot`：routes、hypermedia、journeys、services、deployment、limitations、诊断及 OpenAPI。snapshot 固定 schemaVersion=6.0、mode=draft；投影是可审查的设计产物，不宣称发布就绪。

## 输入、索引与证据

`loadFm` 在读取前后比较源字节摘要，变化返回 SOURCE_CHANGED、index=null；解析/源问题也明确失败。`loadFmFromDocument` 拒绝旧 validation envelope，structuredClone 固定输入，建立实体/关系/规则和上下文索引。无 check report 表示没提供，不是通过。

可选报告需 checkVersion=6、consistent/complete/valid/modelValidated=true、inputChanged=false、errors 为空及字符串 modelDigest。失效报告保留为 FM_CHECK_INVALID gap，摘要不符为 FM_CHECK_STALE gap；这仍允许草稿预览，不是正式门禁通过。磁盘摘要是带 sha256: 前缀的源字节 digest；内存摘要来自 canonical compiled document，不再包含旧 validation suite。overlay/check 摘要是 canonical JSON 的裸 hex。

`inspect` 是只读库存：模型、roles、真实 participant.party 扮演的 Party Roles、未扮演角色、evidence/participant resource clues、contexts、文件摘要；不会发明路由，也不再列旧 scenarios。

## 业务 URI 与部署边界

公共 URI 从具名业务聚合根开始，不加 Context/lane 前缀：`/product-inquiries/{inquiryId}`、`/product-procurements/{contractId}`。方案嵌套在征询之下；从方案签约和直接签约都返回新合同主 URI。每一个创建入口都有对应的实体 GET，集合创建也有集合 GET。

references 无论箭头方向均读取 child endpoint 基数；全部明确 max=1 才是单例 `/payment`，未知、多值或矛盾使用 `/payments/{paymentId}`。领域 thing 根以及具有 id 类型属性的独立 other_evidence 有只读集合/主 GET。根名在全局分配，子段在兄弟资源间分配，真实冲突用稳定身份后缀消歧，不受无关角色和 Context 重命名影响。

服务仍由 Context 划分，但用 routePrefixes 和精确 route IDs 表达所有权；proposal 下的签约入口由合同服务处理。最终 overlay routes 重新生成 topology、OpenAPI 与 Compose。Traefik 逐操作按 Method 与锚定路径正则路由，后端获得 EVIDENCE_ROUTE_PREFIXES/EVIDENCE_ROUTES；镜像和端口仍是部署草图占位。

## Overlay 与投影顺序

Overlay 是严格 JSON：schemaVersion=5.0 或 6.0、id、routes(id/path/summary)、journeys(id/roleRef/routeId/nextPossibleSteps)。不接受 YAML、重复键（含嵌套/转义）、非 JSON 数值、非对象、重复 section ID 或旧 resources/bindings/capabilities。缺省值只在校验后补齐；programmatic overlay 走同一 loader。嵌入 schema 文本须与随包文件字节一致，manifest 记录 schema digest。

`buildProjection` 顺序固定：

1. 对四部分文档执行 strictValidateDomainModel，失败为 FM_INVALID error，但仍返回可显示的草稿。
2. buildModelDelivery 生成模型基线，解析 overlay；loader 有诊断时整体放弃 overlay，不做部分接受。
3. 按 route id 覆盖现有 path/summary；未知 ID、改变参数名、空段/坏括号、method/path pattern 碰撞各有明确 error，不能凭 overlay 新增业务接口。
4. 校验 journey 的 party role 存在且在 route.allowedPartyRoleRefs 中，nextPossibleSteps 必须解析到既有 step。
5. 将所有创建的 itemPath 同步到最终主 GET，重新计算 service ownership；编织 hypermedia，缺自定义 journeys 时从可达关系推导，最后才从最终 routes 建 OpenAPI，保证路径不分叉。
6. 归一化诊断并按 severity/code/target/message/identity 排序；最终 snapshot 在命令层再用 api-projection.schema.json 校验，错误为 PROJECTION_INVALID。

## 超媒体不是虚构执行顺序

POST 的 self 与 201 Location 指向实体主 GET；实体 GET 的 self 是自身，集合 GET 的 self 是集合路径。集合用 `_embedded.<业务复数名>` 返回摘要，每项有自己的主 self，并返回非负 total。实体、摘要和集合是分离的 schema。Evidence 间 references 让先决对象 route 指向依赖者 POST，形成 next:<entityRef>；去重排序，模板链接保留 templated。默认 journey 是 POST × allowed party roles 的可能步骤，http-journeys.json 明确 runtimeValidated=false，不把静态导航当验收已执行。

## OpenAPI 与字段纪律

`buildDeliveryContract` 产生 OpenAPI 3.1.0，info.version 固定 6.0.0，模型版本保留在 x-evidence-model-version，manifest → info，route → operation，读写对象 → component schemas，services 与部署拓扑一致。operation 的 x-evidence-* 追溯 entity、context、service、contract、请求/确认、允许角色、exposure、derived/stamped。

- POST 请求体只有 caller 字段，additionalProperties=false；派生字段和 stamped 业务时间不作为客户端输入。
- 响应中 derived/stamped 标 readOnly，派生字段携带 rule 引用；对象 component 要求 HAL `_links`。
- 201 Location 的 x-evidence-uri-template 是 itemPath；2xx 实体响应为 application/hal+json 并保留 link templates。
- path 参数必须对应模板，required string；GET 无 body。无真实 participant.party 扮演责任角色的路由仍保留，但标 internal exposure，不悄悄消失。

缺 confirmation 或需要服务端执行派生规则等未完成能力在 limitations 明示；不能从生成契约推断后端已经实现。audit_api 在上层统计 evidence-only coverage 并给缺口 warning，投影本身不伪造覆盖评分。

## 内联样例到标准验收

`evidence-acceptance/src/delivery/scenarioProjector.ts` 的 AcceptanceFlow/Step 是临时编译 IR，**不是新持久化 suite 格式**。只有实体 examples[].test 参与：flow、actingRoleRef、asOf、basedOn/pathParameters、预期状态/inputs/expect/tags。

每例须唯一映射 POST 且角色获准；依赖按图排序，拒绝环、未知例、跨 flow、依赖拒绝操作、上游时间晚于当前。正向样例先清除 asserted derived 值，再用原生 CEL 对显式 upstream facts 求值；给定期望与推导不符必须失败，不允许 oracle 读取自己的答案。显式负向状态只生成声明的输入/断言，不能臆造非法案例。

路径从上游 response captures 传递，正向结果携带 response schema。导出 Step CI YAML/Hurl，HTTP runner 才检查真实后端。CEL int/uint 在 JSON 边界将安全整数转为 number，较宽的合法 int64/uint64 转为精确十进制 string；输入 unsafe number 或超出 CEL 类型范围的值拒绝，不能静默舍入。

## Overlay 迁移

`evidence api migrate-overlay --in old.json --out new.json [--model model.evidence.json]` 读取实际模型，把 v5 默认路径、旧 singleton ledger ID 和 journey 引用迁移到 v6；保留仍合法的自定义路径与 summary。未知路由和有歧义的参数变更拒绝，输出使用新文件且声明 6.0，不覆盖旧文件。独立改创建入口不改主 URI；改主 GET 会同步相关创建响应身份。

## 命令、写出与错误

推荐 `evidence export` 和 `evidence api <command>`；旧 evidence-api shim 警告只到 stderr。`evidence-acceptance/src/commands.ts` 共享 inspect/check/project/deliver/diff/export-tests 逻辑。

兼容 api workflow 的 resolved 路径必须 absolute：report/overlay 在 FM root 外，out 在 project 内且与所有输入无包含重叠，使用 realpath 解析已有祖先防 symlink 绕过。统一 app 负责相对 cwd 参数适配，不应把旧 resolved API 约束套成“所有用户命令只收绝对路径”。

project/deliver 同一投影与 writer：0=无 errors/gaps；1=错误/拒绝，不写；3=只有 gaps，仍写可审查草稿。complete 比 writable 更严格，要求零 findings 且 schema clean。

输出 openapi.json、topology.json、routes.json、deployment.compose.json、projection.json、http-journeys.json、可选 limitations.md、manifest.json。manifest 记录工具/schema/Node/AJV 和输入/output byte hashes。默认 `.evidence/api/generated`；仅直接文件名，先 sibling temp staging，再 rename/backup，失败恢复旧树，避免半新半旧。

## 验证与消费者

projection specs 保护 overlay/路径/角色、FM_INVALID、stale gap 仍写及 source 变化拒绝；OpenAPI specs 校验 3.1 元模型、refs/operationId/path 参数/GET body 并编译严格消费者类型。outputRenderer specs 保护稳定排序、重排等价、Bundle roundtrip 字节和 manifest；apiLoader specs 保护 schema 字节与重复键；acceptance/projector specs 保护 CEL oracle、依赖/角色、负向与整数边界。

桌面和 sensors 使用同步 buildDelivery(document)，renderer 使用 browser-safe field-contract 入口避免 fs。旧 evidence-visualization 与离线 workbench 已移除；统一 CLI 不再提供 review。

详见仓库文档 [v6 契约与迁移](../../docs/api-projection-v6.md)。

相关：[路由与差异](./delivery-routes-and-diff.md) · [CLI 双门禁](../workflows/cli-governance.md) · [离线审查](./offline-workbench.md)
