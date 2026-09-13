# 整体模型到接口的设计方法

读取已确认的整体 FM，不设置 Context 子集、不重复业务审核。遍历模型中的全部业务对象与全部场景，直接设计完整接口及 HTTP 契约；技术校验发现真实缺口时报告，不靠局部输出宣称完成。

## 资源

只映射具有明确交互场景的实际 Evidence 或有来源的 Participant。Participant 的身份或经办记录只能说明主体存在，不能代替读取、维护资料等独立业务场景；不为覆盖节点类型而生成接口。Context 用于限定责任范围；除非另有业务对象依据，不把它当作可 CRUD 资源。资源必须声明 `businessName`，用业务对象或行为的名称显式配置 `segment`；不从 FM 的 category、kind 或 ID 拼接路径，也不从 label 猜英文、复数或聚合。能力名称描述业务办理目的，不把“创建 Request”或“追加 Evidence”当成业务能力。只有业务确实称其为确认时，才使用相应的确认名称。

以不同的合同前／渠道 Context、合同 Context 和领域 Context 作为不同 URI 根。Fulfillment 资源通常沿所属父合同 Context 的根继续导航；只有确需独立弹性边界时才拆服务，但服务拆分不改变稳定 URI。跨 Context 的 Proposal → Contract 或合同 → Domain 关系使用超媒体链接，不将整条业务流程嵌入一条 URL。

嵌套 URI 同时需要：

1. 资源图中的 `parentRef`；
2. 匹配的 `parent_child` binding；
3. FM 结构或业务来源，以及为何它表达实例归属的 reasoning。

`precedes`、一般引用和基数不会自动转成父子拥有关系。技术导航可以记录为决定，但不能宣称业务拥有权。CLI 会以 `RESOURCE_CONTEXT_ROOT_MISMATCH` 拒绝跨合同前、合同或领域 Context 的父子 URI；所属父合同相同的 Fulfillment 资源不视为跨根。

## 业务数量与寻址

先确认实例归属，再分别核对每一层的业务数量，不从申请与结果的一对一推定合同下只能有一份申请。

- 每个父实例下至多一个业务对象：`shape: singleton`，用 `identity.kind: parent_scoped` 定位，只提供 `singleton` 视图，不增加子 ID。
- 每个父实例下可有多个业务对象：`shape: collection`，集合提供 `collection` 视图，具体实例提供带自身 ID 的 `item` 视图。
- `cardinality.relationshipRef` 优先引用对应父子对象的 FM Relationship。正向读取 `targetCardinality`，反向读取 `sourceCardinality`；不能拿无关关系或另一层数量作为依据。
- FM 尚未表达但业务来源已明确数量时，可用 `cardinality.max/sourceRefs/reasoning` 保留直接业务依据；技术决定不能充当数量来源，也不能覆盖已有 FM 冲突。
- 缺少数量上限时保留 `RESOURCE_CARDINALITY_UNRESOLVED`，不把省略解释为多份，也不为缩短路径修改 FM。
- 数量上限为 1 时采用单例，`min` 说明业务存在条件；单例可以尚未形成。它不取消凭证实例 ID、责任或审计记录，不自动变成 PUT/PATCH 覆盖更新。重复提交、幂等、更正另需业务及接口契约。

例如业务允许合同下分次支付、每次只有一份支付确认，可用 `/…/{id}/payments/{paymentId}/confirmation`；若合同下仅有一次支付，则可用 `/…/{id}/payment/confirmation`。单复数命名须符合业务用语，不按英文词尾做机器推断。单例和集合都不能突破 Context 根或替代 `parent_child` 约束。

## 补充证据与形成前提

`other_evidence` 是其他凭证的补充证据。生成能力前检查 FM 的 `evidences`、必要 `precedes`、实例 `basedOn`、规则及场景：谁提供什么证据，哪份凭证必须依赖它，目标形成前是否已经存在且可被使用。必需证据缺失时不得形成目标；不能用一个接口的成功响应代替业务证据。

目标能力的 `basis.fmRefs` 引用必要证据、依赖关系及规则，`reasoning` 说明同一业务实例关联、证据引用与可用性检查。已建模的形成条件通过 `ruleBindings` 的 `precondition` 绑定；表达不了的检查保留 gap，不把自然语言说明称为运行时强制校验。

补充证据的创建 URI 不依赖尚未形成的目标凭证 ID，避免形成循环。可在有明确归属的已有申请或合同下追加证据，也可使用独立资源；`evidences` 本身不证明父子归属。目标通过已有证据的引用形成，证据仍证明目标，而非因 URI 嵌套而改变证明对象。

已有证据可以先登记，也可以在一次交互内先登记证据再形成目标；这不是把多个节点强制拆成多个 HTTP 请求。独立接口需要对应调用场景及角色授权。凭证业务形成时间与上传时间分别处理，但必需证据必须先于目标存在。

## 角色与能力

对整体模型中的每项真实业务交互，直接定义 Party Role、资源视图、HTTP 方法、效果及实例约束，不生成角色×视图×方法的笛卡尔探索表。显式关联同一合同责任的合同前、合同及履约凭证统一使用该 Contract 的 `roleRefs`；URI 根仍按凭证所属 Context 划分，角色复用不合并资源根。没有合同关系的独立渠道使用自身角色。输入结构无效时停止并报告，不通过新增角色绕过错误。

调用者必须是有业务依据的 Party Role，不能把岗位、部门或经办 Participant 自动提升为新的调用角色。API 表按业务角色列出能力，经办主体作为办理该能力的业务说明保留；实际操作身份、代理范围和权限仍须有依据，不能把 `plays_role` 当成该角色全部能力的授权。Evidence Role 只是凭证玩家插槽，没有责任人，也不代表可签发单据；不生成角色的提交或 CRUD 接口。消费能力引用实际玩家并校验归属、可见性和业务规则；外部活动可回映为 `external`，没有接口依据不猜测接入 API。实际玩家的 `responsibleRoleRef` 只是其自身上下文的职责线索。每个能力至少引用匹配的 `caller_role`；嵌套资源还要引用自己的 `parent_child`。

GET 对应 read。Evidence 写入只能用 POST + append_evidence。PUT/PATCH/DELETE 覆盖 Evidence 会被拒绝；更正与撤销必须先有业务表达，再设计追加证据。

共享 Method + URI 保留各角色的完整接口契约。按参数形状归一化路由，参数改名不能隐藏冲突；不同效果变体无法证明兼容时保留 gap。

## 表示与超媒体

字段使用白名单并回到 `entity#attribute`。不要默认公开所有 FM 属性；业务时间、关联值、服务端记录值和派生值不能因 required 而变成客户端输入。

链接目标和 URI 参数必须闭合。导航链接需要相应角色的 GET 接口；动作链接引用能力。HAL `_links` 不定义 method、body 或写入契约，也不自动创建 GET。

## 流程回映

遍历所有 FM scenario 的 step sequence，将每步回映到实际接口、internal、external 或真实 gap。接口必须匹配该步骤的角色、凭证效果和场景依据；内部／外部步骤必须匹配整体 `nonApiActivities` 声明。遗漏整个场景也产生 gap；没有上游场景时报告空回映，不制造模拟成功。静态映射只写 mapped/gap，不写 passed。

`modelCoverage` 自动列出整体 FM 的具体 Evidence、Thing 与 Participant。每项须有接口或有业务依据的 `nonApiActivities` 处理方式；有接口又声明整体内部／外部处理是冲突。凭证仅有 GET 不算覆盖形成能力。Context、Party Role、Evidence Role 不因覆盖要求产生 CRUD。内部／外部处理说明用于表达真实责任，不是实施范围开关；不能用“暂不实现”或技术 decision 把缺失接口排除。

业务依赖、HTTP 交互粒度与 Evidence 业务时间分别表达。业务依赖必须满足，接口可分次或同次登记；同次登记也须先使必需证据可用，再形成目标。流程回映检查必要证据先于消费者可用，不把静态步骤覆盖等同于依赖已验证。
