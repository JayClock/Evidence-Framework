# 故事与验收入口

## 业务故事

[软件范围](scope.md)中的 SCOPE-MVP 尚未确定；本页只登记有明确授权或实现依据的范围，不为未授权范围生成已批准 US/AC。已有 [FM 场景](../../.evidence/fm/00-overview.md)是业务来源，不能直接冒充软件验收通过。

获授权收敛故事时使用 [requirements Skill](../../.agents/skills/evidence-requirements/SKILL.md)，每项明确：

- 稳定故事与验收 ID；修改不重编号、不复用已废弃 ID。
- 参与者、目标、价值，以及软件执行/判断/接收结果/辅助人工的责任。
- Given / When / Then、具体输入和可观察结果，覆盖适用边界与失败不变性。
- 业务源 ID、规则/场景、API 能力、质量要求及必要外部责任。
- 确认状态与未决项；不能从代码输出反推业务预期。

## 本次授权切片：电话销售绩效协议主链

授权来源：用户交付指令（记录于[软件范围](scope.md)与计划的缺口 `GAP-SCOPE-CRM`）；业务来源 `.evidence/fm/` 的 `contract.sales-performance`、`request.monthly-customer-contact`、`confirmation.customer-contact-record`、`rule.monthly-customer-contact-completed`、角色 `role.performance-manager` 与 `role.tele-sales`，场景 `scenario.monthly-customer-contact-completed`、`scenario.monthly-customer-contact-insufficient`；接口能力见 [API 设计](../../.evidence/api/api.json)。来源模型不保存审核状态；本页记录软件职责与可观察预期，不是业务批准。

以下引用的编号、时刻与 3／2／1 目标数均来自 FM 验证实例，是合成数据，只用于验证规则，不代表真实企业指标。

### US-004 登记电话销售绩效协议

**作为**电话销售，**我希望**把双方已达成的绩效协议登记为协议凭证，**从而**后续月度目标与联系记录都能引用同一份协议。

- 状态：可实施；403 与实例参与方核验除外（见未决项）。
- 软件职责与外部边界：执行（登记已达成的协议事实）；登记动作不替代双方达成协议的业务事实。
- 来源：`contract.sales-performance`、`role.tele-sales`、`capability.register-sales-performance-agreement-tele-sales`、`scenario.monthly-customer-contact-completed` 步骤 1。

| 验收 ID   | Given                                                                | When             | Then                                                                         |
| --------- | -------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------- |
| AC-004-01 | 协议编号 `PERF-2026-Q4-001`、达成时刻 `2026-09-25T09:00:00Z`（合成） | 电话销售提交登记 | 201 且 `Location` 指向该协议；形成可被后续请求引用的凭证，不修改既有协议事实 |
| AC-004-02 | 缺少 `agreement_id` 或 `signed_at`                                   | 提交登记         | 按 API 契约拒绝（422）且不写入                                               |
| AC-004-03 | 请求含未知字段或非法 JSON                                            | 提交登记         | 按 API 契约拒绝（400）且不写入，不产生协议凭证                               |
| AC-004-04 | 同一幂等键重试同一输入；或同键不同输入；或该 `agreement_id` 已存在   | 提交登记         | 第一种回放同一结果且不新增凭证；后两种按 API 契约返回 409                    |

未决：协议只有编号与达成时刻，无法核验调用者是否为本实例的电话销售参与方；403 与实例隔离不作为本切片可执行验收（SCOPE-PARTICIPATION、QA-IDENTITY）。

### US-005 提出月度客户联系目标

**作为**绩效管理者，**我希望**在既有协议下提出带业务周期及总数、电话数、邮件数目标的请求，**从而**电话销售有可核对的周期约定。

- 状态：可实施；同一业务周期的多份请求含义未定义（见未决项）。
- 软件职责与外部边界：执行（形成目标请求）；目标数是每份协议实例的约定值，不由软件设定默认值。
- 来源：`request.monthly-customer-contact`、`relation.sales-performance-to-monthly-contact`、`role.performance-manager`、`capability.register-monthly-customer-contact-target-manager`、`scenario.monthly-customer-contact-completed` 步骤 2。

| 验收 ID   | Given                                                                                                                                                        | When           | Then                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------- |
| AC-005-01 | 协议已存在；`request_id=CONTACT-2026-10`、`period_id=2026-10`、区间 `2026-10-01T00:00:00Z`–`2026-10-31T23:59:59Z`、目标 3／2／1、`evidenceRefs` 非空（合成） | 绩效管理者提交 | 201 且 `Location` 指向该请求；请求归属指定协议，三项目标原样保留 |
| AC-005-02 | 任一目标数为负、周期区间不成立，或请求未归属指定协议                                                                                                         | 提交           | 按 API 契约拒绝（422）且不写入                                   |
| AC-005-03 | 父协议不存在；或相同 `request_id` 已存在；或 `evidenceRefs` 为空                                                                                             | 提交           | 分别为 404、409、400（`evidenceRefs` 是契约必填）                |
| AC-005-04 | 同一幂等键重试同一输入；或同键不同输入                                                                                                                       | 提交           | 前者回放同一结果且不新增请求；后者按 API 契约返回 409            |

未决：目标设定的磋商过程与变更方式未在 FM 展开；登记动作不判断完成状态。

### US-006 登记客户联系记录

**作为**电话销售，**我希望**登记一次实际客户联系并指向客户档案、注明渠道与确认时刻，**从而**联系事实成为可计入目标的凭证。

- 状态：可实施；客户档案实例引用一致性除外（见未决项）。
- 软件职责与外部边界：执行（登记一次实际联系）；不接收拨号器、页面或同步回调作为业务来源。
- 来源：`confirmation.customer-contact-record`、`relation.customer-contact-references-profile`、`capability.register-customer-contact-record-tele-sales`、`scenario.monthly-customer-contact-completed` 步骤 3–5。

| 验收 ID   | Given                                                                                                                                                                                         | When             | Then                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------- |
| AC-006-01 | 目标请求已存在；`record_id=CONTACT-REC-001`、`request_id`／`agreement_id`／`period_id` 匹配、`customer_profile_id=CUSTOMER-001`、`channel=phone`、`confirmed_at=2026-10-03T02:00:00Z`（合成） | 电话销售提交登记 | 201 且 `Location` 指向该记录；形成可计入目标的凭证，不改写协议或目标 |
| AC-006-02 | `channel` 不是 `phone` 或 `email`                                                                                                                                                             | 提交登记         | 按 API 契约拒绝（422）且不写入                                       |
| AC-006-03 | 目标、周期、协议或客户档案引用无效或不匹配                                                                                                                                                    | 提交登记         | 按 API 契约拒绝（422）且不写入                                       |
| AC-006-04 | 缺少 `customer_profile_id`、`confirmed_at` 或 `evidenceRefs` 等契约必填字段                                                                                                                   | 提交登记         | 按契约拒绝（422 或 400）且不写入                                     |
| AC-006-05 | `confirmed_at` 恰为 `expired_at`，或位于请求区间之外                                                                                                                                          | 提交登记         | 记录仍可形成；是否计入由完成规则判断（US-007），登记不预判完成       |

未决：模拟器不能实例化 `thing.customer-profile`，客户档案实例引用一致性仍是验证缺口；同一 `record_id` 的重复登记按 API 契约返回 409。

### US-007 判断月度客户联系目标是否完成

**作为**绩效管理者和电话销售，**我希望**系统按请求周期与三项目标判断完成，**从而**完成状态可核对且不依赖人工口径。

- 状态：可实施；完成状态目前没有对外读取能力（见未决项）。
- 软件职责与外部边界：计算／判断；只依据匹配记录的数量，不引入未定义的违约或补偿结论。
- 来源：`rule.monthly-customer-contact-completed`、`fulfillment.monthly-customer-contact`、`scenario.monthly-customer-contact-completed`、`scenario.monthly-customer-contact-insufficient`。

| 验收 ID   | Given                                                                                         | When       | Then                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| AC-007-01 | 目标 3／2／1；周期内三条记录：电话 `2026-10-03`、邮件 `2026-10-10`、电话 `2026-10-28`（合成） | 按规则判断 | 完成成立；总数、电话数、邮件数分别达到 3／2／1，状态与 `scenario.monthly-customer-contact-completed` 一致 |
| AC-007-02 | 仅电话 `2026-10-03` 与邮件 `2026-10-10` 两条记录                                              | 按规则判断 | 完成不成立（总数 2<3、电话 1<2）；不产生 breached、处分或补偿结论                                         |
| AC-007-03 | 记录恰在 `expired_at` 确认；或早于 `started_at`；或晚于 `expired_at`                          | 按规则判断 | 端点记录计入；周期外记录不计入任何一项计数                                                                |
| AC-007-04 | 记录的 `request_id`、`agreement_id`、`period_id` 任一与目标请求不匹配                         | 按规则判断 | 不计入任何一项计数                                                                                        |
| AC-007-05 | 登记被拒绝（422／409／400）后再次判断                                                         | 按规则判断 | 无新增记录，计数与完成状态不变                                                                            |

未决：完成状态当前没有对外读取能力，判断结果通过领域返回与旅程验收观察；是否增加只读接口需产品决定。

### 追溯与回馈

| 业务来源／规则／场景                                                                   | 软件职责   | US／AC         | 未决项及影响                                         |
| -------------------------------------------------------------------------------------- | ---------- | -------------- | ---------------------------------------------------- |
| `contract.sales-performance`、`role.tele-sales`                                        | 执行       | US-004／AC-004 | 参与方核验与 403（SCOPE-PARTICIPATION、QA-IDENTITY） |
| `request.monthly-customer-contact`、`relation.sales-performance-to-monthly-contact`    | 执行       | US-005／AC-005 | 目标磋商与变更方式未展开；同周期多请求含义未定义     |
| `confirmation.customer-contact-record`、`relation.customer-contact-references-profile` | 执行       | US-006／AC-006 | 客户档案实例引用一致性为验证缺口                     |
| `rule.monthly-customer-contact-completed`、两个场景                                    | 计算／判断 | US-007／AC-007 | 未达标后果未定义；只读接口未纳入                     |

这些故事与验收同时是 FM 模型的验证输入（先由协议、目标请求与规则作为学习集，再由两个场景作测试集）：若某场景写不出可观察预期，说明模型或需求缺概念，登记缺口交回 FM 或发现记录，不改写预期迁就实现。编号、时刻与目标数均取自源 YAML 与场景期望值，不在需求中另设默认值。

## 历史故事：移动支付订阅主链（来源已移出当前 FM/API）

以下故事针对当时的移动支付订阅主链，其业务来源（`contract.subscription`、`request.payment`、`confirmation.mobile` 等）已随模型收敛移出当前仓库（提交 `0e76410`），业务澄清保留在 Git 历史提交 `a6f7ecc` 的 `.evidence/discovery.md`（该记录已于 `d00ea07` 从工作树移除）。这些 ID 不复用于新故事；该切片授权状态待确认（SCOPE-SUBSCRIPTION），未确认前不作为当前验收输入。原文见 Git 历史提交 `76bbbac` 与 `a6f7ecc`：

| 历史故事                          | 当时软件职责    |
| --------------------------------- | --------------- |
| US-001 登记专栏订阅合同           | 执行            |
| US-002 发起付款要求并取得扣款结果 | 执行 + 接收结果 |
| US-003 读取订阅与付款状态         | 查询与呈现      |

## 本地切片的实现核对入口

以下是源码/现有切片说明可核对的工程行为，不是新授予的产品范围或业务批准：

| 行为                              | 核对位置                                                                                                              | 验证边界                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 用户资料创建、读取、修改、删除    | [切片契约](../../apps/backend/README.md)                                                                              | local/test profile，不含认证或合同权限 |
| 显示名称合法性、身份不变          | [领域测试](../../libs/backend/domain/src/test/java/com/evidencepoc/backend/domain/UserTests.java)                     | 纯领域规则，不证明 SQL/HTTP            |
| HTTP 输入、导航、错误及失败不写入 | [API 测试目录](../../libs/backend/api/src/test/java/com/evidencepoc/backend/api/)                                     | 真实 HTTP + mock 领域，不证明真实事务  |
| 持久化、分页、行数及回滚          | [MyBatis 测试](../../libs/backend/persistent/src/test/java/com/evidencepoc/backend/persistent/MyBatisUsersTests.java) | H2，不证明生产方言                     |
| 真实装配与 HTTP + SQL             | [应用测试目录](../../apps/backend/src/test/java/com/evidencepoc/backend/)                                             | 当前测试配置，不证明生产授权           |

复用前执行 [测试指南](../engineering/testing.md)中的相关命令。测试文件存在不表示本次已经通过；实际结果由任务证据或获授权检查记录保存。
