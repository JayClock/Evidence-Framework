# 订阅与移动支付 MyBatis 持久化

> 用 Flyway、Mapper/XML 和关联适配器保存合同、付款请求、移动请求/结果及幂等事实。

## 1. Guides：当前任务前馈

- 项目入口：`AGENTS.md`、`docs/guides/index.md`；总索引：[`../index.md`](../index.md)。
- 交付目标：为已确认领域契约提供真实 H2/MyBatis 写入、读取、唯一性、幂等和回滚证据。
- 非目标：不决定生产数据库/隔离级别，不在 Mapper 实现业务完成规则，不跨模块直接写私有表。
- 工程来源：`docs/architecture/modules.md`、`docs/engineering/{procedures,backend,testing,examples}.md`、`docs/howtos/database.md`。
- 工序实例：持久化适配；真实 H2、Flyway、MyBatis XML、领域对象和事务，禁止 Row/PO 复制层。Q1 支撑真实装配 Q2。
- 前置产物：订阅与移动支付领域类型、根/关联契约和唯一结果语义。

## 2. 局部设计

- 订阅包拥有合同、付款请求和订阅幂等记录；移动支付包拥有协议、扣款请求和机构结果。
- Flyway 追加 `V2`，不修改 V1；外键和唯一约束只表达已确认身份/基数。
- 合同登记、付款请求形成、移动请求登记、移动结果登记分别有明确事务入口；失败不留部分行。
- 同幂等键同 payload 重放原结果，不同 payload 冲突；同一请求不得形成第二份有效结果。

## 3. 实施与检查

```yaml
schemaVersion: '2.0'
kind: task-plan
taskKey: mybatis::context.subscription::design.subscription-payment-storage
planRef: ../index.md
sourceRefs: [contract.subscription, request.payment, request.mobile, confirmation.mobile, relation.contract-payment, relation.mobile-result, design.subscription-payment-storage]
ruleRefs: []
scenarioRefs: [scenario.mobile-subscription, scenario.payment-pending]
storyRefs: [US-001, US-002, US-003]
acceptanceRefs: [AC-001-01, AC-001-02, AC-002-02, AC-003-02]
procedureRefs:
  - docs/engineering/procedures.md
  - docs/engineering/testing.md
  - docs/engineering/backend.md
  - docs/howtos/database.md
  - docs/engineering/examples.md
dependencyUsage:
  - taskRef: domain::context.subscription::request.payment
    consumes: 合同/付款请求实体、根集合与关联契约；不复制规则。
    readinessEvidence: 领域模块当前测试和公开接口。
  - taskRef: domain::context.mobile::request.mobile
    consumes: 移动协议/请求/结果及 PaymentProof 适配契约。
    readinessEvidence: CHECK-DOM-MOBILE-001 的当前源实际结果。
files:
  create:
    - libs/backend/persistent/src/main/resources/db/migration/V2__create_subscription_payment_tables.sql
    - libs/backend/persistent/src/main/java/com/evidencepoc/backend/persistent/mappers/SubscriptionsMapper.java
    - libs/backend/persistent/src/main/resources/mybatis.mappers/SubscriptionsMapper.xml
    - libs/backend/persistent/src/main/java/com/evidencepoc/backend/persistent/mappers/MobilePaymentsMapper.java
    - libs/backend/persistent/src/main/resources/mybatis.mappers/MobilePaymentsMapper.xml
    - libs/backend/persistent/src/main/java/com/evidencepoc/backend/persistent/associations/Subscriptions.java
    - libs/backend/persistent/src/main/java/com/evidencepoc/backend/persistent/associations/MobilePayments.java
    - libs/backend/persistent/src/test/java/com/evidencepoc/backend/persistent/MyBatisSubscriptionsTests.java
    - libs/backend/persistent/src/test/java/com/evidencepoc/backend/persistent/MyBatisMobilePaymentsTests.java
  modify:
    - libs/backend/persistent/src/main/resources/mybatis-config.xml
    - libs/backend/persistent/src/main/java/com/evidencepoc/backend/persistent/PersistenceConfiguration.java
    - libs/backend/persistent/src/main/java/com/evidencepoc/backend/persistent/context/SubscriptionContext.java
  reuse:
    - libs/backend/persistent/src/main/resources/db/migration/V1__create_users.sql
    - libs/backend/persistent/src/test/java/com/evidencepoc/backend/persistent/MyBatisUsersTests.java
steps:
  - 追加 V2 迁移，明确表/列/唯一键/外键归属，不修改 V1。
  - 用 Mapper/XML resultMap 直接装配不可变领域对象及关联适配器。
  - 为各写入口声明事务、检查影响行数，并实现幂等 payload 判定和唯一结果约束。
  - 验证写后重读、列表稳定顺序、缺失付款、重复通知、冲突幂等和强制回滚。
checks:
  - id: CHECK-SQL-SUB-001
    purpose: 证明合同和付款请求通过真实 SQL/XML 往返并在失败时回滚。
    quadrant: Q1
    subject: SubscriptionsMapper/XML、迁移和本地事务
    dependencies: 真实 H2、Flyway、MyBatis、领域对象；不证明生产方言。
    inputs: 完整合同、派生付款请求、重复 subscriptionId、缺字段和事务内强制异常。
    expected: 写后重读字段一致；每合同最多一请求；冲突/异常不留下合同、请求或幂等残行；列表稳定按约定排序。
    testFiles: [libs/backend/persistent/src/test/java/com/evidencepoc/backend/persistent/MyBatisSubscriptionsTests.java]
    cwd: .
    command: ./gradlew :backend-persistent:test --tests com.evidencepoc.backend.persistent.MyBatisSubscriptionsTests --rerun-tasks
    procedure: docs/engineering/testing.md
    preparationTaskRefs: [domain::context.subscription::request.payment, domain::context.mobile::request.mobile]
    gapRefs: [GAP-DATABASE]
    evidenceRequired: 命令、退出码、Flyway 版本、往返/唯一/回滚断言摘要和 H2 限制。
  - id: CHECK-SQL-MOBILE-001
    purpose: 证明移动请求/结果追加、幂等重放和唯一结果约束。
    quadrant: Q1
    subject: MobilePaymentsMapper/XML 与结果登记事务
    dependencies: 真实 H2/MyBatis；不调用支付端口。
    inputs: 固定 MOBILE-001/PAY-001/MOBILE-REQ-001/09:02 夹具；同键同 payload、同键不同 payload、同请求重复相同结果、同请求第二个不同结果和强制回滚。
    expected: 同 payload 返回原事实；不同 payload 冲突；不形成第二份有效结果；异常不留部分行。
    testFiles: [libs/backend/persistent/src/test/java/com/evidencepoc/backend/persistent/MyBatisMobilePaymentsTests.java]
    cwd: .
    command: ./gradlew :backend-persistent:test --tests com.evidencepoc.backend.persistent.MyBatisMobilePaymentsTests --rerun-tasks
    procedure: docs/engineering/testing.md
    preparationTaskRefs: [domain::context.subscription::request.payment, domain::context.mobile::request.mobile]
    gapRefs: [GAP-DATABASE]
    evidenceRequired: 命令、退出码、唯一/幂等/回滚断言摘要和 H2 限制。
completionCriteria:
  - CHECK-SQL-SUB-001 与 CHECK-SQL-MOBILE-001 通过。
  - Mapper/XML 直接返回领域对象，业务完成判断未进入 SQL/Mapper。
  - '`./gradlew :backend-persistent:test --rerun-tasks` 实际通过；明确不声称生产数据库已验证。'
observedEvidence: []
```

## 4. 执行与交接纪律

生产数据库未选只阻塞生产 SQL/并发保证；H2 任务仍须验证当前 local/test 事务。表或事务归属变化必须返回 Plan。
