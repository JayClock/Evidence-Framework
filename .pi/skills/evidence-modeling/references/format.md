# FM Schema v2 文件格式

## 1. 目录与事实源

```text
fm-model/
├── model.yaml
├── README.md
├── 00-overview.md
├── 01-glossary.md
├── 02-business-patterns.md
├── entities/
├── fulfillments/
├── relationships/
├── rules/
├── validation/                 # 可选的单据实例与场景测试
│   ├── instances/
│   └── scenarios/
└── generated/
    ├── model.json
    ├── traceability.json
    └── simulation.json
```

`model.yaml` 和四个核心 YAML 目录是模型事实源；`validation/` 是独立测试输入；Markdown 与 `generated/` 是说明或派生产物。每个 YAML 文件只包含一个文档。

## 2. 稳定 ID 与文件名

ID 只使用小写 ASCII 字母、数字、`.` 和 `-`，以字母开头。显示名称放在 `label`。分片文件名把 ID 中的 `.` 替换为 `--`：

```text
role.subscriber                 → entities/role--subscriber.yaml
fulfillment.subscription-payment → fulfillments/fulfillment--subscription-payment.yaml
```

改变标签或说明不改变 ID；替换业务概念时创建新 ID，并删除旧对象及其引用。

## 3. Manifest

```yaml
type: fm_model
schemaVersion: '2.0'
id: subscription-service
name: 订阅服务履约模型
version: '1.0.0'
ruleLanguage: CEL
entryContextRefs:
  - context.subscription
```

## 4. Entity 种类

| category      | kind                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `evidence`    | `rfp`、`proposal`、`contract`、`fulfillment_request`、`fulfillment_confirmation`、`other_evidence` |
| `participant` | `party`、`place`、`thing`                                                                          |
| `role`        | `party`、`domain`、`third_party`、`context`、`evidence`                                            |
| `context`     | `contract`、`fulfillment`、`pre_contract`、`channel`、`domain`、`external`                         |

### Contract 直接引用两个 Role

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
  - name: signedAt
    label: 签约时间
    valueType: timestamp
    required: true
    meaning: 双方合同成立时间
```

禁止 `partyAssignments`。两个 Role 必须不同、同属该 Contract Context、且 `kind: party`，但不要求玩家已建模。

### Role 可以独立存在

```yaml
type: entity
id: role.external-service-provider
category: role
kind: third_party
label: 外部服务提供方
contextRef: context.subscription
```

不要添加占位 Party 或 `playerRef`。

### 已知 Participant 用 Relationship 扮演 Role

当依据明确某个稳定客户对象扮演订阅方时：

```yaml
type: entity
id: party.customer
category: participant
kind: party
label: 客户
```

```yaml
type: relationship
id: relation.customer-plays-subscriber
kind: plays_role
sourceRef: party.customer
targetRef: role.subscriber
label: 客户扮演订阅方
```

Party 不使用 `contextRef`。同一个 Party 可以扮演多个上下文 Role；没有依据依据时不要建立关系。

### Evidence Role 是开放确认插槽

```yaml
type: entity
id: role.qualified-payment-confirmation
category: role
kind: evidence
label: 合格付款确认
contextRef: context.subscription
```

Evidence Role 不包含 `sourceEvidenceRefs`。具体玩家只出现在独立 Relationship 中。

### Context

```yaml
type: entity
id: context.subscription
category: context
kind: contract
label: 订阅合同上下文
rootRefs:
  - contract.subscription
elasticityBoundaryCandidate: true
```

Fulfillment Context 必须提供 `parentContextRef`。Context 本身不使用 `contextRef`。

## 5. Fulfillment

### 具体 Confirmation

```yaml
type: fulfillment
id: fulfillment.service-access
label: 提供服务访问
contextRef: context.subscription
contractRef: contract.subscription
rightHolderRoleRef: role.subscriber
obligorRoleRef: role.service-provider
requestRef: request.service-access
confirmationRefs:
  - confirmation.service-access
subjectRefs:
  - thing.subscription-service
completionPolicy:
  mode: all
requestTrigger:
  kind: domain_event
  eventType: PaymentConfirmed
  actsForRoleRef: role.subscriber
confirmationTriggers:
  - confirmationRef: confirmation.service-access
    trigger:
      kind: domain_event
      eventType: ServiceAccessGranted
      actsForRoleRef: role.service-provider
```

### Roleized Confirmation

```yaml
type: fulfillment
id: fulfillment.subscription-payment
label: 支付订阅费用
contextRef: context.subscription
contractRef: contract.subscription
rightHolderRoleRef: role.service-provider
obligorRoleRef: role.subscriber
requestRef: request.subscription-payment
confirmationRefs:
  - role.qualified-payment-confirmation
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

`confirmationRefs` 与 `confirmationTriggers[].confirmationRef` 均可指向具体 Confirmation 或 Evidence Role。

### completionPolicy

- `any`：任一合格确认完成；
- `all`：列出的所有确认目标均完成；
- `count`：同类运行时确认达到 `minimumConfirmations`；
- `amount`：由 `completionRuleRef` 判断累计金额；
- `manual`：由人工业务确认或指定最终确认判断。

`amount` 必须引用同 Context 的 bool completion CEL Rule。Confirmation 目标被多个 Fulfillment 共用时，每个使用者必须填写 `sharedConfirmationRationale`。

### Trigger

`kind`：`manual`、`schedule`、`domain_event`、`integration_event`、`rule`。所有 trigger 都要有 `actsForRoleRef`。系统名称只能作为 event/schedule/source 描述，不能成为 Party。

### Breach outcome

- `fulfillment`：启动新的履约；
- `terminate_contract`：按合同终止；
- `external_dispute`：进入模型外争议；
- `record_only`：只记录违约，必须说明合同依据。

## 6. Relationship

```yaml
type: relationship
id: relation.channel-payment-plays-qualified-payment
kind: plays_role
sourceRef: confirmation.channel-payment
targetRef: role.qualified-payment-confirmation
label: 渠道付款确认扮演合格付款确认
```

允许的 kind：`plays_role`、`references`、`evidences`、`precedes`、`derived_from`、`cross_context_reference`、`uses_role`。

方向固定为玩家→Role、前序→后序、证明材料→被证明对象、依据→派生对象。

## 7. 关键数据、Rule 与编译

金额、数量、业务时间、KPI 或审计结论等关键属性使用 `keyData: true`。派生属性还必须用 `derivedByRuleRef` 指向唯一 derivation Rule；依据从 CEL AST 自动提取，不重复手写属性依赖。

所有可执行规则使用 `rules/*.yaml` 中的纯 CEL，详见 `cel-rules.md`。单据实例、场景、求值 binding 和角色扮演格式见 `traceability-and-simulation.md`。

编译结果按 ID 排序、JSON key 稳定、不写生成时间，因此相同输入必须逐字节相同。`traceability.json` 与 `simulation.json` 同样是可删除重建的派生产物。
