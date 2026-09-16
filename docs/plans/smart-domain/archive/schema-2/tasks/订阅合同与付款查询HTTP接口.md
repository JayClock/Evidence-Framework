# 订阅合同与付款查询 HTTP 接口

> 按权威 `api.yaml` 及本计划的正式 API 投影，交付合同登记、本人合同列表、合同读取和付款读取的 Jersey/HAL 契约。

## 1. Guides：当前任务前馈

- 项目入口：`AGENTS.md`、`docs/guides/index.md`；总索引：[`../index.md`](../index.md)。
- 交付目标：实现 `POST /subscriptions`、`GET /subscriptions/{subscriptionId}`、`GET /users/{userId}/subscriptions`、`GET /subscriptions/{subscriptionId}/payment`。
- 非目标：不实现支付请求公开 POST、真实认证、内容/退款/恢复/预付费接口，不依赖 persistent/app/数据库。
- 业务/API 来源：`.evidence/api/api.yaml` 及 `docs/plans/smart-domain/api-planning-input.yaml` 中 4 个 capability、4 个 resource；权威 API 的 representation/operation/journey 和 FM 合同、付款字段用于追溯。
- 工程基线：`docs/engineering/{procedures,api,security,testing,examples}.md` 和 Jersey 子资源约束。
- 工序实例：HTTP 契约；真实随机端口、Jersey、Jackson、HAL/HAL-FORMS 和 Pagination，mock 领域根/关联，不 mock Resource/序列化器。
- 前置产物：Reader Context、合同根集合、付款查询和领域异常。
- 已确认输入：POST schema 使用全部 11 个必填字段；`GAP-IDENTITY` 允许 local/test 协议测试继续，但 403 不计为完成证据。

## 2. 局部设计

- Root → subscriptions 集合 → 已绑定 Subscription → payment singleton；Users 子资源导航到本人合同集合。
- 请求使用可写 Bean，领域 Description 保持不可变；未知字段/非法 JSON/类型错误严格拒绝。
- POST 要求 `Idempotency-Key`，返回 201、Location 和 self；同键冲突映射 409，业务字段失败映射 422。
- 读取返回 `Cache-Control: no-store`；付款请求不存在映射 404；状态来自领域，不以资源存在代替完成。
- 列表复用 smart-domain Pagination，空集合/边界/可跟随链接按实际 0.3.0 行为测试。

## 3. 实施与检查

```yaml
schemaVersion: '2.0'
kind: task-plan
taskKey: api::context.subscription::capability.register-subscription-reader
planRef: ../index.md
sourceRefs: [resource.party-user, resource.subscription, resource.party-subscriptions, resource.payment, capability.register-subscription-reader, capability.list-subscriptions-reader, capability.read-subscription-reader, capability.read-payment-reader, design.subscription-http-contract]
ruleRefs: []
scenarioRefs: [scenario.mobile-subscription, scenario.payment-pending]
storyRefs: [US-001, US-003]
acceptanceRefs: [AC-001-01, AC-001-02, AC-003-01, AC-003-02, AC-003-03]
procedureRefs:
  - docs/engineering/procedures.md
  - docs/engineering/testing.md
  - docs/engineering/api.md
  - docs/engineering/security.md
  - docs/engineering/examples.md
dependencyUsage:
  - taskRef: foundation::context.subscription::role.reader
    consumes: User/Reader Context 入口及主体身份语义。
    readinessEvidence: CHECK-FND-001 和 CHECK-FND-002。
  - taskRef: domain::context.subscription::request.payment
    consumes: 合同根集合、Reader 行为、付款查询、状态和领域异常。
    readinessEvidence: CHECK-DOM-SUB-001 与 CHECK-DOM-PAY-001。
files:
  create:
    - libs/backend/api/src/main/java/com/evidencepoc/backend/api/SubscriptionsApi.java
    - libs/backend/api/src/main/java/com/evidencepoc/backend/api/SubscriptionApi.java
    - libs/backend/api/src/main/java/com/evidencepoc/backend/api/PaymentApi.java
    - libs/backend/api/src/main/java/com/evidencepoc/backend/api/SubscriptionRequest.java
    - libs/backend/api/src/main/java/com/evidencepoc/backend/api/representation/SubscriptionModel.java
    - libs/backend/api/src/main/java/com/evidencepoc/backend/api/representation/PaymentModel.java
    - libs/backend/api/src/test/java/com/evidencepoc/backend/api/SubscriptionsApiTests.java
    - libs/backend/api/src/test/java/com/evidencepoc/backend/api/PaymentApiTests.java
  modify:
    - libs/backend/api/src/main/java/com/evidencepoc/backend/api/RootApi.java
    - libs/backend/api/src/main/java/com/evidencepoc/backend/api/UsersApi.java
    - libs/backend/api/src/main/java/com/evidencepoc/backend/api/UserApi.java
    - libs/backend/api/src/main/java/com/evidencepoc/backend/api/ApiTemplates.java
    - libs/backend/api/src/test/java/com/evidencepoc/backend/api/config/ApiTestApplication.java
  reuse:
    - libs/backend/api/src/test/java/com/evidencepoc/backend/api/ApiTest.java
    - libs/backend/api/src/test/java/com/evidencepoc/backend/api/UsersApiTests.java
steps:
  - 建立包含 11 个必填字段的严格请求 Bean、领域转换和错误映射。
  - 实现 subscriptions 集合/成员/payment 子资源及 Users 到合同列表导航，所有手工子资源经 ResourceContext 初始化。
  - 构造 HAL 表示、Location/self、no-store、分页和可编辑模板；不写业务规则。
  - 用 mock 领域边界运行真实 HTTP 正常、非法、缺失、冲突、空列表和链接跟随测试。
checks:
  - id: CHECK-API-SUB-001
    purpose: 证明合同登记/读取/列表的 HTTP 输入、调用、错误和导航契约。
    quadrant: Q1
    subject: SubscriptionsApi、SubscriptionApi 和用户合同列表子资源
    dependencies: 真实随机端口/Jersey/Jackson/HAL/Pagination；mock 领域根集合。
    inputs: 包含 11 个字段的完整合同、Idempotency-Key；逐一缺字段、未知字段、非法 JSON、同键冲突；空/首尾/越界列表。
    expected: 201+Location/self、200 读取/列表、409/422/400 按契约；拒绝时不调用写行为；链接可跟随且 no-store。
    testFiles: [libs/backend/api/src/test/java/com/evidencepoc/backend/api/SubscriptionsApiTests.java]
    cwd: .
    command: ./gradlew :backend-api:test --tests com.evidencepoc.backend.api.SubscriptionsApiTests --rerun-tasks
    procedure: docs/engineering/testing.md
    preparationTaskRefs: [foundation::context.subscription::role.reader, domain::context.subscription::request.payment]
    gapRefs: [GAP-IDENTITY]
    evidenceRequired: 命令、退出码、实际 HTTP 状态/媒体类型/链接和 mock 调用摘要。
  - id: CHECK-API-PAY-001
    purpose: 证明付款表示区分资源存在与业务状态，缺失请求为 404。
    quadrant: Q1
    subject: PaymentApi
    dependencies: 真实 HTTP/序列化；mock 付款查询返回 completed、pending 或缺失。
    inputs: SUB-20261001-001 的 completed、pending、未形成付款三种领域结果。
    expected: completed/pending 均返回 200 且状态来自领域；未形成返回 404；self 可跟随、no-store。
    testFiles: [libs/backend/api/src/test/java/com/evidencepoc/backend/api/PaymentApiTests.java]
    cwd: .
    command: ./gradlew :backend-api:test --tests com.evidencepoc.backend.api.PaymentApiTests --rerun-tasks
    procedure: docs/engineering/testing.md
    preparationTaskRefs: [domain::context.subscription::request.payment]
    gapRefs: [GAP-IDENTITY]
    evidenceRequired: 命令、退出码和三种实际 HTTP 响应摘要。
completionCriteria:
  - CHECK-API-SUB-001 与 CHECK-API-PAY-001 通过，并证明 11 字段 POST schema。
  - '`./gradlew :backend-api:test --rerun-tasks` 实际通过，api 不依赖 persistent/app/数据库。'
  - QA-IDENTITY 未解决时只声明 local/test 能力，不声称 403 或生产授权完成。
observedEvidence: []
```

## 4. 执行与交接纪律

不得根据已有 User CRUD 推导生产主体权限；隐藏链接不等于授权。API 契约差异必须返回 API/需求拥有者，不静默改字段或状态码。
