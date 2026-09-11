# 输入与输出格式

## API 设计输入

`api-design.yaml` 使用 `schemaVersion: '1.0'`。完整约束见 `schemas/api-design.schema.json`，对象严格拒绝未知字段、重复 ID、重复 YAML key 和多文档 YAML。

顶层固定包含：

- `scope.contextRefs`
- `sources`：`id/path/locator/quote`
- `decisions`：API 技术选择
- `resources`：FM 对象、segment、identity、父资源
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

identity 是联合类型：

```yaml
identity:
  kind: fm_attribute
  parameter: requestId
  attributeRef: request.payment#request_id
```

或：

```yaml
identity:
  kind: api_resource_id
  parameter: requestId
  decisionRef: decision.resource-identity
```

API ID 只用于表示定位，不回写 FM，也不证明所属方。

## 输出

`project --out <新目录>` 生成：

- `projection.json`：唯一机器中间结果；
- `api-capabilities.md`：固定四列表；
- `design-report.md`：资源、操作、表示、覆盖与 gap；
- `manifest.json`：输入摘要、工具/依赖版本和前三份输出摘要。

投影不含墙钟、随机 ID、临时路径或工具安装绝对路径。相同输入、工具及依赖版本会产生相同字节结果。
