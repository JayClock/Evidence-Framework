# 产研迭代：一个时段，多份故事验收凭证

产品负责人和研发团队签署《迭代计划》。产品负责人提交待办清单版本和故事数，打开 **14 天**的履约窗口。研发团队确认接单并锁定该版本；该锁定凭证只能登记一次。随后产品负责人验收不同的已交付故事，每次都追加一份新凭证，不覆盖迭代、基线或任何旧故事凭证。研发团队另行申请迭代评审，产品负责人在 48 小时内确认纪要。

`two-stories-one-sprint` 使用同一迭代、同一待办窗口和一次基线锁定，验收两个不同故事。完成规则要求基线锁定后、截止时间前形成有效记录，且故事数达标、故事不重复。锁定凭证的待办版本由待办请求派生，不接受调用方回填。

| 操作      | 路径                                                 | 语义                                                                      |
| --------- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| POST、GET | `/iteration-plans`                                   | 确立迭代或读取迭代集合                                                    |
| GET       | `/iteration-plans/{contractId}`                      | 权威迭代详情                                                              |
| POST、GET | `/iteration-plans/{contractId}/backlog`              | 创建或读取此迭代唯一的待办请求                                            |
| POST      | `/iteration-plans/{contractId}/backlog/confirmation` | 锁定一次基线；凭证详情为 `/backlog-confirmations/{backlogConfirmationId}` |
| POST      | `/iteration-plans/{contractId}/story-confirmations`  | 追加一条独立的故事验收凭证                                                |
| GET       | `/iteration-plans/{contractId}/story-confirmations`  | HAL 账本视图；各条目的 `self` 指向各自的凭证                              |
| GET       | `/story-confirmations/{storyConfirmationId}`         | 权威凭证详情，也是追加成功时的 `201 Location` 与 HAL `self`               |

故事验收只属于迭代，不属于广告订单。该案例没有金额逻辑；服务时钟形成 `signed_at`、`started_at` 和 `confirmed_at`，`expired_at` 由模型中的履约窗口派生。

## 编译与核验

从仓库根目录运行：

```sh
pnpm nx build cli
pnpm evidence check examples/agile-sprint/model/agile-sprint.evidence.json --scope context.sprint
pnpm evidence export --model examples/agile-sprint/model/agile-sprint.evidence.json --out examples/agile-sprint/generated
pnpm examples:verify
```

[OpenAPI](generated/openapi.json) 和 [Step CI](generated/acceptance.stepci.yml) 均由 `model/` 中的 FM Bundle 生成。本目录不提供后端；可以对遵循此契约的测试环境执行 `pnpm evidence test --target <URL> --scenarios examples/agile-sprint/generated/acceptance.stepci.yml`。生成的验收流验证写入和返回的两条凭证；集合、详情及 HAL 路径由契约回归测试覆盖。
