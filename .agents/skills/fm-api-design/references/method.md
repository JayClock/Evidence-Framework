# 设计方法

## 资源

只映射实际 Evidence 或有来源的 Participant。Context 用于限定责任范围；除非另有业务对象依据，不把它当作可 CRUD 资源。显式配置规范 segment 和 identity，不从 label 猜英文、复数或聚合。

以不同的合同前／渠道 Context、合同 Context 和领域 Context 作为不同 URI 根。Fulfillment 资源通常沿所属父合同 Context 的根继续导航；只有确需独立弹性边界时才拆服务，但服务拆分不改变稳定 URI。跨 Context 的 Proposal → Contract 或合同 → Domain 关系使用超媒体链接，不将整条业务流程嵌入一条 URL。

嵌套 URI 同时需要：

1. 资源图中的 `parentRef`；
2. 匹配的 `parent_child` binding；
3. FM 结构或业务来源，以及为何它表达实例归属的 reasoning。

`precedes`、一般引用和基数不会自动转成父子拥有关系。技术导航可以记录为决定，但不能宣称业务拥有权。CLI 会以 `RESOURCE_CONTEXT_ROOT_MISMATCH` 拒绝跨合同前、合同或领域 Context 的父子 URI；所属父合同相同的 Fulfillment 资源不视为跨根。

## 补充证据与形成前提

`other_evidence` 是其他凭证的补充证据。生成能力前检查 FM 的 `evidences`、必要 `precedes`、实例 `basedOn`、规则及场景：谁提供什么证据，哪份凭证必须依赖它，目标形成前是否已经存在且可被使用。必需证据缺失时不得形成目标；不能用一个接口的成功响应代替业务证据。

目标能力的 `basis.fmRefs` 引用必要证据、依赖关系及规则，`reasoning` 说明同一业务实例关联、证据引用与可用性检查。已建模的形成条件通过 `ruleBindings` 的 `precondition` 绑定；表达不了的检查保留 gap，不把自然语言说明称为运行时强制校验。

补充证据的创建 URI 不依赖尚未形成的目标凭证 ID，避免形成循环。可在有明确归属的已有申请或合同下追加证据，也可使用独立资源；`evidences` 本身不证明父子归属。目标通过已有证据的引用形成，证据仍证明目标，而非因 URI 嵌套而改变证明对象。

已有证据可以先登记，也可以在一次交互内先登记证据再形成目标；这不是把多个节点强制拆成多个 HTTP 请求。独立接口需要对应调用场景及角色授权。凭证业务形成时间与上传时间分别处理，但必需证据必须先于目标存在。

## 角色与能力

探索只在选中 Context 的 Party Role、资源、collection/item 与五种方法间进行。已声明且具有场景、依据和实例约束的组合才是 candidate；缺信息是 unresolved；明确语义冲突是 rejected；没有场景支持是 unselected，不等于禁止。

调用者必须是 Party Role。Evidence Role 只是凭证玩家插槽；`responsibleRoleRef` 只是职责线索。每个能力至少引用匹配的 `caller_role`；嵌套资源还要引用自己的 `parent_child`。

GET 对应 read。Evidence 写入只能用 POST + append_evidence。PUT/PATCH/DELETE 覆盖 Evidence 会被拒绝；更正与撤销必须先有业务表达，再设计追加证据。

共享 Method + URI 可以保留多个角色候选。按参数形状归一化路由，参数改名不能隐藏冲突；不同效果变体无法证明兼容时保留 gap。

## 表示与超媒体

字段使用白名单并回到 `entity#attribute`。不要默认公开所有 FM 属性；业务时间、关联值、服务端记录值和派生值不能因 required 而变成客户端输入。

链接目标和 URI 参数必须闭合。导航链接需要相应角色的已选 GET；动作链接引用能力。HAL `_links` 不定义 method、body 或写入契约，也不自动创建 GET。

## 流程回映

按 FM scenario 的 step sequence，把每步映射为 candidate capability、internal、external 或 gap。internal/external 也要来源。没有选择 journey 时状态是 `not_evaluated`；静态映射只写 `mapped/gap/not_evaluated`，不写 `passed`。

业务依赖、HTTP 交互粒度与 Evidence 业务时间分别表达。业务依赖必须满足，接口可分次或同次登记；同次登记也须先使必需证据可用，再形成目标。流程回映检查必要证据先于消费者可用，不把静态步骤覆盖等同于依赖已验证。
