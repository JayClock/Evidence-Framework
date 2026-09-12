# 属性追溯与业务单据模拟

## 1. 两类不同的检查

- 属性追溯回答：关键金额、数量、时间、KPI 或领域结论从哪一个已建模 Entity 属性产生？
- 场景模拟回答：只凭当时可获得的单据，业务 Role 能否完成操作，审计者能否重建凭证责任与结果？

结构合法不等于业务已验证。模型、机器与人工状态必须区分：

```text
modelStatus / model.stakeholderReview
machineValidated → simulationPassed
businessPattern.reuseStatus / businessPattern.stakeholderReview
```

脚本只能自动产生机器校验与模拟结果；没有具名审核人与审核时间时，不得声称业务方已确认。

## 2. 关键数据项

在 Entity Attribute 上使用 `keyData: true`：

```yaml
attributes:
  - name: payable_minor_units
    label: 应付最小货币单位金额
    valueType: int
    required: true
    keyData: true
    meaning: 本次请求要求支付的整数金额
    derivedByRuleRef: rule.requested-amount
```

所有 Evidence 类型的必备时间属性按 `format.md` 定义为 required `timestamp` 且 `keyData: true`；Request 直接以 `started_at` 和 `expired_at` 表达 interval，RFP／Proposal 同样必须有明确截止时间。不支持 open-ended 或 `openEndedReason`。机器 lineage 将关键属性表示为两种来源分类（不是业务来源充分性的判定）：

1. `asserted`：所属 Entity 的非派生输入；在 Evidence 上如合同价格或付款实付金额，在领域对象上如档案的已核验标志。此标记不自动证明事实已获业务方确认；
2. `derived`：由 `derivedByRuleRef` 指向的 CEL derivation 产生。

在运行 lineage 前，对全部关键属性执行 [业务来源映射](./provenance.md)，其中统一维护直接记录、引用、派生和未知的处理。asserted／derived 仅是机器表达分类，不增设业务来源枚举，也不代替真实依据；来源缺口影响本批次职责时执行 [输入复核](input-review.md)。

机器从已声明的 CEL AST 提取依赖并验证类型、引用与环，不会发现业务公式、核实 asserted 值的提供依据，或判断所有业务来源是否充分；这些由业务发现和人工审核承担。

不要另写 `sourceAttributeRefs`。派生来源由 CEL AST 从 `binding.attribute` 访问中提取，避免两份依赖描述漂移。关键派生值使用的全部业务／领域输入必须建模为 Entity Attribute（Evidence 或领域对象属性），不能藏在无来源的 scalar binding 中；Scenario `now`／`asOf` 只用于即时判断，不用于生成持久关键值。属性路径在报告中写作 `<entity-id>#<attribute-name>`，属性名为 snake_case，与 Entity 定义、CEL 访问、派生 target 和 Instance values 的直接键一致。

规则 binding 默认 `cardinality: one`；集合必须显式声明：

```yaml
bindings:
  confirmations:
    ref: confirmation.delivery
    cardinality: many
```

集合属性只能通过 `all`、`exists`、`filter`、`map` 等 CEL collection macro 的局部变量访问。

## 3. 属性追溯验证

```bash
python3 <skill-dir>/scripts/build_fm_lineage.py <model-dir> \
  --output <model-dir>/generated/traceability.json
```

校验与报告覆盖：

- CEL 读取的 Entity Attribute 必须存在；
- derivation target、`derivedByRuleRef` 和结果类型必须相互一致；
- key derived attribute 至少读取一个已建模属性；
- 集合 binding 的 cardinality 与 macro 用法一致；
- 属性派生图不得成环；
- 非 derivation 规则列为约束，不伪装成数据生产边；
- 输出按稳定属性路径和 Rule ID 排序。

`traceability.json` 是可删除重建的确定性产物，不是新的事实源。

## 4. Validation Suite

当前模拟器只实例化 Evidence，不实例化 Party／Thing。纯领域可以通过结构校验、CEL 编译和 lineage，但不能据此声称领域实例或状态机模拟通过；不要把 Thing 改称 Evidence 来绕过限制。纯渠道有适用单据场景时可模拟，不需要补造履约。

场景输入与核心 FM 类型模型分离：

```text
fm-model/validation/
├── instances/
│   └── instance--payment-request.yaml
└── scenarios/
    └── scenario--successful-payment.yaml
```

### Evidence Instance

```yaml
type: evidence_instance
id: instance.payment-request
entityRef: request.payment
values:
  started_at: '2026-09-01T09:01:00Z'
basedOn:
  - instance.sales-contract
```

规则：

- 只能实例化 Evidence Entity；
- 非派生的必填属性必须在单据形成时给出；
- 派生必填属性（含 expired_at）可以在测试输入中先缺省，但场景结束前必须由已声明的 CEL evaluation 产生；无推导、结果为 null 或非 RFC 3339 时间戳均失败。这不允许省略源 Entity 的时间属性定义；
- `basedOn` 只能指向更早可用的单据；需要 `other_evidence` 才能形成的凭证，必须在 `basedOn` 中引用这些补充证据，且其形成时间不得早于必需证据；
- 更正、退款、冲正和补偿新增 Instance，不修改旧 Instance。

### Scenario

```yaml
type: fm_scenario
id: scenario.successful-payment
label: 成功付款
asOf: '2026-09-01T09:15:00Z'
givenInstanceRefs:
  - instance.sales-contract
steps:
  - sequence: 1
    actingRoleRef: role.seller
    issueInstanceRef: instance.payment-request
    availableInstanceRefs:
      - instance.sales-contract
  - sequence: 2
    actingRoleRef: role.buyer
    issueInstanceRef: instance.payment-confirmation
    availableInstanceRefs:
      - instance.payment-request
evaluations:
  - ruleRef: rule.payment-matches-request
    bindings:
      request:
        instanceRef: instance.payment-request
      payment:
        instanceRef: instance.payment-confirmation
    expectedResult: true
expectations:
  fulfillmentStatuses:
    - fulfillmentRef: fulfillment.payment
      requestInstanceRef: instance.payment-request
      status: completed
stakeholderReview:
  status: pending
```

补充证据先存在，再形成依赖它的凭证：在目标步骤之前签发补充证据，或将已经存在的证据放入 `givenInstanceRefs`；目标步骤的可见凭证必须覆盖必要证据。需要同次登记时仍按证据依赖拓扑执行。为必要证据缺失、编号不匹配、时间晚于目标及不可见建立失败验证；未声明补充证据需求的凭证不强加此条件。

`asOf` 必须固定；禁止使用执行机器当前时间。`availableInstanceRefs` 决定角色扮演时该 Role 可以看到什么；省略时只默认包含新单据的 `basedOn`，显式空数组表示没有可见凭证。不能把后续凭证或 facilitator 答案提前暴露。

Rule evaluation binding 支持：

```yaml
variableA: { instanceRef: instance.one }
variableB: { instanceRefs: [instance.a, instance.b] }
now: { value: '2026-09-01T09:15:00Z' }
```

集合 binding 可以显式使用 `instanceRefs: []`，表示该场景当时没有可用的匹配凭证；不能用占位确认代替空集合。空集合仍须匹配 Rule 的 `cardinality: many`，不是缺省 binding。

Derivation evaluation 还必须给出 `targetInstanceRef`。Rule 中名为 `now` 或 `asOf` 的 `timestamp` binding 可以省略，模拟器会注入 Scenario 的固定 `asOf`；若显式提供，值必须与 `asOf` 完全相同。其它时间输入不得读取机器当前时间。如果单据预填值与计算结果冲突，模拟失败，不静默覆盖。

## 5. 确定性模拟

```bash
python3 <skill-dir>/scripts/simulate_fm_model.py <model-dir> \
  --output <model-dir>/generated/simulation.json
```

可用 `--scenario <id>` 重复选择场景。执行器：

1. 校验 Instance 与 Scenario Schema；
2. 按 sequence 追加单据；
3. 检查 acting Role 与 Evidence `responsibleRoleRef`；
4. 保证 `basedOn` 和可见凭证已经形成；
5. 按声明顺序执行 CEL；
6. 计算 `any`、`all`、`count`、`amount` 或显式 manual completion；
7. 按 Request Instance 及其 `basedOn` 后继限定 completion／breach 结果，计算违约状态；
8. 对比期望并输出确定性 JSON。

同一请求的 breach 条件为真时，`breached` 优先于 `completed`，避免迟到的 Confirmation 抹去已经发生的违约。Evidence Role 的规则 binding 由模型中的 Evidence→Evidence Role `plays_role` 解析；绑定角色时提供实际玩家实例，不能签发角色实例或用没有扮演关系的凭证替代。角色属性表达对玩家字段的要求，不是角色自己的业务时间或责任。具体跨 Context Confirmation Instance 仍须通过 `basedOn` 关联当前 Request Instance，避免把无关凭证误当成履约证明。

## 6. 人工角色扮演包

```bash
python3 <skill-dir>/scripts/generate_role_play_pack.py \
  <model-dir> <scenario-id> --output <role-play-dir>
```

输出包括：

- `facilitator.md`：完整顺序、预期值和预期结果；
- `source-documents/`：开始时已成立、可发给参与者的凭证；
- `blank-documents/`：由各 Role 在演练中填写的单据；
- `role--*.md`：每个 Role 的步骤、可见凭证和当时可用的 CEL 政策表达式，不含预期值或后续答案；
- `audit-checklist.md`：凭证责任、时限、关键数据、异常和口头知识检查；
- `manifest.json`：场景、机器模拟和 stakeholder review 状态。

角色扮演至少检查一个正常场景和一个异常／追责场景。任何必须依赖“大家都知道”的口头事实都记录为模型 gap。人工确认必须由业务方显式写入 `stakeholderReview`，不能由 Agent 推断。
