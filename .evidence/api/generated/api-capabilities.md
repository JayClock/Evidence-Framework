# API 接口清单

| Role       | URI                                                                          | Method | Business Capability  |
| ---------- | ---------------------------------------------------------------------------- | ------ | -------------------- |
| 读者       | `/subscriptions/{subscriptionId}/accesses/{accessId}`                        | GET    | 读取付费内容访问请求 |
| 读者       | `/subscriptions/{subscriptionId}/accesses/{accessId}/result`                 | GET    | 读取内容提供凭证     |
| 账户使用方 | `/prepaid-accounts/{accountId}`                                              | GET    | 读取预付费账户协议   |
| 读者       | `/chapters/{chapterId}`                                                      | GET    | 读取章节内容         |
| 读者       | `/columns/{columnId}`                                                        | GET    | 读取专栏             |
| 账户使用方 | `/prepaid-accounts/{accountId}/debits/{debitId}`                             | GET    | 读取账户余额抵扣请求 |
| 账户使用方 | `/prepaid-accounts/{accountId}/debits/{debitId}/result`                      | GET    | 读取预付费抵扣凭证   |
| 读者       | `/discontinuations/{discontinuationId}`                                      | GET    | 读取断更下架记录     |
| 读者       | `/subscriptions/{subscriptionId}/payment`                                    | GET    | 读取订阅费支付请求   |
| 读者       | `/subscriptions/{subscriptionId}/refund`                                     | GET    | 读取断更退款请求     |
| 读者       | `/subscriptions/{subscriptionId}/refund/result`                              | GET    | 读取退款到账凭证     |
| 读者       | `/subscriptions/{subscriptionId}/relaunches/{relaunchId}`                    | GET    | 读取重新上架记录     |
| 读者       | `/subscriptions/{subscriptionId}/relaunches/{relaunchId}/restoration`        | GET    | 读取免费恢复请求     |
| 读者       | `/subscriptions/{subscriptionId}/relaunches/{relaunchId}/restoration/result` | GET    | 读取免费恢复凭证     |
| 读者       | `/subscriptions/{subscriptionId}`                                            | GET    | 读取专栏订阅合同     |
| 读者       | `/subscriptions/{subscriptionId}/accesses`                                   | POST   | 申请访问付费章节     |
| 账户使用方 | `/prepaid-accounts`                                                          | POST   | 登记预付费账户协议   |
| 账户使用方 | `/prepaid-accounts/{accountId}/debits`                                       | POST   | 申请余额抵扣         |
| 读者       | `/subscriptions/{subscriptionId}/refund`                                     | POST   | 申请断更退款         |
| 读者       | `/subscriptions/{subscriptionId}/relaunches/{relaunchId}/restoration`        | POST   | 申请免费恢复         |
| 读者       | `/subscriptions`                                                             | POST   | 登记专栏订阅合同     |

> 本表是整体 FM 的接口索引；完整 HTTP 契约见 api-contracts.md 与 openapi.yaml，运行时授权仍由服务端执行。
