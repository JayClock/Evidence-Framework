---
type: contract
title: 交付路由、快照与契约差异
description: 业务聚合根如何成为 URI、Context 如何成为服务，字段来源如何限制请求，以及固定 oasdiff 比较最终 OpenAPI、桌面实时预览和冻结导出的行为。
tags: [delivery, topology, routing, openapi, field-origin, api-diff, breaking-changes, desktop]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-17T06:43:02.055Z
sources:
  - id: openwiki-source-c8d6c908e749a45544b1e625
    resource: repo://apps/desktop/src/main/deliveryIpc.ts
  - id: openwiki-source-fc371e1f84c3b5d478075b07
    resource: repo://apps/desktop/src/main/deliveryProjection.ts
  - id: openwiki-source-59e7a4a2571d0728d39ecc85
    resource: repo://apps/desktop/src/main/mcpDeliveryService.ts
  - id: openwiki-source-bf747dad922ce4438e285478
    resource: repo://libs/desktop/feature-canvas/src/LiveApiContext.tsx
  - id: openwiki-source-71d7e1232409d0d4ee39377c
    resource: repo://libs/desktop/feature-delivery/src/components/delivery/DeliveryHub.tsx
  - id: openwiki-source-13f689fde06662821c655520
    resource: repo://libs/desktop/feature-delivery/src/components/delivery/IncrementalDiffPanel.tsx
  - id: openwiki-source-effa8775635d4ee2d4bfa795
    resource: repo://libs/desktop/feature-delivery/src/state/useDeliveryHub.spec.tsx
  - id: openwiki-source-32df59b611c02b85d275991a
    resource: repo://libs/desktop/feature-delivery/src/state/useDeliveryHub.ts
  - id: openwiki-source-00036286abae2d8c898e2cef
    resource: repo://libs/evidence-acceptance/src/commands.ts
  - id: openwiki-source-d0f0c50af79c1c9e74ccaeb4
    resource: repo://libs/evidence-acceptance/src/diff/compareContracts.ts
  - id: openwiki-source-d7e13f22c3acec1fe75d3f7c
    resource: repo://libs/evidence-acceptance/src/diff/oasdiffRunner.ts
  - id: openwiki-source-feaf4e64c269397a25f93a3d
    resource: repo://libs/evidence-agent/src/sensors/native/nativeApiSensor.ts
  - id: openwiki-source-e945d84c4f7201722caecdad
    resource: repo://libs/evidence-api/src/delivery/addressing.ts
  - id: openwiki-source-53303a19d90a404248f1d663
    resource: repo://libs/evidence-api/src/delivery/fieldOrigin.ts
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
  - id: openwiki-source-aac6631a251b846350b2d550
    resource: repo://libs/evidence-mcp/src/server/toolset.ts
generated: { by: "codex", at: "2026-11-17T06:43:02.055Z" }
---

# 交付路由、快照与契约差异

路由/拓扑来自 `evidence-api/src/delivery`，比较来自 `evidence-acceptance/src/diff/compareContracts.ts`。不发明接口，也不以“重新投影”掩盖破坏性变化。`buildDelivery(document)` 与 loaded index+overlay 的 buildProjection 最终形成同一 draft snapshot。

## Context、服务和跨边界

buildDeliveryTopology 每个 Context 一个 service，而非每表一个服务，避免把一组请求/确认拆成分布式事务。serviceId 用 context 的稳定 ID，公开 URI 从业务根开始。service 用 routePrefixes 和精确 routes 声明实际所有权，最终 overlay routes 参与重新计算。分类顺序是：回答其他 Context 的 evidence-role socket → capability；否则 pre_contract → channel、domain → domain、其余 fulfillment。

- channel 承载询价/报价，签约向 core 单向推进，不回写渠道。
- fulfillment 持有合同履约账；domain 回答计算/检查，不持履约账。
- capability 用独立合同支持支付/物流等可替换能力。

跨 context 的 evidence plays_role 定义供应方 supplies、消费方 consumes 和 capability async link，确认在供应方自己的时钟形成回调。Domain 被规则 binding/ref 或 references 读取时为 reads/sync；pre_contract 到 parent contract 为 signs/sync。links 按 ID 去重排序，services 按 context 排序；替换能力提供方不应改变 core paths。

部署 compose 是占位草图：image/port 非发布配置，但 EVIDENCE_MODEL/CONTEXT/SERVICE_KIND/ROUTE_PREFIXES/ROUTES、依赖和 expose 来自同一 topology；Traefik 逐操作按 Method 与完整路径正则路由；OpenAPI x-evidence-services 复用它，不能各写一套边界。

## HTTP 寻址与角色

routes 从业务聚合根生成，Context 不加公共前缀：合同 /product-procurements、征询 /product-inquiries、领域事实 /products。履约项嵌在合同主 URI 下；proposal 按 references 嵌在征询下，方案成单与直接签约均返回合同主 URI。每个创建实体都有主 GET，集合有 list GET；具有 modeled id 的独立 other_evidence 提供顶层只读查询。

segment allocator 在全局业务根与局部兄弟资源命名空间分配，真实冲突用稳定身份后缀，不受无关角色和 Context 重命名影响；operationId 为稳定 camelCase。itemPath 指实体主 GET，集合 self 指集合 GET；parameterEntityRefs 显式标明模板参数属于哪个实体。

`childShape` 不依赖 references 箭头方向，读取 child endpoint 的 cardinality；只有所有已发现 max=1 才 singleton，未知不推断唯一。最终寻址使用业务名词，如单例 /payment 与集合 /payments/{paymentId}；仅集合增加实例参数，确认同样有主 GET。

callerRoles 从根合同 roleRefs 按 responsibleRoleRef 收窄，再保留 participant.party 真正 plays 的 role.party。空集合仍保留路由、OpenAPI 与 topology，但 exposure=internal；模型角色线索不是运行时授权实现。

## 字段来源就是 payload 合同

fieldFor 优先 derived（可解析规则或已声明 derivedByRuleRef），其次 service-time（started_at/expired_at/signed_at/confirmed_at/created_at），最后 caller。悬空 derived rule 也不能把字段降成客户端输入。

POST 仅 caller，additionalProperties=false；derived/stamped 在响应 component 标 readOnly、x-evidence-origin、caller-input=false 及规则引用。业务时间 required/keyData/timestamp 的建模约束在 schema 层检查。契约能声明“不接受回填时间”，实际后端仍须执行拒绝；生成类型/静态检查并非 HTTP 防护已实施。

交付树包含 openapi、topology、routes、deployment.compose、projection、http-journeys（runtimeValidated=false）和可选 limitations。缺 confirmation/服务端派生 runtime 等未实现能力明示，不生成虚假闭环。

## oasdiff 是兼容性权威

旧 `apiDiff.ts`、自定义十三种 breaking taxonomy、field shifted 分类、renderApiDiff 和增量 patchDeliveryRoutes 已删除。现在完整投影最终 OpenAPI，再 **异步** compareContracts；没有“补丁路由自动修好”的隐藏路径。

compareContracts 拒绝不同 modelId、任一侧 error diagnostics 和无效 OpenAPI，返回 base/target modelDigest，以及 oasdiff 原生 changes、Markdown changelog、full details。原生等级 INFO=1、WARN=2、ERR=3，**level>=2 即 breaking**。不要再依赖 ROUTE_REMOVED/RULE_CHANGED 等旧私有枚举；语义扩展的 full diff 与 HTTP breaking changelog 应分别理解。

OasdiffRunner 固定版本 1.38.0：binary precedence 为显式 options、EVIDENCE_OASDIFF_BIN、从已安装包位置上溯的 cache、PATH。compare 不联网下载；安装用 `pnpm api:setup`。临时目录写空 config、两份 canonical contract，以 execFile 无 shell 执行 version、changelog JSON/Markdown 和 diff JSON；禁 external refs，默认 30 秒、16MiB buffer，finally 清理。版本/输出不合法或执行失败保留 stdout/stderr 并抛 OasdiffError，不降级成自制比较器。

`evidence diff <base> <target>` 默认 Markdown，兼容 `diff api` 默认 JSON；0 无 breaking、1 breaking、2 工具/输入错误。比较只读，不支持 --out。旧 api diff 使用同一库比较而非旧 0/3/1 约定。

## 实时草稿、摘要和导出

桌面有 live revision 与 saved project 两条路径：livePreviewOf 仅分析 renderer 提供 document/baseDocument，无磁盘读取，返回 revision、双 digest、原生 diff/changelog、coverage/issues、route bindings 和 canExportDraft（无 block）。baseline 是编辑器打开时快照，保存不重置。

useDeliveryHub debounce 并丢弃过期 reply；只有当前 accepted analysis 可导出。exportLiveDelivery 在任何 async picker 前 structuredClone 并完成分析，拒绝 expectedModelDigest 不符或 block；选择目录期间不重读 canvas。输出正常交付文件并附 api-changes.md 和 draft-status.json（mode=draft、releaseAuthorized=false、双摘要、issues）。取消不是失败，异常返回 failed。

draft breaking 是 warn，仍可导出带警示草稿；release sensor 将其升级 block。saved preview/export 重新从 disk 投影，不具备 live 的预览摘要握手，保存后导出描述的是当下 disk。

## 展示与测试

DeliveryHub 全览显示 services/routePrefixes/route counts/kind notes、sync/async crossings、bindings 的角色/exposure 和 limitations；差异页展示双摘要、原生 changelog/changes、coverage、非 API_ALIGNED 问题，支持定位和复制 Markdown，不再展示旧字段 shifted taxonomy。LiveApiProvider 让画布复用相同 bindings，inspector 通过 browser-safe delivery field entry 显示 Input/CEL Derived/Service Timestamp。MCP 的两个交付工具从 saved readDelivery 获取相同边界，不写模型。

routes/topology/fieldContract specs 保护稳定寻址、角色和字段纪律；oasdiffRunner/compare/breakingScenarios/evolution specs 保护真实原生比较与版本失败；desktop liveDeliveryIpc/useDeliveryHub specs 保护 no-disk、冻结、摘要 pin、过期 reply、baseline 和 disabled export。

相关：[API 投影](./api-projection.md) · [工作区](../desktop/workspace-surfaces.md) · [CLI 验收](../workflows/cli-governance.md)
