# FM / 8X Flow 语义规则

## 1. 核心视角与发现顺序

FM 建模业务如何通过合同、履约请求和确定性凭证证明权利、责任、金额、时间、KPI、结果与异常追责。API、数据库、服务、队列和页面不是 FM 核心对象。

通用建模顺序是：

```text
寻找 Contract Context 与两个参与 Role
→ 寻找主要 Fulfillment 与凭证
→ 沿违约建立新的 Fulfillment，直到外部争议边界
→ 将明确出现的参与方与标的物划入领域边界
```

这里的“参与方”首先是黄色 Role，不等于必须先创建绿色 Participant Party。Role 可以独立成立；Participant 只在依据明确其稳定身份，或需要表达跨上下文同一性时建立。

四色原型映射：

- 粉色 moment-interval 映射为 Evidence；
- 黄色 role 映射为 Role；
- 绿色 party-place-thing 映射为 Participant；
- 蓝色 description 按作用映射为 Evidence 条款、Thing 属性或 CEL Rule；Schema v2 暂不新增独立 Description Entity。

## 2. Contract 与 Role

一个 Contract Context 是两个 Role 之间业务交互证据的聚合。Contract 必须：

- 位于 `contract` Context，并成为该 Context 的 root；
- 通过 `roleRefs` 引用恰好两个不同、同 Context 的 Party Role；
- 不要求这两个 Role 存在显式 Participant 扮演者；
- 不直接连接另一个 Contract。

合同、权利方、义务方和 Evidence 责任首先都用 Role 表达。`Party Role` 表示角色性质，不意味着模型中必须存在 Participant Party。

## 3. Role

允许的 Role kind：

- `party`：合同或履约中的参与身份，例如购买方、销售方、服务使用方、服务提供方；
- `domain`：价格、资格、权益、验收等领域能力角色；
- `third_party`：当前边界不展开的外部机构或协作者；
- `context`：当前模型不展开内部逻辑的其它 Context；
- `evidence`：由其它 Context 的确定性时刻 Evidence 扮演的凭证角色。

Role 必须属于 Context，但不要求存在入向 `plays_role`。发现 Role 后才检查依据是否明确扮演者：

```text
依据明确某个稳定 Customer 扮演 Subscriber
→ 建立 party.customer 与 plays_role

依据只出现某个外部服务 Role
→ 停在 Role，不补造 Party
```

不得仅凭角色名称推断同一 Participant。多个上下文中的购买方、订阅方、使用方或服务方 Role，只有在依据明确表达同一稳定实体时才建立共同玩家。

## 4. Participant（party-place-thing）

- `party`：跨上下文保持身份的现实个人、组织或法人；Party 保持在业务 Context 外，通过 `plays_role` 进入上下文。
- `place`：具有业务身份的地点或场所。
- `thing`：交易、履约或领域能力围绕的标的物。

Participant 不是每个 Role 的必填“上级”。同一 Participant 可以扮演多个 Role；Role 也可以没有已建模玩家。运行时某个具体实例扮演角色，不等于类型模型必须枚举所有实例或供应商。

## 5. Evidence

允许的 Evidence kind：

- `rfp`：索取提案，打开合约前时段；
- `proposal`：响应 RFP 的报价、方案或承诺；
- `contract`：双方签约时刻凭证；
- `fulfillment_request`：权利方主张义务方在期限内履约的时段凭证；
- `fulfillment_confirmation`：义务方完成或部分完成履约的时刻凭证；
- `other_evidence`：不直接关闭履约时段但必须留存的确定性记录。

Evidence 必须属于 Context。除 Contract 外，每个具体 Evidence 通过 `responsibleRoleRef` 指向同 Context 的 Party Role。该 Role 是否有显式 Participant 玩家不影响 Evidence 的完整性。

运行时凭证只能追加。取消、退款、冲正、更正、补偿和赔偿必须创建新 Evidence 或新 Fulfillment，不能修改旧凭证。

关键金额、数量、业务时间、KPI 和审计结论在属性上标记 `keyData: true`。没有 `derivedByRuleRef` 的关键属性是所属 Evidence 自身断言的事实；有 `derivedByRuleRef` 的关键属性必须通过 CEL AST 追溯到已建模属性。不要为同一依赖再维护手写属性引用。

## 6. Fulfillment

`fulfillment` 是第一等多元语义关系，不是新业务实体。它必须指定：

- 所属 Contract 和 Context；
- 权利方 Party Role 与义务方 Party Role；
- 一个 Fulfillment Request；
- 一个或多个 Confirmation 目标；
- 完成策略；
- Request/Confirmation 的业务触发；
- 可选标的物；
- 可选违约条件与后果。

Confirmation 目标有两类：

1. 同 Context 的具体 `fulfillment_confirmation`；
2. 同 Context 的 `role/evidence`，表示可由其它 Context 的确定性凭证扮演的确认插槽。

约束：

- 权利方和义务方不同，且都来自 Contract 的两个 Party Role；
- Request 的 `responsibleRoleRef` 等于权利方；
- 具体 Confirmation 的 `responsibleRoleRef` 等于义务方；
- Evidence Role 不重复声明责任方，责任仍由 Fulfillment 的 `obligorRoleRef` 表达；
- 一个 Request 恰好属于一个 Fulfillment；
- Confirmation 目标可以被多个 Fulfillment 共享，但每个使用者必须给出等价证明理由；
- 多次同类运行时确认用 completion policy 表达，不复制类型节点。

## 7. Role 扮演与跨上下文

`plays_role` 是显式但可选的关系：

- Participant Party → Party Role；
- Participant Party 或 External Context → Third-party Role；
- Participant Place/Thing → Domain Role；
- Context → Context Role；
- Fulfillment Confirmation / Other Evidence → Evidence Role。

Evidence Role 是开放注册点：

- 不保存 `sourceEvidenceRefs`；
- 可以暂时没有玩家，也可以有多个入向 `plays_role`；
- 新玩家只新增自己的 Evidence 和 Relationship，不修改核心 Role；
- 玩家必须是另一个 Context 的确定性时刻 Evidence；Request、Contract、RFP 和 Proposal 不能证明确定结果。

跨上下文允许：

1. Proposal → Contract 的签约依据；
2. 时刻 Evidence 间的 `cross_context_reference`；
3. 时刻 Evidence → Evidence Role 的 `plays_role`。

不要使用 Contract → Contract，也不要让核心合同依赖外部合同内部的 Request。

## 8. Trigger 与实现边界

自动触发不产生系统参与方。`schedule`、`domain_event`、`integration_event` 或 `rule` 记录机制，`actsForRoleRef` 指向它代表行动的业务 Role。调度器、API、队列、SDK、数据库和服务均不建成 Participant Party。

## 9. 模型验证与业务确认

`validation/instances/` 保存明确标为测试数据的 Evidence Instance，`validation/scenarios/` 保存固定 `asOf` 的追加式场景。场景只根据当时已形成、对 acting Role 可见的凭证执行 CEL 并推导 Fulfillment 状态。

必须区分：

- `machineValidated`：Schema、引用、属性追溯和场景结构合法；
- `simulationPassed`：给定单据实例产生了声明的规则与履约结果；
- `stakeholderReview.confirmed`：具名业务审核者在明确时间完成确认。

前两项不能自动推出第三项。模拟值不是真实业务事实，不得回写 Entity、Rule 或 Contract 条款。
