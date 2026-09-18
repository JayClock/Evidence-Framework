# CEL 规则

FM Schema v3 直接使用 Common Expression Language（CEL），不再支持 `calculationRule = ...`、自然语言 precondition 或其它自定义表达式 DSL。

## 1. Rule 结构

```yaml
type: rule
id: rule.payment-deadline
kind: derivation
label: 付款截止时间
description: 以付款请求（request.payment）的开始时间为基准增加约定的 30 分钟付款期限，得到该请求的失效时间。
contextRef: fulfillment.payment
bindings:
  self:
    ref: request.payment
expression: 'self.started_at + duration("30m")'
resultType: timestamp
target:
  entityRef: request.payment
  attribute: expired_at
```

`description` 是 Rule 文件内必填的业务解释。说明该规则读取的业务事实、判断或派生方式，以及结果为 true／false 或派生值时代表的业务含义；内容应让不阅读 CEL 的审核者也能理解。涉及模型统一术语时使用“中文名称（具体 Entity ID）”，如“付款请求（request.payment）”“订阅合同（contract.subscription）”“合格付款证明（role.payment-proof）”；引用哪个对象就写哪个实际 ID，不以 Request、Confirmation、Evidence Role 等泛型英文替代具体对象。同一说明中的同一概念保持一致。它不能只复述 `label`、逐字翻译表达式，也不能写 Controller、数据库或定时任务等实现方案。解释中的条件、期限、比例和例外必须有业务来源，不能为了说明完整而补造。

CEL 是纯表达式，因此 `expression` 中禁止赋值。派生目标放在 `target` 中。履约截止、完成与违约 Rule 必须与 Request 一样直接属于对应 Fulfillment；Rule 可以绑定本履约专有 Confirmation，也可以绑定同一 Contract Context 下通过 Request→Confirmation `precedes` Relationship 关联的共同 Confirmation。领域规则则位于 Domain Context，不需要虚构合同或 Request。

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
- 变量名使用 CEL 标识符；别名不等于业务属性。Entity 属性访问与 `target.attribute` 统一 snake_case，和 Entity 定义逐字一致；内置函数如 `startsWith` 保持 CEL 原名；
- 表达式不得引用未声明的顶层变量。

允许的声明类型：`bool`、`int`、`uint`、`double`、`decimal`、`string`、`bytes`、`timestamp`、`duration`、`date`、`money`、`list`、`map`、`dynamic`。

## 4. 推荐表达式

```cel
// 截止时间
self.started_at + duration("30m")

// 金额一致（最小货币单位整数 + 币种）
payment.paid_minor_units == contract.price_minor_units && payment.currency == contract.currency

// 退款资格：集合 binding 使用 cardinality: many；没有凭证不等于时间为 null
payments.size() > 0 && shipments.size() == 0

// SLA 违约
confirmation.confirmed_at > request.expired_at

// 条件赔偿金额；比例必须来自已确认合同事实
breached ? int(double(payment.paid_minor_units) * penaltyRate) : 0

// KPI 达成
actual.call_count >= target.call_count && actual.email_count >= target.email_count
```

不要在 CEL 中写自然语言、SQL、脚本语句、赋值、外部网络调用或实现组件名。

`money` 保留为 FM 语义类型，但 `cel-python` 目前主要用于语法编译，并不提供项目约定的原生 Money 运算。需要精确比较或计算时，优先分别建模 `minor_units: int` 与 `currency: string`；比例、汇率和舍入规则必须来自已确认业务材料，不能由 Agent 猜测。

## 5. 属性派生

实体属性使用 `derivedByRuleRef` 指向唯一 derivation Rule。所有 Evidence 的必备时间属性均为 required、`keyData: true` 的 timestamp，Request 直接以 `started_at`、`expired_at` 表达 interval。RFP／Proposal 的截止时间也可按真实来源用 CEL 派生，但不能缺少属性定义或使用无期限。示例中的 30 分钟不是默认期限，必须有业务依据：

```yaml
attributes:
  - name: expired_at
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
