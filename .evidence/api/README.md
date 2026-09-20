# 专栏订阅与 CRM 电话销售 API

唯一设计文件为 [api.json](api.json)，采用 API 格式 5.0，消费当前 FM v3（模型 `column-subscription`）。文件按严格 JSON 解析；拒绝注释、尾部逗号、重复 key 与 `NaN`。

## 接口范围

共 21 个资源、28 个角色接口，投影为 26 个 OpenAPI 路径上的 28 个操作。

| 业务                 | URI                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 订阅合同             | `/subscriptions`、`/subscriptions/{subscriptionId}`、`/users/{userId}/subscriptions`                                         |
| 付款要求及状态       | `/subscriptions/{subscriptionId}/payment`                                                                                    |
| 内容访问申请         | `/subscriptions/{subscriptionId}/accesses`、`/subscriptions/{subscriptionId}/accesses/{accessId}`                            |
| 内容提供结果         | `/subscriptions/{subscriptionId}/accesses/{accessId}/result`                                                                 |
| 断更退款             | `/subscriptions/{subscriptionId}/refund` 及其 `/result`                                                                      |
| 免费恢复             | `/subscriptions/{subscriptionId}/relaunches/{relaunchId}/restoration` 及其 `/result`                                         |
| 断更下架记录         | `/discontinuations`、`/discontinuations/{discontinuationId}`                                                                 |
| 重新上架记录         | `/subscriptions/{subscriptionId}/relaunches` 及其 `/{relaunchId}`                                                            |
| 账户协议             | `/prepaid-accounts`、`/prepaid-accounts/{accountId}`、`/users/{userId}/prepaid-accounts`                                     |
| 余额抵扣             | `/prepaid-accounts/{accountId}/debits`、`/prepaid-accounts/{accountId}/debits/{debitId}` 及其 `/result`                      |
| 专栏与内容           | `/columns/{columnId}`、`/chapters/{chapterId}`                                                                               |
| 电话销售绩效协议     | `POST /sales-performance-agreements`、`/sales-performance-agreements/{agreementId}`                                          |
| 月度客户联系目标请求 | `/sales-performance-agreements/{agreementId}/monthly-customer-contact-targets` 及其 `/{targetId}`                            |
| 客户联系记录         | `/sales-performance-agreements/{agreementId}/monthly-customer-contact-targets/{targetId}/contact-records` 及其 `/{recordId}` |

7 个 POST 只追加由已建模 Participant Party 扮演角色发起的业务凭证；其余接口读取本人合同内的数据、有资格访问的内容，或从 `/users/{userId}` 根列出本人参加的合同。合同与账户列表按具体用户主体作用域挂载，并提供列表项读取，使集合嵌入成员的 `self` 可被同一角色继续跟随；读者从订阅合同、余额抵扣请求和访问请求可沿关系链接导航到付款、退款、专栏与章节资源。`role.publisher`、`role.account-provider` 及移动支付机构没有对应的 `participant.party -> plays_role` 玩家，因此不生成调用接口；其负责形成的付款、内容结果、退款、恢复、抵扣结果及上下架记录按内部或外部非 API 活动回映，移动支付机构的三个凭证对象按外部活动处理，不虚构机构接口；主体不生成档案 CRUD。绩效协议与客户联系记录按三个登记能力追加，登记不等于履约完成，月度目标是否完成由 `rule.monthly-customer-contact-completed` 另行判断。免费恢复以重新上架活动为实例范围：同一原订阅可有多次活动，每次活动至多一份有效恢复请求。

## 契约要点

- POST 返回 201 和 Location，客户端可沿 Location 读取原记录；这不等于履约完成。
- 每个接口都有类型化入口（`http.entryPoints`）；HTTP 流程必须声明 `scenarioRefs` 并把请求绑定到 FM 业务步骤，首步引用入口，后续步骤只能沿返回的 HAL 链接或 Location 接续，不能重新填写 ID。
- 请求结果使用 HAL 的 result 链接发现；未形成时返回 404。
- 读者从内容访问申请沿 result、content 链接取得同一章节；每次检索重新核验当前退款和恢复资格。
- 写入使用 Idempotency-Key；同键同输入复用原结果，不同输入返回 409。
- 时间、金额和余额遵循业务含义；派生截止、派生金额及账本余额不接受客户端自由赋值。协议达成时刻、目标周期与联系确认时刻同样按业务含义接收，服务端不以入库时间或当前时间替换。
- 所有当前表示使用 no-store；不跨读者缓存付费内容或权益结果，也不跨协议参与方缓存。
- 403 表示无本实例权限或调用者不是本协议实例的参与方，422 表示证据、金额、期限、周期、目标值或关联不符合要求。

## 交付文件

当前交付文件固定保存在 [generated](generated/)；目录只保存机器消费的投影、OpenAPI、表示样例、类型化入口与消费者覆盖、HTTP 流程、合成 E2E 向量和 manifest。接口清单、覆盖与 HTTP 契约统一在 [可视化审核页](../views/index.html) 中阅读，不再维护重复 Markdown。它们是 API 源的派生结果，不是已部署接口或本次运行验收结果。生成文件按权威字节交付，不应再被格式化，否则 manifest 摘要失效。

生成规则以 [API Skill](../../.agents/skills/evidence-api-design/SKILL.md)为准：获授权后先检查当前源，再整体更新固定输出目录；失败保留原目录，成功后由 Git 展示和保存版本差异。源或校验器变化后重验，不用已留存报告替代当前检查。

检查命令：

```bash
python3 .agents/skills/evidence-api-design/scripts/fm_api.py check \
  --project-root "$PWD" \
  --fm "$PWD/.evidence/fm" \
  --fm-skill "$PWD/.agents/skills/evidence-fm" \
  --api "$PWD/.evidence/api/api.json"
```

HTTP 流程和 `e2e-test-vectors.json` 只验证契约与数据衔接，`runtimeValidated` 为 false。合成向量不决定数据库装载、认证身份或外部系统 Stub。认证、机构验签、幂等存储、原子扣减、协议参与方实例核验和业务前置规则仍需由实际服务执行并验收。
