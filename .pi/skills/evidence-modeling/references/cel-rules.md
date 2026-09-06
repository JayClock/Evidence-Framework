# CEL 规则

FM Schema v3 直接使用 Common Expression Language（CEL），不再支持 `calculationRule = ...`、自然语言 precondition 或其它自定义表达式 DSL。

## 1. Rule 结构

```yaml
type: rule
id: rule.payment-deadline
kind: derivation
label: 付款截止时间
contextRef: context.payment-fulfillment
bindings:
  self:
    ref: request.payment
expression: 'self.startedAt + duration("30m")'
resultType: timestamp
target:
  entityRef: request.payment
  attribute: expiresAt
```

CEL 是纯表达式，因此 `expression` 中禁止赋值。派生目标放在 `target` 中。履约截止、完成与违约 Rule 必须与 Request、Confirmation 一样位于对应 Fulfillment Context；领域规则则位于 Domain Context，不需要虚构合同或 Request。

## 2. Rule kind

- `derivation`：计算属性值，必须有 `target`；
- `precondition`：业务操作前置条件，结果必须是 `bool`；
- `invariant`：领域对象、关系或凭证的一致性约束，结果必须是 `bool`；
- `eligibility`：资格判断，结果必须是 `bool`；
- `completion`：履约完成判断，结果必须是 `bool`；
- `breach`：违约判断，结果必须是 `bool`。

## 3. Bindings

每个顶层变量必须声明：

```yaml
bindings:
  request:
    ref: request.payment
  payment:
    ref: confirmation.payment
  now:
    type: timestamp
```

- `ref` 绑定到模型对象，默认 `cardinality: one`；集合实例必须声明 `cardinality: many`，并通过 CEL collection macro 访问元素属性；
- `type` 声明由运行时传入的标量或结构变量；
- 变量名使用 CEL 标识符；
- 表达式不得引用未声明的顶层变量。

允许的声明类型：`bool`、`int`、`uint`、`double`、`decimal`、`string`、`bytes`、`timestamp`、`duration`、`date`、`money`、`list`、`map`、`dynamic`。

## 4. 推荐表达式

```cel
// 截止时间
self.startedAt + duration("30m")

// 金额一致（最小货币单位整数 + 币种）
payment.paidMinorUnits == contract.priceMinorUnits && payment.currency == contract.currency

// 退款资格
payment.confirmedAt != null && shipment.confirmedAt == null

// SLA 违约
confirmation.confirmedAt > request.expiresAt

// 条件赔偿金额；比例必须来自已确认合同事实
breached ? int(double(payment.paidMinorUnits) * penaltyRate) : 0

// KPI 达成
actual.callCount >= target.callCount && actual.emailCount >= target.emailCount
```

不要在 CEL 中写自然语言、SQL、脚本语句、赋值、外部网络调用或实现组件名。

`money` 保留为 FM 语义类型，但 `cel-python` 目前主要用于语法编译，并不提供项目约定的原生 Money 运算。需要精确比较或计算时，优先分别建模 `minorUnits: int` 与 `currency: string`；比例、汇率和舍入规则必须来自已确认业务材料，不能由 Agent 猜测。

## 5. 属性派生

实体属性使用 `derivedByRuleRef` 指向唯一 derivation Rule。Request interval 引用的开始属性和 fixed 模式的截止属性还必须是 required、`keyData: true` 的 timestamp：

```yaml
attributes:
  - name: expiresAt
    label: 付款截止时间
    valueType: timestamp
    required: true
    keyData: true
    meaning: 本次付款请求失效的时间
    derivedByRuleRef: rule.payment-deadline
```

校验器检查：

- CEL 语法可由 `cel-python` 编译；
- 顶层变量均已声明；
- binding 引用存在；
- bool 规则的 `resultType` 为 `bool`；
- derivation 的 target 属性存在，且 `resultType` 与属性 `valueType` 一致；
- `derivedByRuleRef` 与 Rule target 相互一致；
- CEL 读取的 `binding.attribute` 或静态 `binding["attribute"]` 存在，动态 Entity 索引被拒绝，集合 binding 的 cardinality 正确；
- 关键派生属性至少追溯到一个已建模属性，且属性派生图无环。

`build_fm_lineage.py` 从 CEL AST 生成属性追溯图，支持领域 Entity 与 Evidence 属性，不另设手写依赖 DSL。`simulate_fm_model.py` 只使用 `validation/` 中明确提供的 Evidence 单据实例求值，不能实例化 Participant；领域模型结构与 lineage 通过不等于领域实例或状态机模拟通过。

领域行为可用 `precondition`、状态属性和一致性规则表达已有格式承载的条件，但 Rule 不会自动成为 Operation 或状态迁移。需要执行语义时按 `domain-modeling.md` 记录明确的表达缺口，不自造字段或把领域操作改名为 Fulfillment。
