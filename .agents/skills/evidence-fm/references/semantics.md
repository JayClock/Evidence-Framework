# FM 履约建模 Schema v4 语义规则

## 1. 核心视角与发现顺序

同一格式表达合同履约、签约前渠道和领域部分。API、数据库、服务、队列和页面不是核心业务／领域对象。

```text
当前经营过程、问题与范围
→ 按业务分析从收入流与成本结构定位现金权责或绩效约定与责任双方，以主要履约检验理解
→ 先画当前请求—确认骨架，再展开凭证与关键数据
→ 沿凭证增量发现其他合同与协作，保留当前焦点
→ 异常新义务重复骨架与追溯，逐枝核对人类终点
→ 核对参与者、标的及领域边界，用单据推演验证完整责任图
→ 按需提取 Business Pattern
```

约定与责任双方、主要履约及独立责任关系按 [业务分析](business-analysis.md) 核对，不以协议名称或角色齐全替代。现金权责与目标—实际对比是业务发现与凭证组织的核心逻辑，必须能说明合同如何关联收支权责或内部绩效；已知依据直接复用，未知则核对缺口。不新增金额型或 KPI 型 Contract／Context 枚举，经营依据用实际约定与凭证关系解释，不以标签代替。纯领域或合同前范围不补造合同。对外交易与内部绩效使用相同的合约、角色、凭证和履约结构；责任方向由真实约定决定。输入有歧义或来源变更时执行 [输入复核](input-review.md)，领域部分按 [领域建模](domain-modeling.md)。

## 2. Context 与权责履约

Context 的 kind：

- `contract`：两个合同 Role 之间全部业务交互的聚合与责任边界。
- `domain`：领域对象与领域能力的边界。
- `pre_contract`：合同形成前的协商与渠道边界。

“外部”是相对于当前分析范围的位置，不是独立的 Context 类型。已展开的外部上下文仍按真实业务性质使用上述三种 kind；未展开的协作边界按需要使用 Context Role、Third-party Role 或 Domain Role，保留已知能力和未决项，不为占位创建 Context 或虚构玩家。必要结果证明使用具体凭证或 Evidence Role，不能由边界角色代替。

权责履约是 `category: fulfillment` 的 Entity，不定义 kind，也不是 Context。其 `contextRef` 指向所属 Contract Context。一项履约表达请求、完成证明及相关规则，不创建新的责任、访问或部署边界。

`contextRef` 只引用真正的 Context；`parentContextRef` 表达 Context 之间的归属。`fulfillmentRef` 独立表达凭证、证明角色或规则的履约归属，引用的履约必须属于同一个 Contract Context。入口 `entryContextRefs` 只能引用 Context，不能引用履约。

上下文可单独建模或组合。没有履约的范围允许没有 Contract／Fulfillment；这不放松已经存在的凭证和引用约束。FM 边界不自动等于软件模块、事务或部署单元。

## 3. Contract 与责任 Role

Contract 是签约时刻 Evidence，也是 Contract Context 的 root。它引用恰好两个不同、同 Context 的 Party Role，不要求已有 Participant 玩家，不直接连接另一个 Contract。

属于同一合同责任范围的所有 Evidence 均复用该 Contract 的 `roleRefs`。Contract 由双方共同绑定，其余凭证以 `responsibleRoleRef` 指向其中一方；不按凭证、履约或阶段复制角色。合同中的 Party Role 必须被根合同绑定。

明确共享合同责任的 Pre-contract Context 通过 `parentContextRef` 指向 Contract Context。Contract 经 `references` 引用已接受的 Proposal 时，该责任关联必须与引用合同一致。类型责任关联不表示询报价时合同实例已签署，也不改变合同前凭证的形成上下文或 URI 根。独立合同前 Context 尚无合同责任关联时使用本 Context 的角色，不虚构合同。

## 4. Role 与 Participant

Role kind：`party` 为责任或参与身份；`domain` 为领域能力插槽；`third_party` 为外部协作者；`context` 为由其他 Context 扮演的插槽；`evidence` 为由其他 Context 的确定性时刻凭证扮演的证明插槽。

Participant Party 表达跨上下文保持身份的个人、组织或法人，保持在 Context 外；Participant Thing 表达具有领域身份的标的或其他事物，属于 Domain Context。

只有已知稳定玩家或跨上下文同一性时建立 `plays_role`。同名角色不证明主体相同；岗位、经办人、系统或调度器不自动成为合同责任方。角色扮演不等于完整操作授权，办理一份凭证的代表依据不能扩展成该角色全部权限。

### 领域复用的角色选择

初步识别领域边界不自动创建 Domain Context。只消费成熟能力时，按当前抽象对象选择角色，而不是公司内外或部署位置：

- `role / domain`：抽象需要什么领域能力或知识，不限定实现系统，例如有依据的等级计算能力。
- `role / third_party`：抽象提供能力的既有系统／外部协作者，当前不展开其内部，例如只消费身份识别结果的账号系统。图示中的 `3rd-system` 在当前格式使用 `third_party`，不是新增 kind；“外部”相对于当前分析边界，也可以是同组织的其他系统。
- `context / domain`：确实需要且获授权展开内部对象和规则时才建立。已展开的其他 Context 需要角色化协作时用 `role / context`，不将 Context 当作第三方责任主体。

角色归消费方上下文，可暂不绑定玩家；不为已知一个系统名称补造 Party、Thing、合同或 `plays_role`，也不为同一依赖机械创建两种角色。角色选择不放宽第 7 节允许的引用与扮演关系。角色不是结果凭证；需证明履约时仍使用具体凭证或 Evidence Role，不以能力插槽、系统回调或方案成熟度代替完成证明。

### 未澄清合同的 Context Role

合同级建模时，相关未澄清合同以 Context Role（`category: role / kind: context`）表达当前合同需要的外部边界。角色归消费方 Context，名称与说明来自已知业务关系，说明需要什么外部能力及哪些内部责任尚未澄清；没有业务关联的合同只留在交接中，不为凑齐合同清单创建角色。

角色可暂不绑定玩家，不创建虚构 Contract、空壳 Contract Context、内部履约、期限、责任终点或场景实例，不补造 plays_role 关系。已有其他合同模型与无关改动保持不变，不为使用角色而删除它们。后续对应合同闭合并获编辑授权后，保留角色 ID，按真实 Context→Context Role 的 `plays_role` 关系接入，复核当前合同的受影响判断与确认适用性。

Context Role 不代替 Evidence Role 或履约确认，不是可被 Evidence 直接引用的证明凭证。当前合同需要外部结果时，仍按下一节及第 7 节表达有依据的具体确认或开放证明约定，保留责任、匹配与采信条件；没有具体玩家时不宣称已形成结果或模拟成功。必要证明尚未查清时保留缺口，按 [责任范围](responsibility-closure.md) 阻止范围结束和下游交付，不能靠角色化放行；有依据的其他内容仍可按授权保存。

## 5. Evidence 与业务时间

- RFP、Proposal 属于 Pre-contract Context。
- Contract、Fulfillment Request、Fulfillment Confirmation 属于 Contract Context。
- Other Evidence 属于形成并管理它的 Contract、Pre-contract 或 Domain Context。

Request 必须通过 `fulfillmentRef` 属于一项履约。Confirmation 保留唯一形成上下文，可用 `fulfillmentRef` 表达其形成的履约；同一个确认可以通过 `references` 指向同一合同中的多个 Request，不复制或搬迁确认。补充凭证始终保留真实形成上下文，服务于某项履约时可用 `fulfillmentRef` 组织。

Request 是记录要求的时段凭证，Confirmation 是记录完成或部分完成结果的时刻凭证。一次 Request 可对应不同 Confirmation 类型；同类结果的多次确认使用不同实例，不能把一份确认的形成等同于整项履约完成。凭证的时间属性按 [格式](format.md)定义；签约、生效、确认、回调和凭证形成分别保留其业务含义。是否需要进一步回溯，由 [当前判断的来源方法](provenance.md)决定，不从凭证类型推出额外调查步骤。

必需补充证据必须先存在：消费凭证通过 `references` 引用 Other Evidence，说明具体证明作用；实例 `basedOn` 指向已存在证据，规则核对必需性、身份与采信条件。目标凭证不得早于必需证据形成。证明作用和时间先后不另建关系种类。补充证据不是固定流程阶段，不为无此需求的业务强加材料。

运行时 Evidence 只能追加。取消、退款、冲正、更正、补偿和赔偿通过新凭证及有依据的履约表达，不能覆盖旧凭证。这不表示领域 Participant 永不改变，领域状态和操作条件按真实规则建模。

## 6. Fulfillment

每项权责履约具有：

- 一个所属 Contract Context，其根中有唯一 Contract；
- 恰好一个以 `fulfillmentRef` 归属本履约的 Request；
- 一个或多个具体 Confirmation 或跨上下文 Evidence Role；
- 恰好一个以 `fulfillmentRef` 归属本履约的 bool completion Rule；
- 按业务需要定义的前置、派生、违约规则与标的引用。

成员自身声明履约归属，不在 Fulfillment 上重复维护成员、标的、触发、完成或违约索引。Fulfillment 没有独立业务属性、凭证时间、责任角色或实例，不作为 Evidence 关系端点。

Request 与具体 Confirmation 的责任方来自同一合同双方。共享确认由显式 Confirmation→Request `references` 关系纳入各履约，分别按对应请求区间、实例匹配和 completion Rule 判断。多次同类结果使用多个 Evidence Instance，不复制类型节点。

Request 已形成而合格结果尚未形成时为业务上的 pending，不是同步调用中的临时技术状态。

## 7. 直接引用与跨上下文角色化

Relationship 只有 `references` 与 `plays_role`。同一合约内不同履约的凭证、规则可以直接引用；履约分组不构成跨上下文，不要求先建立证明角色。具体凭证的依据引用按“消费凭证→依据凭证”表达，例如 Confirmation→Request、Request→Contract、Contract→Proposal。类型关联不证明某个实例已经形成；实例依赖由 `basedOn` 表达，时间线由实例业务时间与依赖生成。属性派生归 CEL 与其 AST lineage，不另存对象级计算关系。引用仍受实例匹配、业务时间、来源与可见性约束。

允许的 `plays_role`：Participant Party→Party／Third-party Role；Participant Thing→Domain Role；Context→Context Role；Fulfillment Confirmation／Other Evidence→Evidence Role。未展开的第三方系统可保留无玩家的 Third-party Role；明确其内部上下文后，按真实 Context 与 Context Role 表达上下文协作，不将 Context 当作第三方责任主体。

Evidence Role 是跨上下文的开放证明插槽，可没有玩家或有多个玩家。消费方 Evidence 以 `references` 引用同一 Context 内的 Evidence-as-Role（`category: role / kind: evidence`），外部实际时刻凭证以 `plays_role` 扮演，玩家保留自身上下文与责任。前者是引用证明约定，后者是具体凭证扮演该约定；凭证引用不因此扩展到其他 Role 类型。角色没有自身责任人、凭证时间或可签发实例，其属性表达消费方要求的玩家数据。Request、Contract、RFP、Proposal 不充当确定结果玩家；同上下文玩家不通过 Evidence Role 中转。

规则绑定 Evidence Role 必须解析显式玩家的真实实例，不接受角色实例或仅字段相同的无关凭证。无需替换变化点时，可以直接 `references` 外部 Confirmation／Other Evidence；需要开放证明约定时使用 Evidence Role。外部具体凭证保留形成上下文、责任与时间，直接引用不迁移所有权，不使它成为消费合同的共享确认。跨上下文还允许有依据的 Contract→Proposal 签约追溯与 Evidence→Thing 标的引用，不开放对外部 Request、RFP 或 Contract 的任意依赖。

Role、Pre-contract Context、权责履约可以作为候选业务变化点，但变化点不自动决定部署边界。判断同合同直接引用或跨上下文证明时，按需读 [结构对照](../examples/structural-contrasts.md)；图与正反例只解释本节规则，不代替当前来源或新增 Schema。

## 8. 合同前协商

RFP→Proposal→Contract 是可能的证据主线，不是必须走完的流水线。固定套餐可以 Proposal→Contract 或直接 Contract；询价可以有多个 Proposal。合同只追溯最终形成它的 Proposal，不依赖渠道内部流程。仅展开签约前范围时不虚构未来合同或履约。

## 9. Business Pattern

Business Pattern 表达运营特定、领域中立的责任结构，引用真实 Fulfillment 主线、运营不变量、变化点、Domain 输入、Contract 与 Domain 案例。

一个 Domain 的案例只支撑该领域内的主张；声称跨领域复用须引用至少两个 Contract Context 与两个 Domain Context 的真实案例。具名业务方决定按实际来源核对，模式 JSON 不保存审核或复用状态。机器不能证明领域中立、复用价值或人类确认。纯领域模型不为提取模式补造履约，没有 Business Pattern 不影响模型成立。

## 10. 规则、触发与验证

完成、违约与派生逻辑由有来源的 Evidence 属性、明确 bindings 和 CEL 表达。any、all、count、amount 及具名人工确认不内嵌于履约结构。`schedule`、`domain_event`、`integration_event`、`rule` 只描述触发机制，调度器、API、队列和服务不是业务 Party。

机器校验、场景模拟和业务批准分别记录。场景只能使用判断时已形成且对 acting Role 可见的凭证；模拟值不是生产事实，不回写条款。业务确认核对本次提供的人类明确决定与覆盖范围，模型文件不保存审核状态。
