# API 文件与投影格式

## 唯一设计输入

项目使用一份 `api.yaml`，格式为 `schemaVersion: '3.0'`。完整约束见 `schemas/api.schema.json`；对象拒绝未知字段、重复 ID、重复 YAML key、多文档、非 JSON 值和循环结构。

| 字段                   | 职责                                        |
| ---------------------- | ------------------------------------------- |
| `schemaVersion`、`id`  | 文件格式与稳定 API 设计身份                 |
| `scope.contextRefs`    | 本次选择的业务责任范围                      |
| `sources`、`decisions` | 已有来源与明确技术选择                      |
| `resources`            | 业务名称、FM 对象、路径、身份和数量         |
| `bindings`             | caller_role、parent_child 实例约束          |
| `scenarios`            | API 场景到 FM validation scenario 的引用    |
| `capabilities`         | 角色、视图、方法、效果、场景、规则与依据    |
| `representations`      | 资源字段和导航草图                          |
| `journeys`             | FM 场景步骤回映                             |
| `http`                 | 具体 HTTP 设计范围；未选择时必须显式为 null |

`http` 为对象时包含 `scopeCapabilityRefs/representations/operations/journeys`。它没有独立的文件身份或版本，引用本文件的候选。详见 [HTTP 契约](contracts.md)。草图描述资源关系，HTTP 表示描述实际请求响应，不把未展开的草图假定为完整协议。

每个业务判断项使用 basis：

```yaml
basis:
  fmRefs: [request.payment, rule.payment-amount]
  sourceRefs: [source.successful-payment]
  decisionRefs: [decision.resource-hierarchy]
  reasoning: 说明这些事实和选择为何支持当前映射
```

决定仅支持技术选择，不代替业务权限、实例归属或关键值口径。来源定位包含 `id/path/locator/quote`，文档路径相对 project root。

## 资源与寻址

`businessName` 使用业务称谓，`segment` 显式选定业务路径名称。每一层先确认归属，再确认数量。

父实例下唯一对象采用 singleton：

```yaml
id: resource.payment
businessName: 货款支付申请
entityRef: request.payment
segment: payment
shape: singleton
parentRef: resource.procurement
parentBindingRef: binding.payment-procurement
identity:
  kind: parent_scoped
cardinality:
  relationshipRef: relation.procurement-payment
basis:
  fmRefs: [contract.procurement, request.payment]
  reasoning: 该协议下唯一的支付申请，归属由实例绑定约束
```

单例只提供 `singleton` 视图，无额外子定位参数；实际凭证仍有实例身份。集合提供 `collection/item` 视图，实例使用 `fm_attribute` 或 `api_resource_id` 身份：

```yaml
identity:
  kind: fm_attribute
  parameter: paymentId
  attributeRef: request.payment#request_id
```

```yaml
identity:
  kind: api_resource_id
  parameter: paymentId
  decisionRef: decision.resource-identity
```

API 定位 ID 不回写 FM，也不证明实例所属方。

数量优先引用端点对应的 Relationship；正向使用 targetCardinality，反向使用 sourceCardinality。直接业务来源明确数量时也可写：

```yaml
cardinality:
  max: many
  sourceRefs: [source.installment-payments]
  reasoning: 同一合同允许分次支付，各申请单独定位
```

max 为正整数或 many。缺失数量为 gap，形态或数量冲突为 error；不能用另一层的数量替代本层依据。

## 输出

`project --out <新目录>` 固定生成：

- `projection.json`：唯一机器中间结果，包含 `apiId`、资源、候选、HTTP 设计及全部诊断。
- `api-capabilities.md`：四列表。
- `design-report.md`：资源、操作、草图和业务步骤覆盖。
- `api-contracts.md`：HTTP 请求响应、表示及消费流程。
- `representation-examples.json`：HTTP 表示合成样例。
- `http-journeys.json`：静态 HTTP 流程结果，runtimeValidated 为 false。
- `manifest.json`：FM、API、来源摘要，工具及依赖版本和输出摘要。

`http: null` 对应投影中的 `http: null`，HTTP 报告明确未选择，流程为 not_evaluated，样例为空；不将未选择解释为已完成契约。`--require-complete` 只检查本次声明范围。

资源投影以 `uris` 表达实际视图：单例 `{singleton: 路径}`；集合 `{collection: 集合路径, item: 实例路径}`。`parameters` 仅包含所需实例参数。输入摘要只有 `fm/api/sources`，API 文件内任意内容变化均使其摘要变化。

输出不含墙钟、随机 ID、临时路径或安装绝对路径。同一输入、工具及依赖版本产生相同字节；生成结果不手工维护。
