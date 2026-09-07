# 同一 FM 格式中的领域建模

8X Flow 本身包含领域部分。领域与履约分离的是知识和弹性边界，不是文件格式。纯领域模型与混合模型都使用 Schema v3 的 `model.yaml`、`entities/`、`relationships/`、`rules/`，不另建领域 DSL，也不为通过校验补造合同。

## 1. 范围与发现顺序

```text
领域问题与已知事实
→ Domain Context 与对象身份
→ 属性、关系和上下文角色
→ 行为条件、状态约束、资格与计算
→ 按需连接渠道／履约
→ 校验、属性追溯与领域专家评审
```

合同不是领域建模的前置条件。同一 CRM 中，客户信息、绩效履约、签约渠道和拨号工具可以分别进入；当前只要求客户信息时，不扩展成整个 CRM。

## 2. 对象不是全部归为 Thing

| 语义                             | 当前 FM 表达                                                     |
| -------------------------------- | ---------------------------------------------------------------- |
| 稳定的人或组织                   | `participant / party`，保持 Context 外                           |
| 地点                             | `participant / place`，属于 Domain Context                       |
| 有独立身份的资料、产品或其他事物 | `participant / thing`，属于 Domain Context                       |
| 对象的局部数据                   | Entity `attributes`，不按每个字段创建 Thing                      |
| 上下文中的参与身份               | `role / party`；Domain Context 也可有 Party Role，不等于合同角色 |
| 领域能力插槽                     | `role / domain`；声明依赖不等于能力内部逻辑已被建模              |
| 领域边界                         | `context / domain`，`rootRefs` 指向上下文内部根对象              |

Party、Place、Thing 是 Participant 的并列 kind，不存在 `party.thing` 类型。标的物是对象在当前业务中的用途，不是新的 Entity category。

候选示例：客户本人是 Party；有独立身份的客户档案是 Thing；手机号通常是属性。只有来源说明联系方式有独立生命周期时，才进一步建为 Thing。真实数据记录是实例，不为每个客户生成一个类型文件。

## 3. 最小领域模型与同格式交付

```yaml
# model.yaml
type: fm_model
schemaVersion: '3.0'
id: customer-information
name: 客户信息领域模型
version: '1.0.0'
ruleLanguage: CEL
modelStatus: draft
stakeholderReview:
  status: pending
entryContextRefs:
  - context.customer-information
```

```yaml
# entities/context--customer-information.yaml
type: entity
id: context.customer-information
category: context
kind: domain
label: 客户信息领域
rootRefs:
  - thing.customer-profile
```

```yaml
# entities/thing--customer-profile.yaml
type: entity
id: thing.customer-profile
category: participant
kind: thing
label: 客户档案
contextRef: context.customer-information
attributes:
  - name: profile_id
    label: 档案标识
    valueType: string
    required: true
    meaning: 在客户信息领域内区分档案的标识
  - name: archived
    label: 已归档
    valueType: bool
    required: true
    meaning: 档案是否已经归档
```

这些是模型定义，不是已确认业务事实或生产实例。示例不自动确立当前项目的身份规则。

纯领域可省略 `fulfillments/`，编译 JSON 保留空 `fulfillments` 数组；`entryContextRefs` 直接指向领域上下文。`README.md` 说明当前范围、不展开部分、来源和表达 gap，不添加工作流字段。

## 4. 关系与身份

沿用当前 Relationship kind：

- 同一 Domain Context 的对象、角色间用 `references` 表达引用，`label`／`notes` 解释具体含义；派生关系可用 `derived_from`，属性派生的唯一依赖事实仍由 CEL AST 生成。
- Context 外的稳定 Party 通过 `plays_role` 扮演上下文内的 Party Role；档案可 `references` 该本地 Role，不直接把跨 Context 的 Party 引用伪装为局部关系。
- 能力依赖用 `uses_role` 指向非 Party Role；对象扮演能力用允许的 `plays_role`。Role 不因为存在而要求补造玩家。
- 连接履约时用 `subjectRefs` 引用真实 Participant，或使用适当的 Role 插槽；领域对象本身不是履约完成凭证。
- 跨上下文的业务结果依现有 Evidence bridge／Evidence Role 规则；不得为了方便把任意跨域对象引用改成 `cross_context_reference`。

`references` 不自动表达组合、拥有权、基数或级联删除。当前 Schema 没有这些专用字段；必要语义先明确记录，不能把一条带标签的线声称为已验证的完整关联约束。

## 5. 规则、行为条件与状态

同一 `rules/` 中的 Rule 以 `contextRef` 指向 Domain Context：

- `derivation`：属性计算；target 必须在该 Rule 的上下文。
- `invariant`：对象或关系的一致性约束，不仅限于凭证。
- `eligibility`：领域资格判定。
- `precondition`：领域操作的前置条件。
- `completion`／`breach`：履约语义，不用来给普通对象状态起别名。

例如已确认“归档档案不能继续修改”时：

```yaml
type: rule
id: rule.profile-editable
kind: precondition
label: 客户档案可修改条件
contextRef: context.customer-information
bindings:
  profile:
    ref: thing.customer-profile
expression: '!profile.archived'
resultType: bool
```

规则可以引用已建模 Entity 属性，或用显式 typed binding 表达运行时输入；关键派生数据不能隐藏在无来源变量中。数据流使用 `derivedByRuleRef` 与 CEL AST 追溯，不另写第二份依赖表。

**表达边界**：当前 v3 没有第一等 Command／Operation／状态迁移实体。属性和 CEL 可表达状态、允许条件和结果约束，但不会自动建立操作调度、状态机或证明条件已被运行时执行。未能机器表达的迁移、关系基数或复杂算法要列为 gap，不能用假 Fulfillment、任意扩展字段或脚本 DSL 填洞。需要扩展时先确认具体缺口，再改 Schema／校验／投影，不能称本轮已实现完整领域执行引擎。

## 6. 验收

所有领域模型运行结构校验、编译和属性 lineage，检查：

1. 领域入口、根对象和 Context 引用正确。
2. 对象身份有来源；Party 与档案等信息对象没有混淆。
3. Place/Thing 在 Domain Context，Party 在 Context 外，角色与玩家分开。
4. 关系端点与方向合法，CEL 属性存在、派生目标一致、依赖无环。
5. 领域专家能解释规则的正常、边界及反例；未覆盖内容不因结构通过而消失。
6. 没有为通过校验补造 Contract、Fulfillment、期限或合同 Role。

现有 `validation/` 模拟器只实例化 Evidence，不能实例化 Thing／Party。纯领域的结构和 lineage 通过，不代表领域实例场景、操作或状态机模拟通过；不要创建假 Evidence 来绕过限制。真实领域凭证可按 `other_evidence` 及责任 Role 正常表达，与把任何领域对象改称凭证是两回事。
