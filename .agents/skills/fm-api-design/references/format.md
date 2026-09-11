# API 文件与投影格式

## 唯一设计输入

项目使用一份 `api.yaml`，默认位于项目根的 `.evidence/api/api.yaml`，与 `.evidence/fm/` 分离；格式为 `schemaVersion: '4.0'`。完整约束见 `schemas/api.schema.json`；对象拒绝未知字段、重复 ID、重复 YAML key、多文档、非 JSON 值和循环结构。

| 字段                   | 职责                                     |
| ---------------------- | ---------------------------------------- |
| `schemaVersion`、`id`  | 文件格式与稳定 API 设计身份              |
| `nonApiActivities`     | 整体 FM 中真实的内部或外部活动及其依据   |
| `sources`、`decisions` | 已有来源与明确技术选择                   |
| `resources`            | 业务名称、FM 对象、路径、身份和数量      |
| `bindings`             | caller_role、parent_child 实例约束       |
| `scenarios`            | API 场景到 FM validation scenario 的引用 |
| `capabilities`         | 角色、视图、方法、效果、场景、规则与依据 |
| `representations`      | 资源字段和导航草图                       |
| `journeys`             | FM 场景步骤回映                          |
| `http`                 | 所有接口的完整 HTTP 契约，必须为对象     |

`http` 包含 `representations/operations/journeys`，没有独立身份、版本或范围选择。每个顶层 capability 都必须有 operation 和成功 HTTP 消费步骤。详见 [HTTP 契约](contracts.md)。顶层表示图只辅助解释资源关系，不能代替完整 HTTP 契约。

全模型覆盖由 CLI 从当前 FM 推导，不接受 Context 子集。`nonApiActivities` 的每项包含 `entityRef`、`handling: internal|external`、`basis`，用于说明实际非接口活动，不用于排除尚未设计的接口。对象已有接口时不能同时声明为非接口活动；Basis 必须引用该 FM 对象或真实业务来源。

```yaml
nonApiActivities:
  - entityRef: confirmation.wechat-payment
    handling: external
    basis:
      fmRefs: [confirmation.wechat-payment, context.wechat-payment]
      reasoning: 外部支付主体提供既有结果，本服务使用该证据而不代替其提供接口
```

上游确认状态只作为来源元数据保留，不在此设置再次审核流程。

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

`project --out <新目录>` 默认使用 `.evidence/api/generated/<批次>/`（相对项目根；命令传绝对路径），按生成请求向尚不存在的批次目录固定生成，不另设目录确认步骤：

- `projection.json`：唯一机器中间结果，包含 `apiId`、资源、全部接口、整体 `contextRefs`／`modelCoverage`、HTTP 契约及诊断。
- `api-capabilities.md`：四列表。
- `design-report.md`：资源、操作、草图和业务步骤覆盖。
- `api-contracts.md`：HTTP 请求响应、表示及消费流程。
- `representation-examples.json`：HTTP 表示合成样例。
- `http-journeys.json`：静态 HTTP 流程结果，runtimeValidated 为 false。
- `openapi.yaml`：确定性 OpenAPI 3.1 交付投影，包含路径、方法、请求响应、HAL Schema、响应 Links 及 FM 扩展元数据。
- `manifest.json`：FM、API、来源摘要，工具及依赖版本和输出摘要。

HTTP 文档必须存在。每个业务接口都必须有完整契约，全部 FM 场景必须回映；缺口默认使检查返回非零，project 不创建交付目录。确无接口的纯内部模型可使用空 operations，但须完整说明整体对象与场景的处理方式，不能静默忽略。

资源投影以 `uris` 表达实际视图：单例 `{singleton: 路径}`；集合 `{collection: 集合路径, item: 实例路径}`。`parameters` 仅包含所需实例参数。输入摘要只有 `fm/api/sources`，API 文件内任意内容变化均使其摘要变化。

OpenAPI 的 `info.version` 使用 `generated`，避免在没有来源时发明业务 API 版本；设计格式版本保存于 `x-fm-api-design-schema-version`。共享 Method＋URI 的角色变体合并为一个 OpenAPI Operation，同时以 `x-fm-capability-refs`、`x-actor-role-refs` 和 `x-fm-operation-variants` 保留来源，不生成认证方案。HAL 运行时链接同时投影为响应 `links`；条件规则通过扩展保留，但 OpenAPI 不执行规则。journey 不伪装成 OpenAPI Operation。

输出不含墙钟、随机 ID、临时路径或安装绝对路径。同一输入、工具及依赖版本产生相同字节；生成结果不手工维护。
