# HTTP 资源与消费契约

`api.yaml.http` 细化本文件中有来源的候选，覆盖资源表示、超媒体、缓存、流程回映和异步结果发现。不修改 FM，不自动增加查询、调用角色或外部接入 API。

## 调用

```bash
"$PYTHON" "$API_SKILL_DIR/scripts/fm_api.py" check \
  --project-root "$PROJECT_ROOT" --fm "$FM_ROOT" --fm-skill "$FM_SKILL_DIR" \
  --api "$API_FILE" --require-complete

"$PYTHON" "$API_SKILL_DIR/scripts/fm_api.py" project \
  --project-root "$PROJECT_ROOT" --fm "$FM_ROOT" --fm-skill "$FM_SKILL_DIR" \
  --api "$API_FILE" --out "$NEW_OUTPUT_DIR"
```

`projection.json.http` 保存 HTTP 设计结果，`api-contracts.md`、`representation-examples.json`、`http-journeys.json` 从它渲染。全部输出纳入 manifest，API 文件作为整体记录在 `inputDigests.api`。输入只读，来源变更拒绝，输出只创建新目录。

## 输入结构

统一格式由 `schemas/api.schema.json` 定义，API 文件的 schemaVersion 为 3.0。以下为其中的 HTTP 部分：

```yaml
http:
  scopeCapabilityRefs:
    - capability.read-product-as-buyer
  representations: []
  operations: []
  journeys: []
```

这是待填写的 HTTP 范围，空操作和空流程产生 gap。范围只选择本文件的 candidate；不声称范围外能力已有 HTTP 契约，不以 HTTP 配置绕过业务与角色约束。HTTP 部分不重复文件身份或版本。

`http: null` 表示本次未选择 HTTP 设计范围。投影同样保存 null，报告明确未选择，流程 not_evaluated；不将它当作契约已完成。

## 表示、字段与来源

每个 representation 声明 `resourceRef/view/actorRoleRefs/mediaType/fields/example/exampleParameters/links/cache`。

- `view` 复用现有 `singleton/collection/item`，不自动创造新视图。
- `fields` 是白名单；每个字段声明 `name/schema/required/origin`。
- `origin` 为 `client/reference/server/derived`。通过 `fmAttributeRef` 回到真实属性，纯传输身份等技术字段使用 `decision` 说明，不能用它创造未建模业务属性。
- 请求不能包含 server／derived 输入，已声明派生的 FM 属性不能改为客户端自由赋值；required 不等于请求 body 必填。
- FM 时间属性须保持 string＋date-time/date，不用服务器当前时间替换其业务含义。
- `schema` 使用内联 JSON Schema；样例会执行 Schema 和 format 检查。不加载远程 Schema，不支持 `$ref/$dynamicRef/$id`。这些限制不会通过联网或运行任意表达式规避。
- `example` 只填写字段数据；`exampleParameters` 填写这一个合成表示的 URI 参数。工具生成 `_links.self`，不根据该链接自动开放 GET。
- 字段来源和技术说明存在不等于业务来源已获批准。特别是没有派生公式时，Agent 仍须核对值究竟是直接记录、引用还是其他来源。

HAL 集合可用 `embedded: [{rel, representationRefs}]` 显式嵌入同资源的 item 表示；成员保留自己的 self，校验角色与父实例范围。当前不支持递归嵌入，不自动公开完整对象图。集合摘要和详情可定义为不同表示，各自保留字段白名单。

## 超媒体和动作

链接引用 scope 中的 `capabilityRef`；navigation 必须对应 GET，action 对应写操作。一个含动作链接的表示须明确对应其调用角色，不能把多个角色的动作无条件合并展示。

```yaml
links:
  - rel: details
    kind: navigation
    capabilityRef: capability.read-payment
    parameterBindings:
      subscriptionId: { kind: path, name: subscriptionId }
      paymentId: { kind: field, name: id }
```

`path` 来自当前表示的路径参数，`field` 来自当前表示的字段；必须完整提供目标 URI 的参数。HAL 链接只给出目标，method／request／responses 在对应 operation 中，不将 HAL 当作写入表单规范。

可选 `whenRuleRef` 必须指向 FM 的 bool Rule。工具不执行角色和业务条件求值，报告 `availability: not_evaluated`。若流程试图使用未求值的条件动作，将保留 `HTTP_FLOW_CONDITION`，不能以假定条件为真凑 complete。样例中的链接不意味着当前真实调用者获准访问。

## 请求、响应、幂等与缓存

operation 使用 `capabilityRef/request/responses/idempotency/concurrency`；URI、Method、角色、实例 bindings 和 Rule 用途从候选继承，不另写一套覆盖配置。

- 请求字段同样声明来源、类型和样例；当前不支持 GET body。
- responses 显式声明状态、说明、头和可选 `representationRef`；至少说明成功与失败表现。
- 201 的 Location 须定位该能力创建的资源实例；GET 不能创建资源。单例仍可用 POST 追加一次，不变为覆盖原凭证。
- 202 需显式 `resultCapabilityRef`，引用范围内同角色的结果 GET，并给出匹配的 Location；没有结果读取依据时保留 gap，不创造任务接口。
- 创建 Confirmation 与 Completion Rule 满足是两件事；登记合同也不等于签约。
- idempotency 选择 `key/none/not_applicable` 并说明原因。key 必须声明头名称、同键同输入 replay、同键不同输入 reject。这是重试契约，工具不实现去重存储。
- concurrency 选择 `none/if-match` 并说明原因；流程使用 if-match 或幂等键策略时必须提供相应头。
- cache 显式选择 `no-store/private/public`。可缓存时提供 `maxAge/validator`，响应须给出 ETag 或 Last-Modified 样例。工具按明确策略产生 Cache-Control，拒绝与手写响应头矛盾的值。
- public 需要 `publicInvariantReason`；具有动态动作的公共缓存另留 gap。该文字不是机器对隔离安全的证明，业务复核与服务端授权仍必需。
- pagination 仅适用于有对应角色集合 GET 的表示，声明 `cursor/page`、参数名、下一页样例值及 reason。next 使用实际查询参数编码，不套统一页大小或 TTL，也不声明所有历史页永不变化。

不同角色共享 URI／Method 时仍保留各自契约、bindings 和响应。参数名不同不能隐藏路由重合；共享路由的输入、幂等或并发策略不一致时留下分派冲突 gap，不自动扩大权限。

## HTTP 消费流程

journey 声明固定 `actorRoleRef`；每个 step 指定 `capabilityRef/expectStatus/inputs`，再二选一：

1. `entry`：说明已约定的入口和如何取得已有输入，不悄悄猜路径。
2. `via`：跟随前一步返回表示中的 `rel`，或跟随响应头 `Location` 去执行已有 GET。

```yaml
via:
  stepRef: http.create
  header: Location
```

inputs 的 target 为 `path/body/header`，source 为：

- `literal`：明确的合成入口值及 reason；不是默认业务值。
- `response_field`：前序步骤响应 body 的已声明字段。
- `response_header`：前序响应头，名称大小写不敏感。

不支持任意 JSONPath、脚本或远程调用。未映射步骤不产生可消费输出；未来步骤、悬空链接、无权角色、缺少路径／必填 body／幂等头、覆盖链接提供的参数都会被报告。响应 Location 也不能改变当前请求的父实例范围；同资源的响应表示样例须与请求和 Location 的实例参数一致，不能拿另一实例的样例证明流程可达。304 步骤须为带 If-None-Match 或 If-Modified-Since 的 GET 条件请求。

HTTP 流程独立于 FM 签发步骤：可以描述读取、条件读取、链接导航和一次交互中的多份业务证据，不为读取伪造 Evidence。它使用合成响应样例检查数据能否接续，不实际执行服务。`runtimeValidated` 恒为 false；没有旅程返回 `not_evaluated`。每个所选能力至少需有一个 mapped 的 2xx 消费步骤；403 等失败分支及仅 304 回放可以单独映射，但不能代替成功路径覆盖。complete 仅指当前受支持方言和声明范围无检测到的错误或缺口。

## 可运行示例

[商品采购 API 示例](../assets/examples/full-lifecycle/api.yaml) 的 http 部分细化客户、供应商两个商品读取能力：角色不合并，字段来自商品模型，私有缓存复验，客户通过前一步 ETag 做条件读取。不添加报价 GET、采购协议 GET 或外部支付回调。

```bash
EXAMPLE="$API_SKILL_DIR/assets/examples/full-lifecycle"
"$PYTHON" "$API_SKILL_DIR/scripts/fm_api.py" check \
  --project-root "$PROJECT_ROOT" --fm "$EXAMPLE/fm" --fm-skill "$FM_SKILL_DIR" \
  --api "$EXAMPLE/api.yaml" \
  --require-complete
```

预期产生 13 个业务候选，本次仅细化其中 2 个读取契约。没有选择的其他 11 个契约不宣称已完成。示例是合成协议选择，不代表生产数据、缓存策略或业务批准。

## 当前限制

这是可运行的资源／HTTP 消费设计检查，不是运行时服务、鉴权引擎或通用流程执行器。动态可用性、真实证据访问及 CEL 前置条件继续依赖业务和实现验证。条件链接不自动放行。

尚不提供 OpenAPI／Controller 导出、认证协议生成、任意嵌套流程表达式或外部接口抓取；OpenAPI 可作为后续显式投影，不是本阶段完成与否的替代标准。未建模的读取权限、关键数据来源或接口行为必须返回缺口，不能通过填写技术 decision 消除。
