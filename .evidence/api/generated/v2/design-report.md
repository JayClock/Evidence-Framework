# FM → API 设计报告

- 设计：`api.column-subscription`
- FM 状态：`draft`
- 接口数（含角色变体）：42
- 整体 Context 数：10

## 资源

- 付费内容访问请求（collection）：`/subscriptions/{subscriptionId}/accesses` / `/subscriptions/{subscriptionId}/accesses/{accessId}` → `request.access`
- 内容提供凭证（singleton）：`/subscriptions/{subscriptionId}/accesses/{accessId}/result` → `confirmation.access`
- 预付费账户协议（collection）：`/prepaid-accounts` / `/prepaid-accounts/{accountId}` → `contract.prepaid`
- 章节内容（collection）：`/chapters` / `/chapters/{chapterId}` → `thing.chapter`
- 专栏（collection）：`/columns` / `/columns/{columnId}` → `thing.column`
- 账户余额抵扣请求（collection）：`/prepaid-accounts/{accountId}/debits` / `/prepaid-accounts/{accountId}/debits/{debitId}` → `request.prepaid`
- 预付费抵扣凭证（singleton）：`/prepaid-accounts/{accountId}/debits/{debitId}/result` → `confirmation.prepaid`
- 断更下架记录（collection）：`/discontinuations` / `/discontinuations/{discontinuationId}` → `evidence.discontinuation`
- 订阅费支付请求（singleton）：`/subscriptions/{subscriptionId}/payment` → `request.payment`
- 断更退款请求（singleton）：`/subscriptions/{subscriptionId}/refund` → `request.refund`
- 退款到账凭证（singleton）：`/subscriptions/{subscriptionId}/refund/result` → `confirmation.refund`
- 重新上架记录（collection）：`/relaunches` / `/relaunches/{relaunchId}` → `evidence.relaunch`
- 免费恢复请求（singleton）：`/subscriptions/{subscriptionId}/restoration` → `request.restore`
- 免费恢复凭证（singleton）：`/subscriptions/{subscriptionId}/restoration/result` → `confirmation.restore`
- 专栏订阅合同（collection）：`/subscriptions` / `/subscriptions/{subscriptionId}` → `contract.subscription`

## 整体模型覆盖

- `confirmation.access`：api；接口：capability.read-access-result-publisher, capability.read-access-result-reader, capability.register-access-result-publisher
- `confirmation.mobile`：external；接口：—
  - 依据：移动支付机构交付并负责其协议、扣款请求和实际扣款证明；本平台核验既有凭证，不代替机构提供接口。
- `confirmation.prepaid`：api；接口：capability.read-debit-result-account-provider, capability.read-debit-result-account-user, capability.register-debit-result-account-provider
- `confirmation.refund`：api；接口：capability.read-refund-result-publisher, capability.read-refund-result-reader, capability.register-refund-result-publisher
- `confirmation.restore`：api；接口：capability.read-restore-result-publisher, capability.read-restore-result-reader, capability.register-restore-result-publisher
- `contract.mobile`：external；接口：—
  - 依据：移动支付机构交付并负责其协议、扣款请求和实际扣款证明；本平台核验既有凭证，不代替机构提供接口。
- `contract.prepaid`：api；接口：capability.read-account-account-provider, capability.read-account-account-user, capability.register-account-account-user
- `contract.subscription`：api；接口：capability.read-subscription-publisher, capability.read-subscription-reader, capability.register-subscription-reader
- `evidence.discontinuation`：api；接口：capability.read-discontinuation-publisher, capability.read-discontinuation-reader, capability.register-discontinuation-publisher
- `evidence.relaunch`：api；接口：capability.read-relaunch-publisher, capability.read-relaunch-reader, capability.register-relaunch-publisher
- `party.mobile-provider`：internal；接口：—
  - 依据：主体用于跨合同身份绑定，不提供人员或机构档案管理接口。
- `party.publisher`：internal；接口：—
  - 依据：主体用于跨合同身份绑定，不提供人员或机构档案管理接口。
- `party.reader`：internal；接口：—
  - 依据：主体用于跨合同身份绑定，不提供人员或机构档案管理接口。
- `request.access`：api；接口：capability.read-access-publisher, capability.read-access-reader, capability.register-access-reader
- `request.mobile`：external；接口：—
  - 依据：移动支付机构交付并负责其协议、扣款请求和实际扣款证明；本平台核验既有凭证，不代替机构提供接口。
- `request.payment`：api；接口：capability.read-payment-publisher, capability.read-payment-reader, capability.register-payment-publisher
- `request.prepaid`：api；接口：capability.read-debit-account-provider, capability.read-debit-account-user, capability.register-debit-account-user
- `request.refund`：api；接口：capability.read-refund-publisher, capability.read-refund-reader, capability.register-refund-reader
- `request.restore`：api；接口：capability.read-restore-publisher, capability.read-restore-reader, capability.register-restore-reader
- `thing.chapter`：api；接口：capability.read-chapter-reader
- `thing.column`：api；接口：capability.read-column-publisher, capability.read-column-reader

## HTTP 操作

- `POST /subscriptions/{subscriptionId}/accesses`：capability.register-access-reader
- `GET /subscriptions/{subscriptionId}/accesses/{accessId}`：capability.read-access-publisher, capability.read-access-reader
- `GET /subscriptions/{subscriptionId}/accesses/{accessId}/result`：capability.read-access-result-publisher, capability.read-access-result-reader
- `POST /subscriptions/{subscriptionId}/accesses/{accessId}/result`：capability.register-access-result-publisher
- `POST /prepaid-accounts`：capability.register-account-account-user
- `GET /prepaid-accounts/{accountId}`：capability.read-account-account-provider, capability.read-account-account-user
- `GET /chapters/{chapterId}`：capability.read-chapter-reader
- `GET /columns/{columnId}`：capability.read-column-publisher, capability.read-column-reader
- `POST /prepaid-accounts/{accountId}/debits`：capability.register-debit-account-user
- `GET /prepaid-accounts/{accountId}/debits/{debitId}`：capability.read-debit-account-provider, capability.read-debit-account-user
- `GET /prepaid-accounts/{accountId}/debits/{debitId}/result`：capability.read-debit-result-account-provider, capability.read-debit-result-account-user
- `POST /prepaid-accounts/{accountId}/debits/{debitId}/result`：capability.register-debit-result-account-provider
- `POST /discontinuations`：capability.register-discontinuation-publisher
- `GET /discontinuations/{discontinuationId}`：capability.read-discontinuation-publisher, capability.read-discontinuation-reader
- `GET /subscriptions/{subscriptionId}/payment`：capability.read-payment-publisher, capability.read-payment-reader
- `POST /subscriptions/{subscriptionId}/payment`：capability.register-payment-publisher
- `GET /subscriptions/{subscriptionId}/refund`：capability.read-refund-publisher, capability.read-refund-reader
- `POST /subscriptions/{subscriptionId}/refund`：capability.register-refund-reader
- `GET /subscriptions/{subscriptionId}/refund/result`：capability.read-refund-result-publisher, capability.read-refund-result-reader
- `POST /subscriptions/{subscriptionId}/refund/result`：capability.register-refund-result-publisher
- `POST /relaunches`：capability.register-relaunch-publisher
- `GET /relaunches/{relaunchId}`：capability.read-relaunch-publisher, capability.read-relaunch-reader
- `GET /subscriptions/{subscriptionId}/restoration`：capability.read-restore-publisher, capability.read-restore-reader
- `POST /subscriptions/{subscriptionId}/restoration`：capability.register-restore-reader
- `GET /subscriptions/{subscriptionId}/restoration/result`：capability.read-restore-result-publisher, capability.read-restore-result-reader
- `POST /subscriptions/{subscriptionId}/restoration/result`：capability.register-restore-result-publisher
- `POST /subscriptions`：capability.register-subscription-reader
- `GET /subscriptions/{subscriptionId}`：capability.read-subscription-publisher, capability.read-subscription-reader

## 表示与链接

- 尚未设计表示。

## 流程回映

- `journey.access-after-refund`：mapped（scenario.access-after-refund）
- `journey.access-expired`：mapped（scenario.access-expired）
- `journey.cutoff-paid`：mapped（scenario.cutoff-paid）
- `journey.cutoff-pending`：mapped（scenario.cutoff-pending）
- `journey.discontinuation-refund`：mapped（scenario.discontinuation-refund）
- `journey.free-restoration`：mapped（scenario.free-restoration）
- `journey.insufficient-balance`：mapped（scenario.insufficient-balance）
- `journey.late-paid`：mapped（scenario.late-paid）
- `journey.mobile-subscription`：mapped（scenario.mobile-subscription）
- `journey.payment-expired`：mapped（scenario.payment-expired）
- `journey.payment-pending`：mapped（scenario.payment-pending）
- `journey.prepaid-subscription`：mapped（scenario.prepaid-subscription）
- `journey.refund-expired`：mapped（scenario.refund-expired）
- `journey.refund-late`：mapped（scenario.refund-late）
- `journey.restore-charged`：mapped（scenario.restore-charged）
- `journey.restore-expired`：mapped（scenario.restore-expired）
- `journey.short-paid`：mapped（scenario.short-paid）
- `journey.wrong-reader`：mapped（scenario.wrong-reader）

## 诊断与未决项

- 整体模型与接口静态检查未发现错误或缺口；不代表服务端实现或运行验收已经完成。

## 检查边界

静态结果不证明接口已实现、授权已生效、业务场景已运行，也不把 FM 时间字段解释为入库或回调时间。
