# FM Schema v3 文件格式

## 1. 目录与事实源

```text
fm-model/
├── model.yaml
├── README.md
├── 00-overview.md
├── 01-glossary.md
├── 02-business-patterns.md       # 派生文档
├── discovery/                    # 可选，非正式事实
├── entities/                     # 必需；Fulfillment 也在此目录
├── relationships/                # 可省略
├── rules/                        # 可省略
├── business-patterns/            # 可省略
├── validation/                   # 可选测试输入
│   ├── instances/
│   └── scenarios/
└── generated/
    ├── model.json
    ├── traceability.json
    └── simulation.json
```

`model.yaml` 与分片 YAML 是模型事实源；`discovery/` 保存候选和问题；`validation/` 是测试输入；Markdown 与 `generated/` 是说明或派生产物。每个 YAML 文件只包含一个文档。

同一目录格式支持纯领域、纯渠道和混合范围；不新增领域模型类型或绩效 profile。Fulfillment 是 `entities/` 中 `category: context`、`kind: fulfillment` 的 Entity，不存在独立履约目录或第二个履约对象。无履约时只是不出现该类 Entity。`README.md` 和 overview 说明当前范围与未展开部分，不靠假合同满足输出结构。

## 2. 稳定 ID 与文件名

ID 只使用小写 ASCII 字母、数字、`.` 和 `-`，以字母开头。显示名称放在 `label`。文件名把 ID 中的 `.` 替换为 `--`：

```text
role.subscriber                    → entities/role--subscriber.yaml
fulfillment.subscription-payment  → entities/fulfillment--subscription-payment.yaml
pattern.multi-channel-payment     → business-patterns/pattern--multi-channel-payment.yaml
```

改变标签不改变 ID；替换业务概念时创建新 ID，并删除旧对象及引用。

### 业务属性命名与 YAML 排版（本地统一约定）

区分协议字段和业务属性，避免把一次属性改名变成另一套 FM 格式：

- 协议字段保持 Schema 的拼写，例如 `contextRef`、`valueType`、`keyData`、`derivedByRuleRef`、`asOf`；不改为 snake_case。
- 所有 Entity category 的 `attributes[].name` 统一小写 ASCII `snake_case`：以字母开头，后续为小写字母、数字或分隔单词的单个下划线；不允许首尾下划线、连续下划线或大写字母。示例：`profile_id`、`requested_minor_units`、`address_line_2`。
- Rule `target.attribute`、CEL 点访问和静态索引、Instance `values` 的直接键、lineage 的 `#属性名` 与定义逐字一致；禁止只改定义、不改引用。CEL binding 别名、内置函数（如 `startsWith`）、事件类型和自由 map 内的外部原始键不属于 Entity 属性名，不做全局字符串替换。
- 原始材料／外部 API 的旧字段名可在 `notes` 或词汇表记录映射；遇到改名冲突先确认概念，不合并不同属性。加载器、校验器和编译器均不自动改名，也不写回源文件。
- YAML 使用两空格缩进、无 tab、块式结构，列表项缩进到父键下；一个文件一个文档。实际时间戳用引号保持 RFC 3339 字符串，不让 YAML 将其转换为日期对象。
- 属性定义按 `name → label → valueType → required → keyData → meaning → derivedByRuleRef → notes` 排列。按 Schema 省略不适用的可选键，不填 null 或编造派生规则来凑齐模板。属性条目的业务顺序保持稳定，不要求字母排序。

```yaml
attributes:
  - name: requested_minor_units
    label: 请求支付金额
    valueType: int
    required: true
    keyData: true
    meaning: 请求支付的最小货币单位整数金额
    derivedByRuleRef: rule.payment-request-amount
```

命名、类型和引用一致性是硬校验；键顺序与缩进是 Agent 生成／维护规范，不改变 YAML 映射语义，不作为模型业务有效性的拒绝条件。只有有对应业务依据时才使用上述金额和派生示例。

## 3. Manifest 与人工状态

```yaml
type: fm_model
schemaVersion: '3.0'
id: subscription-service
name: 订阅服务履约模型
version: '3.0.0'
ruleLanguage: CEL
modelStatus: draft
stakeholderReview:
  status: pending
entryContextRefs:
  - context.subscription
```

`entryContextRefs` 可以直接引用 Domain、Pre-contract 或 Channel Context，不要求包含 Contract。示例见 `domain-modeling.md`。

状态：

- `draft`：仍有待确认事实；review 必须不是 confirmed；
- `reviewed`：具名业务方已经检查，review 必须为 reviewed；
- `confirmed`：具名业务方明确确认，review 必须为 confirmed，并提供 `reviewer`、`reviewedAt`；
- review 为 `rejected` 时模型保持 `draft`，并保留具名审核人与时间。

Agent 不得自行将状态提升为 reviewed／confirmed。

## 4. Entity 种类

| category      | kind                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `evidence`    | `rfp`、`proposal`、`contract`、`fulfillment_request`、`fulfillment_confirmation`、`other_evidence` |
| `participant` | `party`、`thing`                                                                                   |
| `role`        | `party`、`domain`、`third_party`、`context`、`evidence`                                            |
| `context`     | `contract`、`fulfillment`、`pre_contract`、`channel`、`domain`、`external`                         |

### Evidence 必备时间属性（本地硬约束）

| kind                                     | `attributes[].name` 必须包含 |
| ---------------------------------------- | ---------------------------- |
| `rfp`、`proposal`、`fulfillment_request` | `started_at`、`expired_at`   |
| `contract`                               | `signed_at`                  |
| `fulfillment_confirmation`               | `confirmed_at`               |
| `other_evidence`                         | `created_at`                 |

每个字段必须在对应 Entity 源 YAML 中唯一、显式定义为 `valueType: timestamp`、`required: true`、`keyData: true`，同时填写 label、meaning。不是 Entity 顶层字段，也不是仅在实例或说明中补充；编译器保留定义但不注入缺省字段。Context／Role／Participant 不套用此表。

表中的类型属性、具体实例值和生成规则分开：所有必备时间都允许非派生输入，类型结构不要求实例日期或 `derivedByRuleRef`；有来源的生成规则存在时才定义 CEL。三类时刻凭证不套请求区间或过期时间，各类型的必备时间不能互换。

所有关键时间仍须执行 [来源映射](./provenance.md)，真实口径冲突不能用自由 timestamp 参数规避。每个实例必须具有确定的 RFC 3339 时间值，非派生必填值在形成时给出，派生值按 [实例执行规则](traceability-and-simulation.md) 在场景结束前产生。null、无期限说明、占位日期或 `openEndedReason` 均不能代替有效时间。正式类型文件不填写虚构的实例日期，合成实例也不证明业务已约定某个固定时长。

### Contract Context 和两个 Role

```yaml
type: entity
id: context.subscription
category: context
kind: contract
label: 订阅合同上下文
rootRefs:
  - contract.subscription
```

```yaml
type: entity
id: contract.subscription
category: evidence
kind: contract
label: 订阅服务合同
contextRef: context.subscription
roleRefs:
  - role.subscriber
  - role.service-provider
attributes:
  - name: signed_at
    label: 签约时间
    valueType: timestamp
    required: true
    keyData: true
    meaning: 该合同的签约时间
```

Contract 必须引用两个不同、同 Contract Context 的 Party Role，不要求玩家已经建模。上例只展开 signed_at 的类型含义，不推定签约等于下单或权益生效；哪种行为构成签约若有真实争议，仍须业务澄清。

同理，Confirmation 的 confirmed_at 可写 meaning“该凭证的履约确认时间”，Other Evidence 的 created_at 可写 meaning“该凭证的形成时间”；它们均为 required/keyData timestamp，可不填 derivedByRuleRef。确认采信哪一业务事件、补录凭证与原事件的时间关系，只在有业务依据时另作属性／规则映射，不默认等于回调或入库时间，不补造已完成结果。

### Fulfillment

每项 Fulfillment 自身就是 Contract 的子 Context，只定义责任边界：

```yaml
type: entity
id: fulfillment.subscription-payment
category: context
kind: fulfillment
label: 支付订阅费用
parentContextRef: context.subscription
```

Contract Context 是业务聚合／服务边界；Fulfillment 是一项责任及其弹性边界。Request、Confirmation、Evidence Role 和履约 Rule 以 `contextRef` 直接指向 Fulfillment ID，不得放入 Contract Context。相关 Contract 从父 Contract Context 的根 Evidence 确定，成员索引从各对象的 `contextRef` 构建。

### Domain Context 与 Thing

```yaml
type: entity
id: context.content
category: context
kind: domain
label: 内容领域上下文
rootRefs:
  - thing.subscription-content
```

```yaml
type: entity
id: thing.subscription-content
category: participant
kind: thing
label: 订阅内容
contextRef: context.content
```

Thing 必须属于 Domain Context，可表示具有领域身份的地点、标的物或其他事物。Party 保持在 Context 外，通过 `plays_role` 进入上下文；Domain 内也可有 Party Role 表达参与身份。Party/Thing 是并列 kind，不存在 `party.thing`。领域属性、关系与 CEL Rule 都是同格式模型的一部分，详见 `domain-modeling.md`。

### Role 可以独立存在

```yaml
type: entity
id: role.external-service-provider
category: role
kind: third_party
label: 外部服务提供方
contextRef: fulfillment.subscription-payment
```

不要添加占位 Party 或 `playerRef`。Contract Party Role 保持在 Contract Context，不复制到 Fulfillment。

### 已知 Participant 扮演 Role

```yaml
type: relationship
id: relation.customer-plays-subscriber
kind: plays_role
sourceRef: party.customer
targetRef: role.subscriber
label: 客户扮演订阅方
```

只有来源明确同一稳定对象时才建立。

### Evidence Role 是开放确认插槽

```yaml
type: entity
id: role.qualified-payment-confirmation
category: role
kind: evidence
label: 合格付款确认
contextRef: fulfillment.subscription-payment
```

具体玩家只出现在独立 `plays_role` Relationship 中。

## 5. Fulfillment、Evidence 与 Rule

Request、具体 Confirmation、Evidence Role 和履约 Rule 都以 `contextRef` 指向 Fulfillment；Evidence 的 `responsibleRoleRef` 指向父 Contract Context 中负责形成该凭证的 Party Role。

Request 必须显式定义 `started_at` 与 `expired_at`，两者都是 required/keyData timestamp。区间不再在 Fulfillment 中重复声明；存在字段不等于期限业务来源已经充分。

每个 Fulfillment 以唯一 bool completion CEL Rule 表达完成条件。`any`、`all`、`count`、`amount` 和具名人工业务确认都使用明确 Evidence bindings 和 CEL；Breach 同样使用 bool CEL Rule。具体 Confirmation 只属于一个 Fulfillment；重复结果用多个 Evidence Instance 表达，不复制 Confirmation 类型。

Thing 不进入 Fulfillment 清单。实际涉及 Thing 的 Request 或其他业务 Evidence 通过 `references` 指向它；辅助凭证通过 `evidences` 指向其证明的业务 Evidence。

## 6. 合同前与渠道

RFP／Proposal 必须位于 `pre_contract` 或 `channel` Context，不得放入 Contract Context：

```text
RFP → Proposal → Contract
```

Proposal 可以通过跨 Context 的 `precedes` 指向最终 Contract，以保留签约来源。合同前协商和合同履约仍是不同边界，但 RFP／Proposal 均须显式定义 `started_at`、`expired_at`，不因尚未签约而省略时间。

## 7. Relationship

允许的 kind：`plays_role`、`references`、`evidences`、`precedes`、`derived_from`、`uses_role`。

方向固定：`precedes` 为较早 Evidence→较晚 Evidence，`references` 为业务 Evidence→Thing，`evidences` 为 Other Evidence→被证明 Evidence，`plays_role` 为外部时刻 Evidence→Evidence Role，`uses_role` 为业务 Entity→非 Party Role。Fulfillment 不得成为 Evidence 图端点。允许有业务依据的 Proposal→Contract、父 Contract→子 Request 以及 Evidence→Thing 跨 Context 关系；Relationship 标签不能替代来源。

关系两端可按已确认业务规则声明基数。`sourceCardinality` 表示针对一个 target 可关联多少个 source；`targetCardinality` 表示针对一个 source 可关联多少个 target。`min` 为非负整数，`max` 为不小于 1 的整数或 `many`：

```yaml
type: relationship
id: relation.inquiry-to-quotes
kind: precedes
sourceRef: rfp.product-inquiry
targetRef: proposal.product-quote
label: 一份询价可产生一至多份报价
sourceCardinality:
  min: 1
  max: 1
targetCardinality:
  min: 1
  max: many
```

省略端点基数表示业务材料没有声明该约束，不表示 `0..many`。基数声明随 Relationship 保留到编译结果，Schema 与语义校验检查结构及 `max >= min`；当前通用场景没有 Relationship Instance，因此不会运行验证实例数量。履约完成所需的确认数量仍使用有来源的 Evidence 集合 binding 和 CEL completion Rule，不能由关系基数替代。

## 8. Business Pattern

有复用、平台或中台诉求时，每个模式写一个 `business-patterns/*.yaml`。必填内容包括业务目标、运营不变量、领域中立主张、业务脊梁、变化点、合同案例、领域案例、复用状态和人工评审。

- `candidate`：一个领域案例即可；
- `supported`：至少两个 Contract Context 与两个 Domain Context；
- `confirmed`：在 supported 基础上还需要具名 stakeholder confirmation。

完整格式与提取方法见 `business-pattern-extraction.md`。

## 9. 关键数据、Rule 与编译

金额、数量、业务时间、KPI 或审计结论使用 `keyData: true`。派生属性用 `derivedByRuleRef` 指向唯一 CEL derivation Rule；来源从 CEL AST 自动提取。

编译结果包含按 ID 排序的 `entities`、`relationships`、`rules` 和 `businessPatterns`；Fulfillment 已包含在 `entities` 中。`generated/model.json`、`traceability.json`、`simulation.json`、`timeline.json` 与 `02-business-patterns.md` 均可删除重建。时间线只包含 Evidence Instance；Context 是泳道，Thing 仅是引用目标。
