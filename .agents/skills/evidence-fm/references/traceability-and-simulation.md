# 关键数据、属性追溯与单据模拟

## 1. 三类检查

- **结构一致性**回答模型是否可解析、引用与责任是否成立。
- **关键数据台账**回答每项金额、期限、数量、时间差从哪来。
- **单据模拟**回答只凭当时可见的凭证，业务角色能否完成操作。

三者不可互相替代：

```text
machineValidated → keyDataAccounted → simulationPassed
```



## 2. 关键数据项与台账

关键数据项是凭证上承载权责的金额、期限、数量、比例、时间差或 KPI 结论。它在 Entity Attribute 上以 `keyData: true` 标记，并且必须有确定提供方。

### 2.1 逐项判定

对每张凭证的每个关键数据项，按顺序判定：

| 判定                         | 表达                                                             |
| ---------------------------- | ---------------------------------------------------------------- |
| 由合同约定或领域事实提供     | 先落为合同/领域对象属性，再由派生规则读取；不把数值留在说明文字里 |
| 由前序凭证属性提供           | 写派生规则，表达式读取该属性；属性挂 `derivedByRuleRef`           |
| 由形成方记录的结果事实       | 保持 `asserted`，在 `meaning` 写明形成方，并由完成规则核对一致    |
| 由请求方形成时记录的输入     | 保持 `asserted`，限定为编号、发起时间、地址、描述、申请数量等形成输入 |
| 规则暂时无法表达             | 记为能力限制或业务缺口，不填默认值、占位日期或自由参数           |

派生规则只读取已建模属性；关键值的全部输入都要成为 Entity Attribute，不能藏在没有来源的标量绑定里。来源由 CEL AST 提取，不另写 `sourceAttributeRefs`。集合必须显式声明 `cardinality: many`，并通过 `all`、`exists`、`filter`、`map` 访问。

### 2.2 禁止写法

| 现象                                     | 为什么错                                       | 正确做法                                             |
| ---------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| 把计算结果写进 Instance 值，属性仍是输入 | 生产边消失，接口把派生值当客户端入参           | 属性挂派生规则，实例值只作测试数据                   |
| 账期、窗口、费率只写在 notes 或对话里    | 规则没有输入可读，只能手填                     | 先落为合同属性，再写规则                             |
| 确认里重复抄写前序凭证的单号             | 同一数据两处维护，引用形同虚设                 | 用引用指向凭证，单号只留在凭证本身                   |
| 用默认值、示例公式或恒真条件补洞         | 把未知伪装成事实                               | 保留缺口或能力限制                                   |
| 只建引用边，不建数据边                   | 单据链可看，金额与期限不可复算                 | 引用与派生同批落地                                   |
| 请求体接收可派生字段                     | 客户端可改写合同算出的值                       | 由服务端按规则计算，请求体只收形成输入               |

### 2.3 台账输出

```bash
npx evidence-model check "$FM_ROOT" --json
```

在桌面端或已接入的 Harness 内，`run_sensors` 工具返回同一份报告的 `keyDataSummary`。分类为：`derived`、`contract-term`、`domain-source`、`negotiation-source`、`result-fact`、`request-input`、`needs-decision`，并列出 `needsDecision` 与派生来源。

`needsDecision` 是待决清单，不是机器错误：每项必须给出提供方结论或补规则。引擎按 Entity 种类分类，不能判断业务意图；不得通过改名、改分类或删标记消除清单。

## 3. 属性追溯验证

```bash
npx evidence-model lineage "$FM_ROOT" --out "$FM_ROOT/generated/traceability.json"
```

校验与报告覆盖：

- CEL 读取的 Entity Attribute 必须存在；
- derivation target、`derivedByRuleRef` 和结果类型必须相互一致；
- 关键派生属性至少读取一个已建模属性；
- 集合 binding 的 cardinality 与 macro 用法一致；
- 属性派生图不得成环；
- 非 derivation 规则列为约束，不伪装成数据生产边；
- 输出按稳定属性路径和 Rule ID 排序。

`traceability.json` 是可删除重建的确定性产物，不是新的事实源；台账结论与业务来源由人工判断，不由脚本代替。

## 4. Validation Suite

当前模拟器只实例化 Evidence，不实例化 Party／Thing。纯领域可以通过结构校验、CEL 编译和 lineage，但不能据此声称领域实例或状态机模拟通过；不要把 Thing 改称 Evidence 来绕过限制。纯合同前有适用单据场景时可模拟，不需要补造履约。

场景输入与核心 FM 类型模型分离：

```text
fm-model/validation/
├── instances/
│   └── instance--payment-request.json
└── scenarios/
    └── scenario--successful-payment.json
```

### Evidence Instance

```json
{
  "type": "evidence_instance",
  "id": "instance.payment-request",
  "entityRef": "request.payment",
  "values": {
    "started_at": "2026-09-01T09:01:00Z"
  },
  "basedOn": ["instance.sales-contract"]
}
```

规则：

- 只能实例化 Evidence Entity；
- 非派生的必填属性必须在单据形成时给出；
- 派生必填属性（含 expired_at）可以在测试输入中先缺省，但场景结束前必须由已声明的 CEL evaluation 产生；无推导、结果为 null 或非 RFC 3339 时间戳均失败。这不允许省略源 Entity 的时间属性定义；
- `basedOn` 只能指向更早可用的单据；需要 `other_evidence` 才能形成的凭证，必须在 `basedOn` 中引用这些补充证据，且其形成时间不得早于必需证据；同一合同内一个 Confirmation 实例共同完成多个 Request 时，`basedOn` 必须列出每个被完成的 Request Instance，各 Fulfillment 仍分别执行自己的 completion Rule；
- 更正、退款、冲正和补偿新增 Instance，不修改旧 Instance。

### Scenario

```json
{
  "type": "fm_scenario",
  "id": "scenario.successful-payment",
  "label": "成功付款",
  "asOf": "2026-09-01T09:15:00Z",
  "givenInstanceRefs": ["instance.sales-contract"],
  "steps": [
    {
      "sequence": 1,
      "actingRoleRef": "role.seller",
      "issueInstanceRef": "instance.payment-request",
      "availableInstanceRefs": ["instance.sales-contract"]
    },
    {
      "sequence": 2,
      "actingRoleRef": "role.buyer",
      "issueInstanceRef": "instance.payment-confirmation",
      "availableInstanceRefs": ["instance.payment-request"]
    }
  ],
  "evaluations": [
    {
      "ruleRef": "rule.payment-matches-request",
      "bindings": {
        "request": {
          "instanceRef": "instance.payment-request"
        },
        "payment": {
          "instanceRef": "instance.payment-confirmation"
        }
      },
      "expectedResult": true
    }
  ],
  "expectations": {
    "fulfillmentStatuses": [
      {
        "requestInstanceRef": "instance.payment-request",
        "status": "completed"
      }
    ]
  }
}
```

补充证据先存在，再形成依赖它的凭证：在目标步骤之前签发补充证据，或将已经存在的证据放入 `givenInstanceRefs`；目标步骤的可见凭证必须覆盖必要证据。需要同次登记时仍按证据依赖拓扑执行。为必要证据缺失、编号不匹配、时间晚于目标及不可见建立失败验证；未声明补充证据需求的凭证不强加此条件。

`asOf` 必须固定；禁止使用执行机器当前时间。`availableInstanceRefs` 决定角色扮演时该 Role 可以看到什么；省略时只默认包含新单据的 `basedOn`，显式空数组表示没有可见凭证。不能把后续凭证或 facilitator 答案提前暴露。

Rule evaluation binding 支持：

```json
{
  "variableA": {
    "instanceRef": "instance.one"
  },
  "variableB": {
    "instanceRefs": ["instance.a", "instance.b"]
  },
  "now": {
    "value": "2026-09-01T09:15:00Z"
  }
}
```

集合 binding 可以显式使用 `instanceRefs: []`，表示该场景当时没有可用的匹配凭证；不能用占位确认代替空集合。空集合仍须匹配 Rule 的 `cardinality: many`，不是缺省 binding。

Derivation evaluation 还必须给出 `targetInstanceRef`。Rule 中名为 `now` 或 `asOf` 的 `timestamp` binding 可以省略，模拟器会注入 Scenario 的固定 `asOf`；若显式提供，值必须与 `asOf` 完全相同。其它时间输入不得读取机器当前时间。如果单据预填值与计算结果冲突，模拟失败，不静默覆盖。

## 5. 确定性模拟

```bash
npx evidence-model simulate <model-dir> --out <model-dir>/generated/simulation.json
```

可用 `--scenario <id>` 重复选择场景（缺省执行全部）。场景结果同时出现在 `check` 报告的 `scenarioResults` 与 `run_sensors` 的返回值里，无需为常规检查另跑一次。执行器：

1. 校验 Instance 与 Scenario Schema；
2. 按 sequence 追加单据；
3. 检查 acting Role 与 Evidence `responsibleRoleRef`；
4. 保证 `basedOn` 和可见凭证已经形成；
5. 按声明顺序执行 CEL；
6. 计算 `any`、`all`、`count`、`amount` 或显式 manual completion；
7. 按 Request Instance 及其 `basedOn` 后继限定 completion／breach 结果，计算违约状态；
8. 对比期望并输出确定性 JSON。

同一请求的 breach 条件为真时，`breached` 优先于 `completed`，避免迟到的 Confirmation 抹去已经发生的违约。同一合同内的共同 Confirmation 只有在类型模型存在相应 Confirmation→Request `references` Relationship、实例 `basedOn` 包含当前 Request 且该 Fulfillment 的 completion Rule 为真时，才完成该请求；关联另一个 Request 不会自动传播完成状态。Evidence Role 的规则 binding 由模型中的 Evidence→Evidence Role `plays_role` 解析；绑定角色时提供实际玩家实例，不能签发角色实例或用没有扮演关系的凭证替代。角色属性表达对玩家字段的要求，不是角色自己的业务时间或责任。具体跨独立 Context Confirmation Instance 仍须通过 `basedOn` 关联当前 Request Instance，避免把无关凭证误当成履约证明。

## 6. 人工角色扮演包

```bash
npx evidence-model role-play <model-dir> <scenario-id> --out <role-play-dir>
```

场景未通过模拟时命令拒绝生成，已有目录需 `--force` 才替换。

输出包括：

- `facilitator.md`：完整顺序、预期值和预期结果；
- `source-documents/`：开始时已成立、可发给参与者的凭证；
- `blank-documents/`：由各 Role 在演练中填写的单据；
- `role--*.md`：每个 Role 的步骤、可见凭证和当时可用的 CEL 政策表达式，不含预期值或后续答案；
- `audit-checklist.md`：凭证责任、时限、关键数据、异常和口头知识检查；
- `manifest.json`：场景与机器模拟结果。

角色扮演至少检查一个正常场景和一个异常／追责场景。任何必须依赖“大家都知道”的口头事实都记录为模型 gap。人工确认须由业务方明确作出，并核对其覆盖场景、责任及适用版本。
