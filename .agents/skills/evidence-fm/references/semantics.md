# FM 履约建模 Schema v4 语义规则

## 1. 核心视角与发现顺序

同一格式表达合同履约、签约前渠道和领域部分。API、数据库、服务、队列和页面不是核心业务／领域对象。

```text
当前问题、范围与来源事实
→ 识别 Contract、Pre-contract、Domain 上下文
→ 明确合约双方及已知约定，列出全部主履约
→ 先画当前请求—确认骨架，再展开凭证与关键数据
→ 异常新义务重复骨架与追溯，逐枝核对人类终点
→ 区分领域输入、履约标的、完成证据与实现机制
→ 验证实际结构，按需提取 Business Pattern
```

纯领域或合同前范围不补造合同。对外交易与内部绩效使用相同的合约、角色、凭证和履约结构；责任方向由真实约定决定。输入有歧义或来源变更时执行 [输入复核](input-review.md)，领域部分按 [领域建模](domain-modeling.md)。

## 2. Context 与权责履约

Context 的 kind：

- `contract`：两个合同 Role 之间全部业务交互的聚合与责任边界。
- `domain`：领域对象与领域能力的边界。
- `pre_contract`：合同形成前的协商与渠道边界。
- `external`：当前模型不展开的外部边界。

权责履约是 `category: fulfillment` 的 Entity，不定义 kind，也不是 Context。其 `contextRef` 指向所属 Contract Context。一项履约表达请求、完成证明及相关规则，不创建新的责任、访问或部署边界。

`contextRef` 只引用真正的 Context；`parentContextRef` 表达 Context 之间的归属。`fulfillmentRef` 独立表达凭证、证明角色或规则的履约归属，引用的履约必须属于同一个 Contract Context。入口 `entryContextRefs` 只能引用 Context，不能引用履约。

上下文可单独建模或组合。没有履约的范围允许没有 Contract／Fulfillment；这不放松已经存在的凭证和引用约束。FM 边界不自动等于软件模块、事务或部署单元。

## 3. Contract 与责任 Role

Contract 是签约时刻 Evidence，也是 Contract Context 的 root。它引用恰好两个不同、同 Context 的 Party Role，不要求已有 Participant 玩家，不直接连接另一个 Contract。

属于同一合同责任范围的所有 Evidence 均复用该 Contract 的 `roleRefs`。Contract 由双方共同绑定，其余凭证以 `responsibleRoleRef` 指向其中一方；不按凭证、履约或阶段复制角色。合同中的 Party Role 必须被根合同绑定。

明确共享合同责任的 Pre-contract Context 通过 `parentContextRef` 指向 Contract Context。Proposal 经 `precedes` 连接 Contract 时，该责任关联必须与目标合同一致。类型责任关联不表示询报价时合同实例已签署，也不改变合同前凭证的形成上下文或 URI 根。独立合同前 Context 尚无合同责任关联时使用本 Context 的角色，不虚构合同。

## 4. Role 与 Participant

Role kind：`party` 为责任或参与身份；`domain` 为领域能力插槽；`third_party` 为外部协作者；`context` 为由其他 Context 扮演的插槽；`evidence` 为由其他 Context 的确定性时刻凭证扮演的证明插槽。

Participant Party 表达跨上下文保持身份的个人、组织或法人，保持在 Context 外；Participant Thing 表达具有领域身份的标的或其他事物，属于 Domain Context。

只有已知稳定玩家或跨上下文同一性时建立 `plays_role`。同名角色不证明主体相同；岗位、经办人、系统或调度器不自动成为合同责任方。角色扮演不等于完整操作授权，办理一份凭证的代表依据不能扩展成该角色全部权限。

## 5. Evidence 与业务时间

- RFP、Proposal 属于 Pre-contract Context。
- Contract、Fulfillment Request、Fulfillment Confirmation 属于 Contract Context。
- Other Evidence 属于形成并管理它的 Contract、Pre-contract 或 Domain Context。

Request 必须通过 `fulfillmentRef` 属于一项履约。Confirmation 保留唯一形成上下文，可用 `fulfillmentRef` 表达其形成的履约；同一合同中多个 Request 可以通过 `precedes` 关联同一个确认，不复制或搬迁确认。补充凭证始终保留真实形成上下文，服务于某项履约时可用 `fulfillmentRef` 组织。

Request 是记录要求的时段凭证，Confirmation 是记录完成或部分完成结果的时刻凭证。六类凭证的业务时间按 [格式](format.md) 显式定义，并按 [来源映射](provenance.md) 核对事件含义；签约不等于生效、确认不等于回调、凭证形成不等于原事件时间。

必需补充证据必须先存在：用 `evidences` 从 Other Evidence 指向被证明凭证，用 `precedes` 声明有依据的形成先后，实例 `basedOn` 引用已存在证据。目标凭证不得早于必需证据形成。补充证据不是固定流程阶段，不为无此需求的业务强加材料。

运行时 Evidence 只能追加。取消、退款、冲正、更正、补偿和赔偿通过新凭证及有依据的履约表达，不能覆盖旧凭证。这不表示领域 Participant 永不改变，领域状态和操作条件按真实规则建模。

## 6. Fulfillment

每项权责履约具有：

- 一个所属 Contract Context，其根中有唯一 Contract；
- 恰好一个以 `fulfillmentRef` 归属本履约的 Request；
- 一个或多个具体 Confirmation 或跨上下文 Evidence Role；
- 恰好一个以 `fulfillmentRef` 归属本履约的 bool completion Rule；
- 按业务需要定义的前置、派生、违约规则与标的引用。

成员自身声明履约归属，不在 Fulfillment 上重复维护成员、标的、触发、完成或违约索引。Fulfillment 没有独立业务属性、凭证时间、责任角色或实例，不作为 Evidence 关系端点。

Request 与具体 Confirmation 的责任方来自同一合同双方。共享确认由显式 Request→Confirmation 关系纳入各履约，分别按对应请求区间、实例匹配和 completion Rule 判断。多次同类结果使用多个 Evidence Instance，不复制类型节点。

Request 已形成而合格结果尚未形成时为业务上的 pending，不是同步调用中的临时技术状态。

## 7. 直接引用与跨上下文角色化

同一合约内不同履约的凭证、规则可以直接引用。履约之间的分组不构成跨上下文，不要求先建立证明角色。同合同 Evidence→Evidence 的 `references` 表达业务引用，不自动声明先后；需要先后时用有依据的 `precedes`，有派生依据时用 `derived_from`。直接引用仍受实例匹配、业务时间、来源与可见性约束。

允许的 `plays_role`：Participant Party→Party／Third-party Role；Participant Thing→Domain Role；Context→Context Role；External Context→Third-party Role；Fulfillment Confirmation／Other Evidence→Evidence Role。

Evidence Role 是跨上下文的开放证明插槽，可没有玩家或有多个玩家。消费方 Evidence 以 `references` 引用同一 Context 内的 Evidence-as-Role（`category: role / kind: evidence`），外部实际时刻凭证以 `plays_role` 扮演，玩家保留自身上下文与责任。前者是引用证明约定，后者是具体凭证扮演该约定；凭证引用不因此扩展到其他 Role 类型，也不直接引用外部具体凭证。角色没有自身责任人、凭证时间或可签发实例，其属性表达消费方要求的玩家数据。Request、Contract、RFP、Proposal 不充当确定结果玩家；同上下文玩家不通过 Evidence Role 中转。

规则绑定 Evidence Role 必须解析显式玩家的真实实例，不接受角色实例或仅字段相同的无关凭证。跨独立上下文不能以直接 Evidence 引用穿透边界；允许有依据的 Proposal→Contract 签约追溯与 Evidence→Thing 标的引用，外部确定结果通过 Evidence Role 使用。

Role、Pre-contract Context、权责履约可以作为候选业务变化点，但变化点不自动决定部署边界。

## 8. 合同前协商

RFP→Proposal→Contract 是可能的证据主线，不是必须走完的流水线。固定套餐可以 Proposal→Contract 或直接 Contract；询价可以有多个 Proposal。合同只追溯最终形成它的 Proposal，不依赖渠道内部流程。仅展开签约前范围时不虚构未来合同或履约。

## 9. Business Pattern

Business Pattern 表达运营特定、领域中立的责任结构，引用真实 Fulfillment 主线、运营不变量、变化点、Domain 输入、Contract 与 Domain 案例。

一个 Domain 只能支持 candidate；至少两个 Contract Context 与两个 Domain Context 才能成为 supported；confirmed 还需要具名业务方确认。机器不能证明领域中立或复用价值。纯领域模型不为提取模式补造履约，没有 Business Pattern 不影响模型成立。

## 10. 规则、触发与验证

完成、违约与派生逻辑由有来源的 Evidence 属性、明确 bindings 和 CEL 表达。any、all、count、amount 及具名人工确认不内嵌于履约结构。`schedule`、`domain_event`、`integration_event`、`rule` 只描述触发机制，调度器、API、队列和服务不是业务 Party。

机器校验、场景模拟和业务批准分别记录。场景只能使用判断时已形成且对 acting Role 可见的凭证；模拟值不是生产事实，不回写条款。业务确认依据归发现记录与项目计划，模型文件不保存审核状态。
