# 专栏订阅 API

唯一设计文件为 [api.yaml](api.yaml)，采用 API 格式 4.0，消费完整 FM v3。

## 接口范围

共 15 个资源、42 个角色接口，合并角色变体后为 28 个 OpenAPI 操作。

| 业务           | URI                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| 订阅合同       | `/subscriptions`、`/subscriptions/{subscriptionId}`                                                     |
| 付款要求及状态 | `/subscriptions/{subscriptionId}/payment`                                                               |
| 内容访问申请   | `/subscriptions/{subscriptionId}/accesses`、`/subscriptions/{subscriptionId}/accesses/{accessId}`       |
| 内容提供结果   | `/subscriptions/{subscriptionId}/accesses/{accessId}/result`                                            |
| 断更退款       | `/subscriptions/{subscriptionId}/refund` 及其 `/result`                                                 |
| 免费恢复       | `/subscriptions/{subscriptionId}/restoration` 及其 `/result`                                            |
| 断更下架记录   | `/discontinuations`、`/discontinuations/{discontinuationId}`                                            |
| 重新上架记录   | `/relaunches`、`/relaunches/{relaunchId}`                                                               |
| 账户协议       | `/prepaid-accounts`、`/prepaid-accounts/{accountId}`                                                    |
| 余额抵扣       | `/prepaid-accounts/{accountId}/debits`、`/prepaid-accounts/{accountId}/debits/{debitId}` 及其 `/result` |
| 专栏与内容     | `/columns/{columnId}`、`/chapters/{chapterId}`                                                          |

13 个 POST 只追加实际业务凭证；其余接口读取本人合同内的数据或有资格访问的内容。移动支付机构的三个凭证对象按外部活动处理，不虚构机构接口；三个实际主体不生成档案 CRUD。

## 契约要点

- POST 返回 201 和 Location，客户端可沿 Location 读取原记录；这不等于履约完成。
- 请求结果使用 HAL 的 result 链接发现；未形成时返回 404。
- 读者从内容访问申请沿 result、content 链接取得同一章节；每次检索重新核验当前退款和恢复资格。
- 写入使用 Idempotency-Key；同键同输入复用原结果，不同输入返回 409。
- 时间、金额和余额遵循业务含义；派生截止、派生金额及账本余额不接受客户端自由赋值。
- 所有当前表示使用 no-store；不跨读者缓存付费内容或权益结果。
- 403 表示无本实例权限，422 表示证据、金额、期限或关联不合要求。

## 交付文件

[generated/v1](generated/v1/) 包含接口清单、HTTP 契约、OpenAPI、表示样例、HTTP 流程和机器投影。源文件修改后重新检查，交付目录使用新的批次，不手改生成文件。

检查命令：

```bash
python3 .agents/skills/fm-api-design/scripts/fm_api.py check \
  --project-root "$PWD" \
  --fm "$PWD/.evidence/fm" \
  --fm-skill "$PWD/.agents/skills/evidence-fm" \
  --api "$PWD/.evidence/api/api.yaml"
```

HTTP 流程只验证契约与数据衔接，`runtimeValidated` 为 false。认证、机构验签、幂等存储、原子扣减和业务前置规则仍需由实际服务执行并验收。
