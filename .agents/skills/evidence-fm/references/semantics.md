# FM / 8X Flow Schema v3 语义规则

## 1. 核心视角与发现顺序

FM / 8X Flow 用同一格式表达合同履约、签约前渠道和领域部分。领域建模不是外接格式，也不只是履约模型的占位。API、数据库、服务、队列和页面仍不是核心业务／领域对象。

```text
当前问题、范围与来源事实
→ 识别 Contract／Fulfillment、Pre-contract／Channel、Domain 上下文
→ 按当前已知事实局部展开，可从任一上下文进入
→ 区分领域输入、履约标的、完成证据与实现机制并按需组合
→ 验证实际存在的结构，按需提取 Business Pattern
```

有履约时继续 Role-first：两个合同 Role → 作为 Context 的 Fulfillment 及其请求、确认与 interval → 违约后果及变化点。对外交易与内部绩效共用此机制，只有协议内容不同。领域部分按 `domain-modeling.md`，不先索要合同。

输入有歧义或来源变更时执行 [输入复核](input-review.md)，按当前必要事实处理，不重做完整访谈；候选解释保持为候选。

## 2. Business、Domain 与 Context 边界

业务逻辑源自运营，关注收入、成本、KPI、合规和风险；领域逻辑源自问题域，关注算法、计划、统计、优化及领域能力。二者必须分开：

- `contract` Context：两个合同 Role 之间全部业务交互的聚合，也是服务／业务边界；
- `fulfillment` Context：Contract 的子 Context；它本身就是一项 Fulfillment，同时承载该项责任的请求、确认与规则，是业务弹性边界；
- `domain` Context：承载 Thing 与领域能力，是领域弹性边界；
- `pre_contract`／`channel` Context：合同形成前的渠道与协商边界；
- `external` Context：当前模型不展开的外部边界。

Contract Context 本身不是单一弹性边界。每项 Fulfillment 都是唯一的 `kind: fulfillment` Context，并以 `parentContextRef` 指向所属 Contract Context；不存在与它分离的 Fulfillment 对象。Thing 必须属于 Domain Context；Party 保持在 Context 外。

上述上下文可单独建模或组合，`entryContextRefs` 可直接指向 Domain 或 Channel。没有履约的范围允许没有 Contract／Fulfillment；这不放松已经存在的合同、Request、Fulfillment 或引用的约束。

## 3. Contract 与 Party Role

Contract 是签约时刻 Evidence，也是 Contract Context 的 root。它必须：

- 引用恰好两个不同、同 Contract Context 的 Party Role；
- 不要求这两个 Role 已有 Participant 玩家；
- 不直接连接另一个 Contract。

合同双方和 Evidence 责任首先用 Role 表达。Role 只表示对所连接凭证负责的业务身份；多个上下文中标签相似的 Role，不能据此推断为同一 Participant。

## 4. Role 与 Participant

Role kind：

- `party`：购买方、销售方、服务使用方、客户等合同、渠道或领域上下文中的参与身份；
- `domain`：价格、资格、权益、验收等领域能力插槽；
- `third_party`：当前边界不展开的外部协作者；
- `context`：由其它 Context 扮演的上下文插槽；
- `evidence`：由其它 Context 的确定性时刻 Evidence 扮演的确认插槽。

Contract Party Role 位于 Contract Context。属于该合同责任范围的所有 Evidence 均使用 Contract 的 `roleRefs` 所绑定角色，不为凭证种类或阶段复制角色。Contract 由这两个角色共同绑定；其余 Evidence 的 `responsibleRoleRef` 必须是其中之一，包括 RFP、Proposal、Request、Confirmation 与 Other Evidence。

Fulfillment 通过 `parentContextRef` 归属合同。明确共享该合同责任的 Pre-contract／Channel Context 也用 `parentContextRef` 指向 Contract Context，复用同一组角色；这是类型模型的责任关联，不表示询报价时合同实例已经签署，也不改变凭证各自的 Context 或独立 URI 根。Proposal 通过 `precedes` 连接 Contract 时，该责任关联必须显式给出并与目标合同上下文一致；缺失或不一致直接拒绝，不接受渠道局部角色作为替代。合同责任阶段不定义额外 Party Role，Contract Context 中的 Party Role 必须被根 Contract 绑定。不从相同标签推断责任。独立渠道尚无合同责任关联时使用本 Context 的角色，不虚构合同。

Participant：

- `party`：跨上下文保持身份的个人、组织或法人；保持在 Context 外；
- `thing`：具有领域身份的地点、标的物或其他事物；必须属于 Domain Context。

只有来源明确稳定玩家或跨上下文同一性时才建立 `plays_role`。区分合同责任身份与经办主体：财务、销售、库管等岗位名称本身不构成新增业务 Role 的依据；实际主体可作为 Participant 或凭证经办说明保留。不能为了覆盖节点种类，为每个经办主体复制一套 Role。

角色扮演关系不等于完整操作授权。同一业务角色可以有不同经办主体，但某主体办理一份凭证的依据，不能扩展为它可执行该角色的所有操作。角色复用以明确的合同责任归属为依据；同名本身既不证明复用，也不是复制角色的理由。

## 5. Evidence

Evidence kind：

- `rfp`、`proposal`：位于 Pre-contract／Channel Context；
- `contract`：位于 Contract Context；
- `fulfillment_request`、`fulfillment_confirmation`：位于 Fulfillment Context；
- `other_evidence`：对其他凭证提供补充证明的凭证，位于产生它的业务或领域 Context；不是固定流程阶段。

需要补充证明时，先明确被证明凭证及具体证明内容。必需的 `other_evidence` 必须已经存在，才能形成依赖它的凭证；用 `evidences` 从补充证据指向被证明凭证，并用 `precedes` 明确必要的形成先后。实例中由被证明凭证的 `basedOn` 引用已存在的补充证据，场景在形成目标前提供这些证据。补充证据可以支持 RFP、Proposal、Contract、Request、Confirmation 或其他补充证据，不局限于履约确认。不为没有此需求的凭证强加补充证据。

`created_at` 记录补充凭证自身形成时间，不等于上传时间或其记录的原事件时间；目标凭证的相应业务时间不得早于其必需证据的形成时间。是否分开录入不改变业务依赖，不从图上位置推导接口调用方式。

Request 是记录履约要求的时段 Evidence；Confirmation 是证明履约完成或部分完成的时刻 Evidence。两者各自通过 `responsibleRoleRef` 连接对该凭证负责的 Role，Request → Confirmation 的履约结构表达要求与结果的方向。创建六类凭证时均先按 [格式](./format.md) 的必备时间表展开类型；属性约束、请求区间与实例要求在该处维护。再按 [来源映射](./provenance.md) 核对各时间证明的业务事件与形成依据，区分签约与生效、确认与回调、凭证形成与原事件；类型齐全不代表依据已查明。

运行时 Evidence 只能追加。取消、退款、冲正、更正、补偿和赔偿必须创建新 Evidence 或 Fulfillment，不能修改旧凭证。此约束不等于全部领域 Participant 永不改变；领域状态和行为条件按已确认规则表达，不伪装成履约。

## 6. Fulfillment

`fulfillment` Context 是第一等多元语义节点，同时表达一项责任及其弹性边界，必须指定：

- 父 Contract Context 与具体 Contract；
- Request 与 Confirmation 各自的责任 Role；
- 一个 Fulfillment Request 及其 interval；
- 一个或多个具体 Confirmation 或 Evidence Role；
- 完成策略和双方业务触发；
- 可选 Domain Participant 标的物；
- 可选违约条件与后果。

约束：

- Request 与具体 Confirmation 的 `responsibleRoleRef` 必须引用所属 Contract 的 Party Role；
- Request、Confirmation、Evidence Role 与 Rule 必须以 `contextRef` 直接属于该 Fulfillment；
- 一个 Request 恰好属于一个 Fulfillment；
- 一个具体 Confirmation 只能属于一个 Fulfillment；跨履约复用结果通过外部时刻 Evidence 和 Evidence Role 表达；
- 多次同类运行时确认用多个 Evidence Instance 和 completion CEL Rule，不复制类型节点；
- Fulfillment 本身不持有成员、标的、触发、完成或违约索引。

在 Request 形成而合格 Confirmation 尚未形成时，履约状态是业务上的 `pending`，不是同步调用中的临时技术状态。

## 7. Role 扮演与跨上下文变化点

允许的 `plays_role`：

- Participant Party → Party／Third-party Role；
- Participant Thing → Domain Role；
- Context → Context／Third-party Role；
- Fulfillment Confirmation／Other Evidence → Evidence Role。

Evidence Role 是开放证明插槽：可以没有玩家或有多个玩家；新增渠道只新增外部 Evidence 和 Relationship，不修改核心 Role。Role 没有责任人，不设置 `responsibleRoleRef`／`roleRefs`，没有自身凭证时间或可签发实例；可声明消费者要求的玩家属性。消费方以 `uses_role` 使用它，玩家必须来自另一个 Context 的确定性时刻 Evidence，以 `plays_role` 连接。玩家保留其自身上下文及责任角色，不归入消费方合同责任。Request、Contract、RFP 和 Proposal 不能证明确定结果。规则绑定 Evidence Role 时必须解析显式玩家实例，不接受角色实例或仅字段相同的无关凭证。

跨上下文的 Evidence 协作只允许有来源的 Proposal→Contract、父 Contract→子 Request、Evidence→Thing，以及外部时刻 Evidence→Evidence Role。Thing 必须由实际涉及它的业务 Evidence 引用；本上下文的辅助凭证通过 `evidences` 指向被证明的业务 Evidence；外部结果走 Evidence Role，不用 `evidences` 穿透上下文。Fulfillment 不参与这些关系。

这类 Role、Channel／Pre-contract Context 和 Fulfillment 是候选业务变化点。

## 8. 合同前与渠道

合同前的 RFP／Proposal 与合同履约具有不同的法律和弹性边界，保留各自的凭证时间线和审计关联。责任归属显式关联同一合同时，复用该合同绑定的两个 Role；独立渠道使用本 Context 的角色。合同只追溯最终形成它的 Proposal，不依赖渠道内部流程。

固定套餐可以 Proposal→Contract 或直接 Contract；询价与招标可由一个 RFP 对多个 Proposal，再由被接受 Proposal 指向 Contract。不得强迫所有渠道归并成一条流程。只展开签约前范围时，RFP／Proposal 可以独立存在，不虚构未来 Contract 或 Fulfillment。

## 9. Business Pattern

Business Pattern 表达运营特定、领域中立的履约责任结构。它必须引用真实 Fulfillment 业务脊梁、运营不变量、业务变化点、Domain 输入、Contract 案例和 Domain 案例。

一个 Domain 只能形成 `candidate`；至少两个 Contract Context 与两个 Domain Context 才能成为 `supported`；`confirmed` 还需要具名业务方确认。机器验证不能证明领域中立或复用价值。纯领域模型不为领域能力复用补造履约责任脊梁；没有 Business Pattern 不影响领域模型成立。

## 10. Trigger 与实现边界

`schedule`、`domain_event`、`integration_event` 或 `rule` 只记录触发机制，`actsForRoleRef` 指向它代表的合同 Role。调度器、API、队列、SDK、数据库和服务均不建成 Participant。

## 11. 状态与验证

必须区分：

```text
modelStatus / stakeholderReview
machineValidated → simulationPassed
businessPattern.reuseStatus / stakeholderReview
```

`draft` 模型可以通过结构校验，但不能被称为业务已确认。场景仅根据当时已形成、对 acting Role 可见的凭证执行 CEL；模拟值不是生产事实，不得回写模型条款。
