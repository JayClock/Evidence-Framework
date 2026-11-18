# 数字广告投放：订单支付与日报

广告主与广告代理是投放订单的两个签约角色。代理发起预付款申请，广告主承担付款义务，并将到账登记委托给支付对账系统。支付系统不是合同一方，也不能凭回调授权读取凭证。到账金额从已签订单的全额预付款计算，单位为 CNY 分；请求体不允许回填金额或服务时间。

同一个 FM Bundle 包含两个**独立验收流**，各自创建自己的订单和凭证：

| Flow                          | 验收内容                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `prepayment-only`             | 直接建单 → 开启 24 小时支付窗口 → 支付系统登记一次到账。验证 1:1 确认，不依赖磋商或日报。 |
| `negotiation-to-daily-report` | 征询 → 报价 → 通过报价签署独立订单 → 支付 → 上线 → 受理日报请求 → 形成日报凭证。          |

## 关键端点

| 操作 | 路径                                                                               | 结果                                                                                  |
| ---- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| POST | `/ads-promotion-inquiries`                                                         | 创建投放需求征询，72 小时有效                                                         |
| POST | `/ads-promotion-inquiries/{inquiryId}/ads-promotion-proposal`                      | 报价回应征询，48 小时有效                                                             |
| POST | `/ads-promotion-inquiries/{inquiryId}/ads-promotion-proposal/ads-promotion-orders` | `201 Location` 指向新的独立订单                                                       |
| GET  | `/ads-promotion-orders/{contractId}`                                               | 签署后的权威订单地址；不依赖磋商路径                                                  |
| POST | `/ads-promotion-orders/{contractId}/payment`                                       | 开启支付窗口                                                                          |
| POST | `/ads-promotion-orders/{contractId}/payment/confirmation`                          | `201`；`Location` 与 HAL `self` 指向 `/payment-confirmations/{paymentConfirmationId}` |
| POST | `/ads-promotion-orders/{contractId}/advertising`                                   | 到账后申请上线，48 小时履约窗口                                                       |
| POST | `/ads-promotion-orders/{contractId}/advertising/confirmation`                      | 登记实际上线，详情为 `/advertising-confirmations/{advertisingConfirmationId}`         |
| POST | `/ads-promotion-orders/{contractId}/daily-reports`                                 | **`202 Accepted`**；只承诺受理生成请求                                                |
| GET  | `/ads-promotion-orders/{contractId}/daily-reports/{reportId}`                      | 轮询已受理请求，这是 `202 Location` 指向的资源                                        |
| POST | `/ads-promotion-orders/{contractId}/daily-reports/{reportId}/confirmation`         | 报表统计完成后登记，**`201 Created`**；不是任务受理                                   |
| GET  | `/daily-report-confirmations/{dailyReportConfirmationId}`                          | 读取已形成的独立日报凭证与归档标识                                                    |

每个订单可按统计日提交多份日报请求，每次提交都产生一个可单独轮询的请求实例，24 小时内形成日报才满足完成规则。示例由请求本身充当监视资源，不另造 `/tasks` 任务体系。服务在结果存在时才应在监视资源中暴露实际的 `result:confirmation.daily-report` 链接；OpenAPI 中的模板不是已完成的证明。广告主可以跟随结果链接读取日报，但只有代理能登记结果。

## 编译与核验

从仓库根目录运行：

```sh
pnpm nx build cli
pnpm evidence check examples/digital-advertising/model/digital-advertising.evidence.json --scope context.advertising-order
pnpm evidence export --model examples/digital-advertising/model/digital-advertising.evidence.json --out examples/digital-advertising/generated
pnpm examples:verify
```

`model/` 是源；[OpenAPI](generated/openapi.json) 和 [Step CI](generated/acceptance.stepci.yml) 均由 CLI 生成。验收固定每一步的业务时钟，校验 `202 Location` 是否存在、两个日报步骤的状态码与 HAL `self`。本目录不提供广告后端、任务执行器或轮询集成测试；对实现了该契约的测试环境，可运行 `pnpm evidence test --target <URL> --scenarios examples/digital-advertising/generated/acceptance.stepci.yml`。
