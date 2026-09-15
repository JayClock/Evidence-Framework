# 专栏订阅 API

唯一设计文件为 [api.yaml](api.yaml)，采用 API 格式 4.0，消费完整 FM v3。

## 接口范围

共 15 个资源、21 个角色接口，合并角色变体后为 21 个 OpenAPI 操作。

| 业务           | URI                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| 订阅合同       | `/subscriptions`、`/subscriptions/{subscriptionId}`                                                     |
| 付款要求及状态 | `/subscriptions/{subscriptionId}/payment`                                                               |
| 内容访问申请   | `/subscriptions/{subscriptionId}/accesses`、`/subscriptions/{subscriptionId}/accesses/{accessId}`       |
| 内容提供结果   | `/subscriptions/{subscriptionId}/accesses/{accessId}/result`                                            |
| 断更退款       | `/subscriptions/{subscriptionId}/refund` 及其 `/result`                                                 |
| 免费恢复       | `/subscriptions/{subscriptionId}/relaunches/{relaunchId}/restoration` 及其 `/result`                    |
| 断更下架记录   | `/discontinuations`、`/discontinuations/{discontinuationId}`                                            |
| 重新上架记录   | `/subscriptions/{subscriptionId}/relaunches` 及其 `/{relaunchId}`                                       |
| 账户协议       | `/prepaid-accounts`、`/prepaid-accounts/{accountId}`                                                    |
| 余额抵扣       | `/prepaid-accounts/{accountId}/debits`、`/prepaid-accounts/{accountId}/debits/{debitId}` 及其 `/result` |
| 专栏与内容     | `/columns/{columnId}`、`/chapters/{chapterId}`                                                          |

6 个 POST 只追加由已建模 Participant Party 扮演角色发起的业务凭证；其余接口读取本人合同内的数据或有资格访问的内容。`role.publisher`、`role.account-provider` 没有对应的 `participant.party -> plays_role` 玩家，因此不再生成调用接口；其负责形成的付款、内容结果、退款、恢复、抵扣结果及上下架记录按内部非 API 活动回映。移动支付机构的三个凭证对象按外部活动处理，不虚构机构接口；主体不生成档案 CRUD。免费恢复以重新上架活动为实例范围：同一原订阅可有多次活动，每次活动至多一份有效恢复请求。

## 契约要点

- POST 返回 201 和 Location，客户端可沿 Location 读取原记录；这不等于履约完成。
- 请求结果使用 HAL 的 result 链接发现；未形成时返回 404。
- 读者从内容访问申请沿 result、content 链接取得同一章节；每次检索重新核验当前退款和恢复资格。
- 写入使用 Idempotency-Key；同键同输入复用原结果，不同输入返回 409。
- 时间、金额和余额遵循业务含义；派生截止、派生金额及账本余额不接受客户端自由赋值。
- 所有当前表示使用 no-store；不跨读者缓存付费内容或权益结果。
- 403 表示无本实例权限，422 表示证据、金额、期限或关联不合要求。

## 交付文件

现有交付文件位于 [generated](generated/)，包含接口清单、HTTP 契约、OpenAPI、表示样例、HTTP 流程和机器投影。它们是 API 源的派生结果，不是已部署接口或本次校验结果。生成文件按权威字节交付，不应再被格式化，否则 manifest 摘要失效。

生成规则以 [API Skill](../../.agents/skills/evidence-api-design/SKILL.md)为准：获授权后先检查当前源，再投影到尚不存在的输出批次；不覆盖或删除已有输出，不手改生成文件。更新导航指向实际交付位置，不预填不存在的批次路径。源或校验器变化后重验，不用已留存报告替代当前检查。

检查命令：

```bash
python3 .agents/skills/evidence-api-design/scripts/fm_api.py check \
  --project-root "$PWD" \
  --fm "$PWD/.evidence/fm" \
  --fm-skill "$PWD/.agents/skills/evidence-fm" \
  --api "$PWD/.evidence/api/api.yaml"
```

HTTP 流程只验证契约与数据衔接，`runtimeValidated` 为 false。认证、机构验签、幂等存储、原子扣减和业务前置规则仍需由实际服务执行并验收。
