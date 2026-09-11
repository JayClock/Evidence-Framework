# 输入与输出格式

## API 设计输入

`api-design.yaml` 使用 `schemaVersion: '2.0'`。完整约束见 `schemas/api-design.schema.json`，对象严格拒绝未知字段、重复 ID、重复 YAML key 和多文档 YAML。

顶层固定包含：

- `scope.contextRefs`
- `sources`：`id/path/locator/quote`
- `decisions`：API 技术选择
- `resources`：businessName、FM 对象、segment、shape、identity、父资源及 cardinality
- `bindings`：`caller_role` 或 `parent_child`
- `scenarios`：API 场景 ID 到 FM validation scenario 的引用
- `capabilities`：角色、资源视图、Method、effect、场景和约束
- `representations`：字段白名单与链接
- `journeys`：FM 场景步骤回映

每个可判断项使用 `basis`：

```yaml
basis:
  fmRefs: [request.payment, rule.payment-amount]
  sourceRefs: [source.successful-payment]
  decisionRefs: [decision.resource-hierarchy]
  reasoning: 说明这些事实和选择为何支持当前映射
```

`fmRefs` 可引用 FM ID 或 `entity-id#attribute_name`。决定只能支持技术选择，不能代替业务权限或实例归属。

## 业务资源与视图

`businessName` 是业务名称，`segment` 是显式选定的业务路径名称。`shape: collection` 提供 `collection/item` 两种视图，具体实例需要独立定位参数。父实例下唯一的业务对象采用：

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
  reasoning: 该采购协议下唯一的货款支付申请，归属由实例绑定约束
```

`singleton` 只提供同名视图；能力、表示及链接须选择资源实际支持的视图。`parent_scoped` 不带 parameter，但实际凭证仍保留其 FM 实例身份。

每个嵌套资源需有业务数量依据。优先引用端点对应的 FM Relationship；数量未建模而有直接业务来源时，可使用：

```yaml
cardinality:
  max: many
  sourceRefs: [source.installment-payments]
  reasoning: 该业务允许合同下分次申请支付，每份申请单独定位
```

`max` 为正整数或 `many`。数量缺失是 gap，数量与寻址形态矛盾是 error；引用关系未声明相应端点上限也不能视作依据充分。路径选择不补造 FM 基数或运行时唯一性校验。

集合实例的 identity 是联合类型：

```yaml
identity:
  kind: fm_attribute
  parameter: paymentId
  attributeRef: request.payment#request_id
```

或：

```yaml
identity:
  kind: api_resource_id
  parameter: paymentId
  decisionRef: decision.resource-identity
```

API ID 只用于表示定位，不回写 FM，也不证明所属方。

## 输出

`project --out <新目录>` 生成：

- `projection.json`：唯一机器中间结果；
- `api-capabilities.md`：固定四列表；
- `design-report.md`：资源、操作、表示、覆盖与 gap；
- `manifest.json`：输入摘要、工具/依赖版本和前三份输出摘要。

资源投影统一以 `uris` 列出实际视图：单例为 `{singleton: 路径}`，集合为 `{collection: 集合路径, item: 实例路径}`；`parameters` 仅包含实例路径实际所需的参数。Markdown 从这一结构渲染业务名称和路径，不生成额外视图。

投影不含墙钟、随机 ID、临时路径或工具安装绝对路径。相同输入、工具及依赖版本会产生相同字节结果。
