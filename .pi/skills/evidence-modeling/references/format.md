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
├── entities/                     # 必需
├── fulfillments/                 # 有履约时使用；可省略或为空
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

同一目录格式支持纯领域、纯渠道和混合范围；不新增领域模型类型或绩效 profile。无履约可省略 `fulfillments/`，编译为 `fulfillments: []`；已有履约文档仍按全部 v3 约束校验。`README.md` 和 overview 说明当前范围与未展开部分，不靠假合同满足输出结构。

## 2. 稳定 ID 与文件名

ID 只使用小写 ASCII 字母、数字、`.` 和 `-`，以字母开头。显示名称放在 `label`。文件名把 ID 中的 `.` 替换为 `--`：

```text
role.subscriber                    → entities/role--subscriber.yaml
fulfillment.subscription-payment  → fulfillments/fulfillment--subscription-payment.yaml
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
| `participant` | `party`、`place`、`thing`                                                                          |
| `role`        | `party`、`domain`、`third_party`、`context`、`evidence`                                            |
| `context`     | `contract`、`fulfillment`、`pre_contract`、`channel`、`domain`、`external`                         |

### Evidence 必备时间属性（本地硬约束）

| kind                                     | `attributes[].name` 必须包含 |
| ---------------------------------------- | ---------------------------- |
| `rfp`、`proposal`、`fulfillment_request` | `start_at`、`expired_at`     |
| `contract`                               | `signed_at`                  |
| `fulfillment_confirmation`               | `confirmed_at`               |
| `other_evidence`                         | `created_at`                 |

每个字段必须在对应 Entity 源 YAML 中唯一、显式定义为 `valueType: timestamp`、`required: true`、`keyData: true`，同时填写 label、meaning。不是 Entity 顶层字段，也不是仅在实例或说明中补充；编译器保留定义但不注入缺省字段。Context／Role／Participant 不套用此表。

RFP、Proposal、Request 必须有确定的截止时间，不能用 null、无期限说明、占位日期或 `openEndedReason` 替代。可通过明确输入或有来源的 CEL 规则得到截止时刻；缺依据先回到发现。正式类型文件不填写虚构的运行时日期，实例的对应值才是带时区的 RFC 3339 时间戳。

此本地约束收紧 FM v3：旧 `startedAt`／`expiresAt`／`confirmedAt`／`signedAt` 不替代上述必备属性，不自动改名或迁移既有业务工件。相关 CEL、interval 与测试实例须同步更新。

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
    meaning: 双方合同成立时间
```

Contract 必须引用两个不同、同 Contract Context 的 Party Role，不要求玩家已经建模。

### Fulfillment Context

每项 Fulfillment 必须位于 Contract 的子 Context：

```yaml
type: entity
id: context.subscription-payment-fulfillment
category: context
kind: fulfillment
label: 订阅付款履约上下文
parentContextRef: context.subscription
```

Contract Context 是业务聚合／服务边界；Fulfillment Context 是弹性边界。不得把 Fulfillment、Request、Confirmation 或履约 Rule 直接放入 Contract Context。

### Domain Context、Place 与 Thing

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

Place 和 Thing 必须属于 Domain Context。Party 保持在 Context 外，通过 `plays_role` 进入上下文；Domain 内也可有 Party Role 表达参与身份。Party/Place/Thing 是并列 kind，不存在 `party.thing`。领域属性、关系与 CEL Rule 都是同格式模型的一部分，详见 `domain-modeling.md`。

### Role 可以独立存在

```yaml
type: entity
id: role.external-service-provider
category: role
kind: third_party
label: 外部服务提供方
contextRef: context.subscription-payment-fulfillment
```

不要添加占位 Party 或 `playerRef`。Contract Party Role 保持在 Contract Context，不复制到 Fulfillment Context。

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
contextRef: context.subscription-payment-fulfillment
```

具体玩家只出现在独立 `plays_role` Relationship 中。

## 5. Fulfillment 与 Request interval

```yaml
type: fulfillment
id: fulfillment.subscription-payment
label: 支付订阅费用
contextRef: context.subscription-payment-fulfillment
contractRef: contract.subscription
rightHolderRoleRef: role.service-provider
obligorRoleRef: role.subscriber
requestRef: request.subscription-payment
requestInterval:
  startAttribute: start_at
  endAttribute: expired_at
confirmationRefs:
  - role.qualified-payment-confirmation
subjectRefs:
  - thing.subscription-content
completionPolicy:
  mode: any
requestTrigger:
  kind: domain_event
  eventType: SubscriptionContractSigned
  actsForRoleRef: role.service-provider
confirmationTriggers:
  - confirmationRef: role.qualified-payment-confirmation
    trigger:
      kind: integration_event
      eventType: QualifiedPaymentConfirmed
      actsForRoleRef: role.subscriber
```

Request 与具体 Confirmation 都属于该 Fulfillment Context；它们的 `responsibleRoleRef` 分别指向父 Contract Context 中的权利方和义务方。

Request 的 interval 属性必须：

- 位于 Request Entity；
- `valueType: timestamp`；
- `required: true`；
- `keyData: true`。

`startAttribute` 固定为 `start_at`，`endAttribute` 固定为 `expired_at`，两者缺一不可。不再接受 `openEndedReason`；材料未明确截止时刻或计算依据时必须保持待确认，不得擅自填补。

### completionPolicy

- `any`：任一合格确认完成；
- `all`：全部确认目标完成；
- `count`：同类运行时确认达到 `minimumConfirmations`；
- `amount`：由 bool completion CEL Rule 判断累计金额；
- `manual`：由人工业务确认或指定最终确认判断。

Confirmation 被多个 Fulfillment 共用时，每个使用者都要填写 `sharedConfirmationRationale`。

### Trigger 与 Breach

Trigger kind：`manual`、`schedule`、`domain_event`、`integration_event`、`rule`。所有 trigger 都要有 `actsForRoleRef`；系统名称只能作为机制描述。

Breach outcome：

- `fulfillment`：启动新履约；
- `terminate_contract`：按合同终止；
- `external_dispute`：进入模型外争议；
- `record_only`：只记录，必须说明合同依据。

## 6. 合同前与渠道

RFP／Proposal 必须位于 `pre_contract` 或 `channel` Context，不得放入 Contract Context：

```text
RFP → Proposal → Contract
```

Proposal 可以通过跨 Context 的 `precedes` 指向最终 Contract，以保留签约来源。合同前协商和合同履约仍是不同边界，但 RFP／Proposal 均须显式定义 `start_at`、`expired_at`，不因尚未签约而省略时间。

## 7. Relationship

允许的 kind：`plays_role`、`references`、`evidences`、`precedes`、`derived_from`、`cross_context_reference`、`uses_role`。

方向固定为玩家→Role、前序→后序、证明材料→被证明对象、来源→派生对象。同 Context 的领域对象可用 `references` 等合法关系；Relationship 标签不能替代未实现的基数／状态机约束。

跨 Context 的 Evidence 协作限于签约来源、时刻凭证或时刻 Evidence→Evidence Role；Participant／Context 的合法 Role 扮演、能力引用及 Fulfillment.subjectRefs 另按各自类型规则检查，不等于履约证明。

## 8. Business Pattern

有复用、平台或中台诉求时，每个模式写一个 `business-patterns/*.yaml`。必填内容包括业务目标、运营不变量、领域中立主张、业务脊梁、变化点、合同案例、领域案例、复用状态和人工评审。

- `candidate`：一个领域案例即可；
- `supported`：至少两个 Contract Context 与两个 Domain Context；
- `confirmed`：在 supported 基础上还需要具名 stakeholder confirmation。

完整格式与提取方法见 `business-pattern-extraction.md`。

## 9. 关键数据、Rule 与编译

金额、数量、业务时间、KPI 或审计结论使用 `keyData: true`。派生属性用 `derivedByRuleRef` 指向唯一 CEL derivation Rule；来源从 CEL AST 自动提取。

编译结果包含按 ID 排序的 `entities`、`fulfillments`、`relationships`、`rules` 和 `businessPatterns`。`generated/model.json`、`traceability.json`、`simulation.json` 与 `02-business-patterns.md` 均可删除重建。
