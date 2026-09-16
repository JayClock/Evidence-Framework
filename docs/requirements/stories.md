# 故事与验收入口

## 业务故事

[软件范围](scope.md)中的 SCOPE-MVP 尚未确定；本页只登记有明确授权或实现依据的范围，不为未授权范围生成已批准 US/AC。已有 [FM 场景](../../.evidence/fm/00-overview.md)是业务来源，不能直接冒充软件验收通过。

获授权收敛故事时使用 [requirements Skill](../../.agents/skills/evidence-requirements/SKILL.md)，每项明确：

- 稳定故事与验收 ID；修改不重编号、不复用已废弃 ID。
- 参与者、目标、价值，以及软件执行/判断/接收结果/辅助人工的责任。
- Given / When / Then、具体输入和可观察结果，覆盖适用边界与失败不变性。
- 业务源 ID、规则/场景、API 能力、质量要求及必要外部责任。
- 确认状态与未决项；不能从代码输出反推业务预期。

## 本次授权切片：移动支付订阅主链

授权来源：用户本次交付指令（记录于[软件范围](scope.md)）以及[发现记录](../../.evidence/discovery.md)中的本轮实施澄清；业务来源 `.evidence/fm/` 的 `contract.subscription`、`request.payment`、`confirmation.mobile`、`role.payment-proof`、规则 `rule.payment-start/amount/deadline/completed`、`rule.mobile-completed`，场景 `scenario.mobile-subscription`、`scenario.payment-pending`；接口能力见 [API 设计](../../.evidence/api/api.yaml)。来源模型不保存审核状态；本页记录软件职责与可观察预期，不是业务批准。

### US-001 登记专栏订阅合同

**作为**读者，**我希望**把已接受的订阅条款登记为一份订阅合同，**从而**付款、内容与后续履约都能引用同一份合同。

软件职责：执行（登记合同事实）。来源：`contract.subscription`、`role.reader`、`capability.register-subscription-reader`、`scenario.mobile-subscription` 步骤 1。

| 验收 ID   | Given                                                                                                                                                                                                      | When         | Then                                                   |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------ |
| AC-001-01 | 合同 11 个必填字段齐全：`subscription_id`、`reader_id`、`column_id`、`edition_id`、`amount_minor_units`、`currency`、`signed_at`、`payment_seconds`、`access_seconds`、`refund_seconds`、`restore_seconds` | 读者提交登记 | 形成一份可被后续凭证引用的合同；登记不修改既有合同事实 |
| AC-001-02 | 缺少任一必填字段（如 `signed_at` 或 `restore_seconds`）                                                                                                                                                    | 读者提交登记 | 拒绝且不写入；状态码与错误表示按 API 契约              |

未决：可信身份来源与代表权限未确认（QA-IDENTITY）；角色绑定与 403 不构成本切片可执行验收。

### US-002 发起付款要求并取得扣款结果

**作为**平台（专栏运营方），**我希望**依据已登记合同发起付款要求、调用支付机构扣款并采信扣款结果，**从而**订阅费付款按合同期限完成。

软件职责：执行 + 接收外部结果。合同登记成功后由系统自动执行 API 旅程中标记为 internal 的付款请求步骤，再调用 local/test 支付端口；不存在对外的 `register-payment` HTTP capability。来源：`request.payment`、`request.mobile`、`confirmation.mobile`、`role.payment-proof`、`relation.mobile-as-payment-proof`、`scenario.mobile-subscription` 步骤 3–5。

| 验收 ID   | Given                                                                                                                                                                                                   | When                         | Then                                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-002-01 | 合同 `signed_at=2026-10-01T09:00:00Z`、`amount_minor_units=9900`、`currency=CNY`、`payment_seconds=900`                                                                                                 | 合同登记成功                 | 系统自动形成付款要求：`started_at=2026-10-01T09:00:00Z`（`rule.payment-start`）、`amount_minor_units=9900`（`rule.payment-amount`）、`expired_at=2026-10-01T09:15:00Z`（`rule.payment-deadline`） |
| AC-002-02 | 恰好一份机构扣款成功证明，订阅/读者/专栏/请求编号/金额/币种匹配，`confirmed_at` 落在 `[started_at, expired_at]`，`success=true`                                                                         | 平台判断付款完成             | `rule.payment-completed` 成立，付款状态 completed；重复通知不形成第二份有效结果（`relation.contract-payment` 目标基数 0–1）                                                                       |
| AC-002-03 | 截止前没有任何证明，`asOf=2026-10-01T09:14:59Z`                                                                                                                                                         | 平台判断付款状态             | 未完成且未失效：pending（`scenario.payment-pending`）                                                                                                                                             |
| AC-002-04 | 合格扣款恰在 `expired_at` 时刻完成                                                                                                                                                                      | 平台判断付款完成             | 仍为完成（[FM 概览](../../.evidence/fm/00-overview.md) 时间与边界）                                                                                                                               |
| AC-002-05 | local/test 固定夹具：付款请求 `PAY-001`、移动协议 `MOBILE-001`、移动请求 `MOBILE-REQ-001`、移动请求业务开始时间 `2026-10-01T09:02:00Z`；其余字段引用自动形成的付款要求，截止仍为 `2026-10-01T09:15:00Z` | 系统调用 local/test 支付端口 | 端口收到这些固定标识和业务时间并返回可追溯的 `confirmation.mobile`；固定值不成为生产支付协议或全局标识生成规则                                                                                    |

未决：少付、错配读者、迟到与失败结果只按“未完成”处理；异常履约（`rule.payment-expired` 失效、退款、恢复、内容访问）不在本切片；真实支付协议、验签与超时未确认（QA-INTEGRATION）。自动触发与固定标识/业务时间只约束 local/test 正常主链，不自行补造生产标识生成、远程失败或补偿规则。

### US-003 读取订阅与付款状态

**作为**读者，**我希望**读取自己的订阅与付款状态，**从而**我知道订阅目前是否完成付款。

软件职责：查询与呈现。来源：`capability.read-subscription-reader`、`capability.read-payment-reader`、`rule.payment-completed`、`binding.caller-payment-reader`。

| 验收 ID   | Given                        | When               | Then                                                                                  |
| --------- | ---------------------------- | ------------------ | ------------------------------------------------------------------------------------- |
| AC-003-01 | US-002 的完成付款证明已登记  | 读者读取订阅与付款 | 返回合同与付款状态 completed；状态由规则判断，响应存在不等于完成                      |
| AC-003-02 | 付款要求尚未形成             | 读者读取付款       | 404（`capability.read-payment-reader` 的 reasoning）                                  |
| AC-003-03 | 读者请求不属于自己的订阅实例 | 读者读取           | 拒绝或不可见——依赖未确认的身份与实例归属（QA-IDENTITY），记为待澄清，不作为可执行验收 |

### 追溯与回馈

| 故事   | 主要源                                                         | 对应工序                                        |
| ------ | -------------------------------------------------------------- | ----------------------------------------------- |
| US-001 | `contract.subscription`、`role.reader`                         | 边界与契约设计、领域行为、持久化适配、HTTP 契约 |
| US-002 | `request.payment`、`confirmation.mobile`、`role.payment-proof` | 领域行为、持久化适配、应用装配与模块协作        |
| US-003 | 读取能力与 `rule.payment-completed`                            | HTTP 契约、业务旅程验收                         |

这些故事与验收同时是 FM 模型的验证输入（先由合同与规则作为学习集，再由具体场景作测试集）：若某场景写不出可观察预期，说明模型或需求缺概念，登记缺口交回 FM 或发现记录，不改写预期迁就实现。金额、期限与匹配字段均取自源 YAML 与场景期望值，不在需求中另设默认值。

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
