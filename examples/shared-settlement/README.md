# 共享结算：一笔收入同时核销季度与年度指标

业绩负责人和财务控制方签署《绩效协议》。财务发出一个或多个季度指标请求；业绩负责人发出每份协议唯一的年度指标请求。已入账的一笔收入由财务登记一次，凭证保留业务流水、CNY 分金额，以及本次核销的**请求实例 ID**。同一笔收入分别计入两个统计口径，不生成第二份凭证，也不将两次归属相加为两笔收入。

`credit-quarter-and-year-once` 在同一协议下建立 Q1 和年度请求，提交一份共享收入凭证，然后单独锁定 Q1。季度、年度窗口在本例中分别使用固定 90 天和 365 天；两者都以服务时间为准。验收样例用一笔足额且在时窗内的关联收入满足两个指标。季度锁账凭证引用已有收入凭证，仍是一对一的独占动作。这不是多笔收入的完整累计账务实现；多订单合并开票可复用相同的共享拓扑，不与本例混用合同或记录。

| 操作     | 路径                                                                                      | 语义                                                                |
| -------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| POST     | `/performance-agreements`                                                                 | 签署绩效协议                                                        |
| POST     | `/performance-agreements/{contractId}/quarterly-targets`                                  | 新增一个季度指标                                                    |
| POST     | `/performance-agreements/{contractId}/annual-target`                                      | 建立唯一年度指标                                                    |
| **POST** | `/revenue-confirmations`                                                                  | 唯一的收入登记入口；Body 的 `request_ids` 同时包含季度与年度请求 ID |
| **GET**  | `/revenue-confirmations/{revenueConfirmationId}`                                          | 顶层权威凭证，也是 `201 Location` 和 HAL `self`                     |
| **GET**  | `/performance-agreements/{contractId}/quarterly-targets/{targetId}/revenue-confirmations` | 从季度实例反向查关联收入                                            |
| **GET**  | `/performance-agreements/{contractId}/annual-target/revenue-confirmations`                | 从年度单例反向查关联收入，不需要年度路径参数                        |
| POST     | `/performance-agreements/{contractId}/quarterly-targets/{targetId}/confirmation`          | 独占季度锁账，不重复登记收入                                        |

反向路径只提供 GET；两个 HAL 集合嵌入的收入项都指向同一条顶层凭证。服务仍须校验请求 ID 的业务关联和角色权限，不能把链接或数组形状当成授权。内联示例使用已知的调用方业务 ID，使两次归属可在验收中精确比对。

## 编译与核验

从仓库根目录运行：

```sh
pnpm nx build cli
pnpm evidence check examples/shared-settlement/model/shared-settlement.evidence.json --scope context.performance
pnpm evidence export --model examples/shared-settlement/model/shared-settlement.evidence.json --out examples/shared-settlement/generated
pnpm examples:verify
```

[OpenAPI](generated/openapi.json) 和 [Bruno 集合](generated/bruno.json) 均由 CLI 生成。验收流校验单笔登记、关联 ID 列表和锁账依据；两个反向 GET 由契约回归测试覆盖。此目录不提供后端，可用 `pnpm evidence test --target <URL> --scenarios examples/shared-settlement/generated` 验证实现了契约的测试环境。
