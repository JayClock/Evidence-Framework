# 整体模型到接口的设计方法

以已通过完整性与一致性检查的形式化业务模型（FM）为唯一输入源，不设置 Context 子集、不重复业务审核。遍历模型中的全部业务对象与全部场景，直接映射推导完整接口清单及 HTTP 契约；技术校验发现真实缺口时报告，不靠局部输出宣称完成。

## 映射推导总纲

从模型到接口清单的推导遵循自顶向下的场景驱动直达与全量闭包原则，彻底摒弃面向过程的 RPC 动词设计与任意谓词穷举，严禁生成角色×视图×方法的笛卡尔探索表。

1. **不可变凭证的 CR 哲学**：业务对外接口严格遵循 CR 哲学（Create & Read）。对 Evidence 凭证记录的写操作唯一限定为 `POST + append_evidence`，读操作唯一限定为 `GET + read`，严禁针对凭证记录设计 PUT、PATCH 或 DELETE 覆盖写接口。业务更正、撤销与状态流转均通过形成新的修正凭证、红冲凭证或确认凭证推进。
2. **场景与合法玩家直达**：每一个接口能力直接由 FM 验证场景（Validation Scenario）的交互步骤推导生成，调用者必须是 FM 中由 `participant.party` 实体通过 `plays_role` 显式扮演的 `role.party`，未被实体扮演的角色不生成 API 接口。
3. **全模型双向覆盖闭包**：模型中的全部 Evidence、Thing 与 Participant 必须构成封闭集，要么在接口清单中具有对应的读/写能力，要么在非接口活动中具有明确的内部或外部处理依据。

## 阶段一：上下文根定界、弹性边界与服务编排

以不同的合同前／渠道 Context、合同 Context 和领域 Context 作为不同 URI 寻址根。

1. **上下文根隔离与跨根规则**：
   - 合同前上下文（协商、意向、提案）与合同履约上下文物理分属不同根。
   - 跨 Context 的关联（如提案转合同、履约项关联标的物领域模型）一律通过分布式超媒体链接（Hypermedia Links）建立连接，严禁将跨上下文业务流程直接拼装成单条级联 URL。
   - 父子 URI 嵌套必须严格保持在同一 Context 根内。CLI 以 `RESOURCE_CONTEXT_ROOT_MISMATCH` 阻断跨根嵌套。
2. **复合履约链路解耦与弹性边界**：
   - 履约资源通常沿所属父合同 Context 的根继续导航；
   - 当长链路履约过程中存在明显的业务等待点（天然异步性）、冷热并发差异、独立吞吐量要求或独立 SLA 约束时，应将其划定为独立弹性边界并拆分为独立资源，通过超媒体链接和结果发现机制解耦，但服务拆分不改变资源的稳定 URI。
3. **URI 作为函数求值与服务编排（合同列表的本质）**：
   - 合同（Contract）是双边或多边权责约束的凭证，任何一方参与主体（Party）在数据或模型层面都**不拥有、也不单独管理合同**；
   - 路径形如 `/users/{userId}/subscriptions`，**其本质绝非主体对合同的包含或从属管理，而是通过 URI 表达的两个独立业务能力（主体服务与合同服务）之间的函数式求值编排（Function Evaluation & Service Composition）**：
     \[
     \text{GET } /\text{users}/\{\text{userId}\}/\text{subscriptions} \iff \text{getSubscriptions}(\text{getUsers}(\text{userId})) \iff (\text{subscriptions } (\text{users } \text{userId}))
     \]
   - URI 将服务之间的求值策略与编排细节（如网关聚合、服务间内部调用、惰性求值）完全封装在统一稳定的领域模型关系之后。无论底层是单体还是微服务拆分，无论服务编排策略如何调整，外部消费契约始终保持稳定。
   - 合同单实例读取可用自身业务 ID 定位；合同列表读取严禁暴露全局未隔离查询（如全局 `/contracts`），也严禁使用抹杀具体主体语义的统称 `/parties/{partyId}`，必须明确挂载于具体参与主体 `participant.party` 的类型根下，以明确求值主体服务与合同服务的编排边界。

## 阶段二：资源寻址形态与基数映射

先确认实例归属，再依据 FM Relationship 及业务来源核对各层数量与寻址形态（Shape）。

1. **单例形态（`shape: singleton`）**：
   - 父实例下至多存在一个业务对象（FM Relationship 声明 `targetCardinality: 1`）；
   - 采用 `identity.kind: parent_scoped` 寻址，仅提供 `singleton` 视图，路径末尾不增加无意义的子 ID（例如 `/orders/{orderId}/payment/confirmation`）；
   - 单例形成同样使用一次 POST 追加凭证，不转化为覆盖更新。
2. **集合形态（`shape: collection`）**：
   - 父实例下允许多个业务对象（FM Relationship 声明 `targetCardinality: many`）；
   - 提供 `collection` 视图（列表与集合追加）与带自身定位标识的 `item` 视图（单项详情）。
3. **基数严格溯源**：
   - 基数优先通过 `cardinality.relationshipRef` 引用 FM Relationship；
   - FM 尚未建模但业务来源明确时，通过 `cardinality.max/sourceRefs/reasoning` 保留直接依据；
   - 缺少数量上限时保留 `RESOURCE_CARDINALITY_UNRESOLVED`，不把未声明解释为多份，也不为主观简化路径而伪造单例。

## 阶段三：服务蓝图交互线分流与全量模型闭包

通过服务蓝图前后台交互线对模型对象进行严格分流，构建全模型覆盖闭包（Model Coverage）。

1. **三线分流机制**：
   - **前台交互线以上**（外部客户/前端主动交互）：直接映射为外部 Party Role 可调用的 API 接口清单；
   - **交互线与可视线之间**（内部运营/经办经手操作）：映射为内部管理/经办角色的 API 接口清单；
   - **可视线以下**（后台自动化批处理、事件驱动响应、第三方外部结算系统提供结果）：不生成当前服务的 API 接口，统一定向分流至 `nonApiActivities`，声明其为 `handling: internal`（内部系统完成）或 `handling: external`（外部主体完成）。
2. **全覆盖互斥纪律**：
   - 自动遍历整体 FM 中的全部具体 Evidence、Thing 与 Participant；
   - 每个对象必须要么在 API 清单中具备对应接口，要么在 `nonApiActivities` 中声明合法依据；
   - 具有写入接口的对象严禁同时声明为非接口活动（触发 `MODEL_HANDLING_CONFLICT`）；
   - 对象仅有读取接口且形成责任角色未被物理主体扮演时，可通过 `nonApiActivities` 声明外部/内部形成并保留读取接口；
   - 严禁通过“暂不实现”或空依据排除缺失接口。

## 阶段四：场景凭证驱动的接口清单生成

遍历 FM validation scenario 的步骤序列，直接生成接口清单及能力定义（Capabilities）。

1. **调用者与能力绑定**：
   - 调用者必须是有业务依据且已被 `participant.party` 实体扮演的 `role.party`；
   - 缺少实体扮演者的角色保留为责任身份，触发 `ACTOR_PARTY_PLAYER_MISSING` 并不暴露接口；
   - 经办主体仅作为经办说明保留，不能直接提升为调用角色；Evidence Role 仅为插槽，绝不能作为调用者；
   - 每个能力必须显式声明 `resourceRef`、`view`、`method`、`effect` 以及对应的 `businessCapability`，并绑定匹配的 `caller_role`。
2. **前置条件与补充证据依赖链**：
   - 消费凭证依赖前序依据凭证（`references`、`basedOn`）时，目标能力必须通过 `basis.fmRefs` 与 `ruleBindings.precondition` 声明检查前置条件；
   - 必需凭证缺失时不得调用形成接口；补充证据可独立追加或在同一次会话交互中按序先登记证据再形成目标，严禁用单个接口的虚拟成功响应替代真实凭证链条。

## 阶段五：字段纯粹性规约与受控集合查询

1. **字段来源与白名单约束**：
   - 表示字段严格执行白名单，按 `fmAttributeRef` 追溯至 FM 实体属性；
   - 字段来源明确划分为 `client`（客户端输入）、`reference`（已有凭证引用）、`server`（服务端内部记录）与 `derived`（模型规则派生）。
2. **派生属性禁止入参红线**：
   - 挂有 FM 派生规则（`derivedByRuleRef`）的金额、费率、期限、逾期天数与到期时间等，**严禁出现在请求体中**（违者触发 `REQUEST_BODY_DERIVED_FIELD` 阻断）；
   - 派生属性必须由服务端在领域模型内按规则求值并回填；请求体仅接收原始形成数据与引用标识。
3. **受控集合查询（Query Parameters）**：
   - 集合 GET 的过滤参数必须严格对齐 FM 实体已建模的属性及 Rule 判据条件；
   - 分页参数明确指定 `cursor/page` 与下一页推导机制，严禁在接口层开放未经领域模型管控的任意数据库字段查询。

## 阶段六：超媒体组装与消费旅程自动化接续

1. **分布式超媒体（HAL）驱动**：
   - 采用 HAL 规范，通过 `_links`（导航关联 GET，动作关联写操作）和 `_embedded` 指导客户端进行渐进式服务消费；
   - 导航链接与动作链接的目标必须在本 API 体系内严格闭合，链接参数必须完全由当前上下文或响应数据提供；
   - 异步处理（HTTP 202）必须提供 `resultCapabilityRef` 及匹配的 Location，指向同角色的结果读取能力。
2. **全流程旅程接续自动化闭环**：
   - 遍历 FM 业务场景，构建对应的 `http.journeys`；
   - 第一步必须使用有依据的 `entryPoints`；后续每一步的 URL 与路径参数必须严格从前序步骤响应的 `_links`（`rel`, `self`, `next`）、嵌入成员 `self` 或 `Location` 中提取，严禁凭空重新输入参数或跳步；
   - `consumerCoverage` 逐场景执行机器级链路验证，确保 API 清单中所有业务步骤均具有可接续、可闭环的成功调用路径。
