# 移动支付订阅主链 smart-domain 任务总索引

> 固定模块化单体与 MyBatis。本计划只覆盖 `US-001` 至 `US-003` 的 local/test 移动支付订阅主链，不把完整 FM/API 能力清单冒充本次软件范围。

## 1. 输入与范围

- 项目根：Git 工作树 `/Users/zhongjie/Downloads/Github/Evidence-Framework`，当前基线提交 `448b0a39e1a34d55ef10d7fa8ada0f63ed58aafe`；生成计划时保留工作树中无关的未跟踪资料。
- FM 根与输入摘要：`.evidence/fm`，模型 `column-subscription`；业务事实取 `contract.subscription`、`request.payment`、`request.mobile`、`confirmation.mobile`、相关角色/关系/规则和场景。
- API：权威契约仍为 `.evidence/api/api.yaml`；本计划的正式输入边界为 `docs/plans/smart-domain/api-planning-input.yaml`，仅投影 `capability.register-subscription-reader`、`capability.list-subscriptions-reader`、`capability.read-subscription-reader`、`capability.read-payment-reader` 及其 4 个支撑资源。未投影能力不从权威 API 删除。
- API 合成测试向量：`.evidence/api/generated/e2e-test-vectors.json` 从当前完整 API 契约确定性生成，供任务 8 选择相关向量实例化运行测试；它是派生产物，`runtimeValidated: false`，不替代权威 API、需求验收或运行结果。
- 软件范围与验收：`docs/requirements/scope.md`、`docs/requirements/stories.md` 和 `.evidence/discovery.md` 的本轮实施澄清；覆盖 `US-001`～`US-003`、`AC-001-01`～`AC-003-03`。内容访问、退款、恢复、预付费、异常履约、前端和真实支付协议不在本计划。
- 项目前馈入口：`AGENTS.md`、`docs/guides/index.md`。
- 工程基线：`docs/architecture/{overview,modules,domain-mapping}.md`、`docs/requirements/quality-attributes.md`、`docs/engineering/{procedures,testing,backend,api,security,examples}.md`、`docs/howtos/database.md`；smart-domain 固定版本为 `0.3.0`。
- 业务目标：登记包含 11 个必填字段且不可改写的订阅合同；登记成功后自动派生唯一付款请求，并使用 local/test 固定协议、请求标识和业务时间调用支付端口；保存移动支付结果，以固定业务时间判断 `pending/completed`，并通过约定 HTTP 能力读取合同和付款状态。
- 约束依据：单一 Spring Boot 后端应用；业务模块通过进程内公开契约协作；领域行为留在实体、Description、角色或拥有者关联；MyBatis XML 直接映射领域对象；Jersey 子资源提供 HAL 表示。
- 技术实况：现有 `User`/`Users`、`SubscriptionContext` 和 `Reader` 角色骨架已实现；订阅合同、付款请求、移动支付端口、业务表、Mapper/XML 和正式订阅 Resource 尚未实现。
- 业务模块映射：订阅模块拥有合同、付款请求及完成判断；移动支付模块拥有协议、扣款请求和机构结果，并仅通过 `PaymentProof` 公开契约供订阅模块消费。两者在同一应用进程内协作，不拆服务。
- 技术库映射：公开领域契约和规则位于 `libs/backend/domain`；Resource 位于 `libs/backend/api`；表、迁移、Mapper/XML 和关联适配器位于 `libs/backend/persistent`；local/test 适配与真实装配验收位于 `apps/backend`。
- 执行模式：现有平台与 Reader 上下文为 `verify`；其余为 `implementation`。状态只在 `taskNotes` 维护。
- 外部集成：本切片只有 local/test 模拟支付端口。真实协议、验签、超时、重试和可靠性属于 `QA-INTEGRATION`，不在本计划内补造。

### 工序选择与切片测试策略

采用 `docs/engineering/procedures.md` 的边界与契约设计、领域行为、持久化适配、HTTP 契约、应用装配与模块协作、业务旅程验收；未触发前端交互。生产身份、数据库和远程可靠性保持质量缺口，不生成没有依据的安全/性能任务。

| Q2 可观察结果                                                    | 必须支撑它的 Q1                                              | 功能上下文与替身边界                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `POST /subscriptions` 登记完整合同且失败不写入                   | 合同 Description/Reader 行为、幂等持久化和 API 输入映射测试  | domain 使用真实对象；persistent 使用真实 H2/MyBatis；api 使用 mock 领域根集合但真实 HTTP/Jersey |
| 付款请求按合同派生金额和闭合截止时间                             | `rule.payment-start/amount/deadline` 领域测试                | 固定 `signed_at=2026-10-01T09:00:00Z`；不读取服务器当前时间                                     |
| 唯一匹配证明产生 `completed`，截止前无证明为 `pending`           | `rule.mobile-completed` 与 `rule.payment-completed` 领域测试 | 具体 `confirmation.mobile` 实现窄 `PaymentProof`；领域 Fake 不证明 SQL 或远程协议               |
| 合同、列表和付款状态可通过 HTTP 读取，付款请求缺失为 404         | Resource/表示/导航的独立 HTTP 测试                           | mock 领域边界；不依赖 persistent/app；不把 Resource 测试当规则测试                              |
| local/test 主链从真实 HTTP 写入并经 SQL 重读为 completed/pending | app 随机端口真实 HTTP + H2 + 模拟支付端口测试                | local/test Stub 只返回固定机构结果；不证明生产支付、身份或数据库方言                            |

## 2. 业务模块与行为映射

| 业务模块及源 Context                                | 公开契约与允许依赖                                                                                   | 内部实现、表/迁移拥有者                                                   | 本地事务边界                                               | 来源/设计条目                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 订阅：`context.subscription`、`fulfillment.payment` | `SubscriptionContext`、`Reader`、合同根集合、`PaymentProof` 窄能力；API 与移动支付适配只依赖公开契约 | persistent 订阅包唯一拥有合同、付款请求、幂等记录及其 Mapper/XML/迁移     | 合同登记和付款请求写入各由订阅适配器声明事务；失败全部回滚 | `design.subscription-domain-contracts`、`design.subscription-payment-storage` |
| 移动支付：`context.mobile`、`fulfillment.mobile`    | 扣款端口、移动结果及其 `PaymentProof` 视图；订阅模块不访问移动支付 Mapper/私有表                     | persistent 移动支付包唯一拥有请求/结果写入；local/test 适配器提供固定结果 | 结果登记是独立本地事务；外部副作用不纳入数据库事务         | `design.mobile-domain-contracts`、`design.local-mobile-payment-adapter`       |
| 组合根协作                                          | 仅通过进程内公开契约连接订阅与移动支付，不调用自身 HTTP                                              | `apps/backend` 只装配，不承接业务规则                                     | 合同登记成功后自动形成付款请求并调用端口；结果独立事务登记 | `design.subscription-payment-orchestration`                                   |

| 源 ID                                   | 拥有者                     | 根集合或关联契约                                        | 行为/角色/证明                                     | 依据与缺口                                                    |
| --------------------------------------- | -------------------------- | ------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| `contract.subscription`                 | 订阅模块                   | `context.subscription` 的合同根集合；读者拥有的合同集合 | Reader 登记并读取包含 11 个必填字段的冻结合同事实  | 用户澄清与 FM/API 一致                                        |
| `request.payment`                       | 订阅模块                   | 每份合同 `0..1` 付款请求                                | 合同登记成功后自动派生；合同/请求/证明共同判断状态 | API 旅程中的 internal 步骤，不增加对外 capability             |
| `role.payment-proof`                    | 订阅模块定义、支付模块实现 | 只读窄能力，不创建新的证明记录                          | 匹配身份、标的、金额、币种、请求和业务时间         | 具体玩家为 `confirmation.mobile`                              |
| `request.mobile`、`confirmation.mobile` | 移动支付模块               | 每次请求 `0..1` 有效结果                                | local/test 固定夹具调用端口并幂等登记机构结果      | PAY-001、MOBILE-001、MOBILE-REQ-001、09:02，仅用于 local/test |

## 3. 计划输入与计算投影

索引只含下面一个 YAML 块；编译器读取 `slicing`，`compiled` 是实际编译输出。

```yaml
schemaVersion: '2.0'
kind: task-index
inputRoots:
  fm: .evidence/fm
  api: docs/plans/smart-domain/api-planning-input.yaml
sourceManifest:
  - path: .evidence/fm/model.yaml
    digest: 73b1f02ac0c296da6713be085a79b156d8aa11047304199b2402267bad13da1a
    refs: [context.subscription, fulfillment.payment, context.mobile, fulfillment.mobile, contract.subscription, request.payment, request.mobile, confirmation.mobile, role.reader, role.publisher, role.payment-proof, rule.payment-start, rule.payment-amount, rule.payment-deadline, rule.payment-completed, rule.mobile-completed, scenario.mobile-subscription, scenario.payment-pending, scenario.cutoff-paid]
  - path: .evidence/api/api.yaml
    digest: d8869e69826123b195e70e48cac21e3d55b13a7177de05e55270e51d4b2eccd1
    refs: [resource.party-user, resource.subscription, resource.party-subscriptions, resource.payment, capability.register-subscription-reader, capability.list-subscriptions-reader, capability.read-subscription-reader, capability.read-payment-reader]
  - path: docs/plans/smart-domain/api-planning-input.yaml
    digest: 1122d6b7f4bb466deb1d54b826ce4753f828d641e27cab94e5be6c0466cdfcd7
    refs: [resource.party-user, resource.subscription, resource.party-subscriptions, resource.payment, capability.register-subscription-reader, capability.list-subscriptions-reader, capability.read-subscription-reader, capability.read-payment-reader]
  - path: docs/requirements/scope.md
    digest: b188cfb67953bdca780c7a26290fe0a9c86c25defef7b8494b811ff30e3e1be2
    refs: [SCOPE-MVP, SCOPE-USER, SCOPE-PAY-ABNORMAL]
  - path: docs/requirements/stories.md
    digest: f26deb020a67d539a8d4024d962453cda6ef14dd4cddd88708848591b8ed47cf
    refs: [US-001, US-002, US-003, AC-001-01, AC-001-02, AC-002-01, AC-002-02, AC-002-03, AC-002-04, AC-002-05, AC-003-01, AC-003-02, AC-003-03]
  - path: .evidence/discovery.md
    digest: b152595e0d079d2f928675399e2161531794f9fe864f4e849adb0e0bea7f6e0c
    refs: [Q-MOBILE-FIXED-VALUES-001]
  - path: docs/architecture/overview.md
    digest: 6115dc1d28c3e2f4fc5d3e27dda6e593c7772568843af290c8c1f90c1d992e0c
  - path: docs/architecture/modules.md
    digest: a393f5894ed705926af8542b2165b6154557d20d106ffdb47b03a086369943a9
  - path: docs/architecture/domain-mapping.md
    digest: b66c066968633bab069533e3a91304edc5eb337b599db7c656b5ca10f742ca54
  - path: docs/requirements/quality-attributes.md
    digest: 2b611fc76c7593547897e984399573b87c9958f4d28004917a976df8bc6285e5
  - path: docs/engineering/procedures.md
    digest: 995acbf1bdb6414fd21ac6a832c97c4dd0cbe7f85d0d76ec6cea89d5a21691d1
  - path: docs/engineering/testing.md
    digest: d0e1683ad27d209d28f628f344fbb20a1479e94359254a6773f1197340ef51be
slicing:
  designItems:
    - id: design.reader-context-foundation
      sourceRefs: [party.user, role.reader, relation.user-as-reader, context.subscription]
      reason: 复用并复验现有 User -> SubscriptionContext -> Reader 入口和固定技术平台，不重新读取主体、不把角色当认证凭证。
    - id: design.subscription-domain-contracts
      sourceRefs: [context.subscription, contract.subscription, request.payment, role.reader, role.publisher, role.payment-proof, relation.contract-payment, rule.payment-completed]
      reason: 订阅模块公开合同根集合、Reader 行为和 PaymentProof 窄能力；合同与付款规则由领域拥有者实现，不泄漏 Mapper。
    - id: design.mobile-domain-contracts
      sourceRefs: [context.mobile, request.mobile, confirmation.mobile, relation.mobile-as-payment-proof, rule.mobile-completed]
      reason: 移动支付模块保留协议、请求和机构结果事实，并以 confirmation.mobile 适配 PaymentProof，不复制证明。
    - id: design.subscription-payment-storage
      sourceRefs: [contract.subscription, request.payment, request.mobile, confirmation.mobile, relation.contract-payment, relation.mobile-result]
      reason: MyBatis/Flyway 适配器分别拥有订阅与移动支付表、幂等和唯一结果约束；H2 只验证 local/test 行为。
    - id: design.local-mobile-payment-adapter
      sourceRefs: [request.mobile, confirmation.mobile, rule.mobile-completed, scenario.mobile-subscription]
      reason: local/test 固定使用 PAY-001、MOBILE-001、MOBILE-REQ-001 和 2026-10-01T09:02:00Z 调用确定性支付端口；不扩成生产协议、标识生成、验签、超时、重试或补偿规则。
    - id: design.subscription-http-contract
      sourceRefs: [resource.party-user, resource.subscription, resource.party-subscriptions, resource.payment, capability.register-subscription-reader, capability.list-subscriptions-reader, capability.read-subscription-reader, capability.read-payment-reader]
      reason: 一个从用户主体到订阅列表、并从合同到付款的 Jersey 子资源链交付合同登记/读取/列表和付款读取，独立 HTTP 测试 mock 领域公开契约。
    - id: design.subscription-payment-orchestration
      sourceRefs: [contract.subscription, request.payment, request.mobile, confirmation.mobile, scenario.mobile-subscription]
      reason: 合同登记成功后通过进程内契约自动形成付款请求并调用 local/test 支付端口，结果独立登记；不建立业务 Service 或调用自身 HTTP。
    - id: design.mobile-subscription-journey
      sourceRefs: [scenario.mobile-subscription, scenario.payment-pending, scenario.cutoff-paid, capability.register-subscription-reader, capability.read-subscription-reader, capability.read-payment-reader]
      reason: 以真实 HTTP、H2/MyBatis 和 local/test 支付适配器验证 completed、pending、截止边界、404 与失败不变性。
  groups:
    - concern: foundation
      ownerRef: context.subscription
      operationRef: role.reader
      fileName: 后端平台与Reader上下文基础复验.md
      unitKeys:
        - platform::profile.backend-modules
        - platform::profile.jersey
        - platform::profile.modular-monolith
        - platform::profile.mybatis
        - platform::profile.smart-domain
        - entity::party.user
        - context-design::context.subscription
        - actor-role::role.reader
        - association::relation.user-as-reader
        - design::design.reader-context-foundation
      dependsOn: []
    - concern: domain
      ownerRef: context.subscription
      operationRef: request.payment
      fileName: 订阅合同与付款状态领域行为.md
      unitKeys:
        - root-collection::context.subscription::contract.subscription
        - context-design::fulfillment.payment
        - evidence::contract.subscription
        - evidence::request.payment
        - actor-role::role.publisher
        - proof-role::role.payment-proof
        - association::relation.contract-payment
        - association::relation.subscription-column
        - association::relation.payment-column
        - association::relation.payment-proof-used
        - rule::rule.payment-start
        - rule::rule.payment-amount
        - rule::rule.payment-deadline
        - rule::rule.payment-completed
        - design::design.subscription-domain-contracts
      dependsOn:
        - foundation::context.subscription::role.reader
    - concern: domain
      ownerRef: context.mobile
      operationRef: request.mobile
      fileName: 移动扣款与付款证明领域契约.md
      unitKeys:
        - context-design::context.mobile
        - context-design::fulfillment.mobile
        - root-collection::context.mobile::contract.mobile
        - evidence::contract.mobile
        - evidence::request.mobile
        - evidence::confirmation.mobile
        - actor-role::role.mobile-user
        - actor-role::role.mobile-provider
        - association::relation.user-as-mobile-user
        - association::relation.contract-mobile
        - association::relation.mobile-column
        - association::relation.mobile-result
        - association::relation.mobile-as-payment-proof
        - rule::rule.mobile-completed
        - design::design.mobile-domain-contracts
      dependsOn:
        - domain::context.subscription::request.payment
    - concern: mybatis
      ownerRef: context.subscription
      operationRef: design.subscription-payment-storage
      fileName: 订阅与移动支付MyBatis持久化.md
      unitKeys:
        - design::design.subscription-payment-storage
      dependsOn:
        - domain::context.subscription::request.payment
        - domain::context.mobile::request.mobile
    - concern: integration
      ownerRef: context.mobile
      operationRef: design.local-mobile-payment-adapter
      fileName: 本地移动支付端口模拟器.md
      unitKeys:
        - design::design.local-mobile-payment-adapter
      dependsOn:
        - domain::context.mobile::request.mobile
    - concern: api
      ownerRef: context.subscription
      operationRef: capability.register-subscription-reader
      fileName: 订阅合同与付款查询HTTP接口.md
      unitKeys:
        - api-resource::resource.party-user
        - api-resource::resource.subscription
        - api-resource::resource.party-subscriptions
        - api-resource::resource.payment
        - api-capability::capability.register-subscription-reader
        - api-capability::capability.list-subscriptions-reader
        - api-capability::capability.read-subscription-reader
        - api-capability::capability.read-payment-reader
        - design::design.subscription-http-contract
      dependsOn:
        - foundation::context.subscription::role.reader
        - domain::context.subscription::request.payment
    - concern: integration
      ownerRef: context.subscription
      operationRef: design.subscription-payment-orchestration
      fileName: 订阅支付应用装配与模块协作.md
      unitKeys:
        - design::design.subscription-payment-orchestration
      dependsOn:
        - mybatis::context.subscription::design.subscription-payment-storage
        - integration::context.mobile::design.local-mobile-payment-adapter
        - api::context.subscription::capability.register-subscription-reader
    - concern: acceptance
      ownerRef: scenario.mobile-subscription
      operationRef: design.mobile-subscription-journey
      fileName: 移动支付订阅主链验收.md
      unitKeys:
        - scenario::scenario.mobile-subscription
        - scenario::scenario.payment-pending
        - scenario::scenario.cutoff-paid
        - design::design.mobile-subscription-journey
      dependsOn:
        - integration::context.subscription::design.subscription-payment-orchestration
  dispositions:
    - unitKey: actor-role::role.account-provider
      kind: &out-of-scope-kind not-applicable
      sourceRefs: [role.account-provider]
      reason: &out-of-scope-reason 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。
    - { unitKey: actor-role::role.account-user, kind: *out-of-scope-kind, sourceRefs: [role.account-user], reason: *out-of-scope-reason }
    - { unitKey: association::relation.access-chapter, kind: *out-of-scope-kind, sourceRefs: [relation.access-chapter], reason: *out-of-scope-reason }
    - { unitKey: association::relation.access-column, kind: *out-of-scope-kind, sourceRefs: [relation.access-column], reason: *out-of-scope-reason }
    - { unitKey: association::relation.access-payment-used, kind: *out-of-scope-kind, sourceRefs: [relation.access-payment-used], reason: *out-of-scope-reason }
    - { unitKey: association::relation.access-refund-used, kind: *out-of-scope-kind, sourceRefs: [relation.access-refund-used], reason: *out-of-scope-reason }
    - { unitKey: association::relation.access-restored-used, kind: *out-of-scope-kind, sourceRefs: [relation.access-restored-used], reason: *out-of-scope-reason }
    - { unitKey: association::relation.access-result, kind: *out-of-scope-kind, sourceRefs: [relation.access-result], reason: *out-of-scope-reason }
    - { unitKey: association::relation.contract-access, kind: *out-of-scope-kind, sourceRefs: [relation.contract-access], reason: *out-of-scope-reason }
    - { unitKey: association::relation.contract-prepaid, kind: *out-of-scope-kind, sourceRefs: [relation.contract-prepaid], reason: *out-of-scope-reason }
    - { unitKey: association::relation.contract-refund, kind: *out-of-scope-kind, sourceRefs: [relation.contract-refund], reason: *out-of-scope-reason }
    - { unitKey: association::relation.contract-restore, kind: *out-of-scope-kind, sourceRefs: [relation.contract-restore], reason: *out-of-scope-reason }
    - { unitKey: association::relation.mobile-as-access-payment, kind: *out-of-scope-kind, sourceRefs: [relation.mobile-as-access-payment], reason: *out-of-scope-reason }
    - { unitKey: association::relation.mobile-as-refund-payment, kind: *out-of-scope-kind, sourceRefs: [relation.mobile-as-refund-payment], reason: *out-of-scope-reason }
    - { unitKey: association::relation.prepaid-as-access-payment, kind: *out-of-scope-kind, sourceRefs: [relation.prepaid-as-access-payment], reason: *out-of-scope-reason }
    - { unitKey: association::relation.prepaid-as-payment-proof, kind: *out-of-scope-kind, sourceRefs: [relation.prepaid-as-payment-proof], reason: *out-of-scope-reason }
    - { unitKey: association::relation.prepaid-as-refund-payment, kind: *out-of-scope-kind, sourceRefs: [relation.prepaid-as-refund-payment], reason: *out-of-scope-reason }
    - { unitKey: association::relation.prepaid-column, kind: *out-of-scope-kind, sourceRefs: [relation.prepaid-column], reason: *out-of-scope-reason }
    - { unitKey: association::relation.prepaid-result, kind: *out-of-scope-kind, sourceRefs: [relation.prepaid-result], reason: *out-of-scope-reason }
    - { unitKey: association::relation.refund-as-access-refund, kind: *out-of-scope-kind, sourceRefs: [relation.refund-as-access-refund], reason: *out-of-scope-reason }
    - { unitKey: association::relation.refund-as-restore-refund, kind: *out-of-scope-kind, sourceRefs: [relation.refund-as-restore-refund], reason: *out-of-scope-reason }
    - { unitKey: association::relation.refund-basis, kind: *out-of-scope-kind, sourceRefs: [relation.refund-basis], reason: *out-of-scope-reason }
    - { unitKey: association::relation.refund-basis-first, kind: *out-of-scope-kind, sourceRefs: [relation.refund-basis-first], reason: *out-of-scope-reason }
    - { unitKey: association::relation.refund-column, kind: *out-of-scope-kind, sourceRefs: [relation.refund-column], reason: *out-of-scope-reason }
    - { unitKey: association::relation.refund-payment-used, kind: *out-of-scope-kind, sourceRefs: [relation.refund-payment-used], reason: *out-of-scope-reason }
    - { unitKey: association::relation.refund-result, kind: *out-of-scope-kind, sourceRefs: [relation.refund-result], reason: *out-of-scope-reason }
    - { unitKey: association::relation.restore-as-access-restored, kind: *out-of-scope-kind, sourceRefs: [relation.restore-as-access-restored], reason: *out-of-scope-reason }
    - { unitKey: association::relation.restore-basis, kind: *out-of-scope-kind, sourceRefs: [relation.restore-basis], reason: *out-of-scope-reason }
    - { unitKey: association::relation.restore-basis-first, kind: *out-of-scope-kind, sourceRefs: [relation.restore-basis-first], reason: *out-of-scope-reason }
    - { unitKey: association::relation.restore-column, kind: *out-of-scope-kind, sourceRefs: [relation.restore-column], reason: *out-of-scope-reason }
    - { unitKey: association::relation.restore-refund-used, kind: *out-of-scope-kind, sourceRefs: [relation.restore-refund-used], reason: *out-of-scope-reason }
    - { unitKey: association::relation.restore-result, kind: *out-of-scope-kind, sourceRefs: [relation.restore-result], reason: *out-of-scope-reason }
    - { unitKey: association::relation.user-as-account-user, kind: *out-of-scope-kind, sourceRefs: [relation.user-as-account-user], reason: *out-of-scope-reason }
    - { unitKey: context-design::context.content, kind: *out-of-scope-kind, sourceRefs: [context.content], reason: *out-of-scope-reason }
    - { unitKey: context-design::context.prepaid, kind: *out-of-scope-kind, sourceRefs: [context.prepaid], reason: *out-of-scope-reason }
    - { unitKey: context-design::fulfillment.access, kind: *out-of-scope-kind, sourceRefs: [fulfillment.access], reason: *out-of-scope-reason }
    - { unitKey: context-design::fulfillment.prepaid, kind: *out-of-scope-kind, sourceRefs: [fulfillment.prepaid], reason: *out-of-scope-reason }
    - { unitKey: context-design::fulfillment.refund, kind: *out-of-scope-kind, sourceRefs: [fulfillment.refund], reason: *out-of-scope-reason }
    - { unitKey: context-design::fulfillment.restore, kind: *out-of-scope-kind, sourceRefs: [fulfillment.restore], reason: *out-of-scope-reason }
    - { unitKey: entity::thing.chapter, kind: *out-of-scope-kind, sourceRefs: [thing.chapter], reason: *out-of-scope-reason }
    - { unitKey: entity::thing.column, kind: *out-of-scope-kind, sourceRefs: [thing.column], reason: *out-of-scope-reason }
    - { unitKey: evidence::confirmation.access, kind: *out-of-scope-kind, sourceRefs: [confirmation.access], reason: *out-of-scope-reason }
    - { unitKey: evidence::confirmation.prepaid, kind: *out-of-scope-kind, sourceRefs: [confirmation.prepaid], reason: *out-of-scope-reason }
    - { unitKey: evidence::confirmation.refund, kind: *out-of-scope-kind, sourceRefs: [confirmation.refund], reason: *out-of-scope-reason }
    - { unitKey: evidence::confirmation.restore, kind: *out-of-scope-kind, sourceRefs: [confirmation.restore], reason: *out-of-scope-reason }
    - { unitKey: evidence::contract.prepaid, kind: *out-of-scope-kind, sourceRefs: [contract.prepaid], reason: *out-of-scope-reason }
    - { unitKey: evidence::evidence.discontinuation, kind: *out-of-scope-kind, sourceRefs: [evidence.discontinuation], reason: *out-of-scope-reason }
    - { unitKey: evidence::evidence.relaunch, kind: *out-of-scope-kind, sourceRefs: [evidence.relaunch], reason: *out-of-scope-reason }
    - { unitKey: evidence::request.access, kind: *out-of-scope-kind, sourceRefs: [request.access], reason: *out-of-scope-reason }
    - { unitKey: evidence::request.prepaid, kind: *out-of-scope-kind, sourceRefs: [request.prepaid], reason: *out-of-scope-reason }
    - { unitKey: evidence::request.refund, kind: *out-of-scope-kind, sourceRefs: [request.refund], reason: *out-of-scope-reason }
    - { unitKey: evidence::request.restore, kind: *out-of-scope-kind, sourceRefs: [request.restore], reason: *out-of-scope-reason }
    - { unitKey: proof-role::role.access-payment, kind: *out-of-scope-kind, sourceRefs: [role.access-payment], reason: *out-of-scope-reason }
    - { unitKey: proof-role::role.access-refund, kind: *out-of-scope-kind, sourceRefs: [role.access-refund], reason: *out-of-scope-reason }
    - { unitKey: proof-role::role.access-restored, kind: *out-of-scope-kind, sourceRefs: [role.access-restored], reason: *out-of-scope-reason }
    - { unitKey: proof-role::role.refund-payment, kind: *out-of-scope-kind, sourceRefs: [role.refund-payment], reason: *out-of-scope-reason }
    - { unitKey: proof-role::role.restore-refund, kind: *out-of-scope-kind, sourceRefs: [role.restore-refund], reason: *out-of-scope-reason }
    - { unitKey: root-collection::context.content::thing.chapter, kind: *out-of-scope-kind, sourceRefs: [context.content], reason: *out-of-scope-reason }
    - { unitKey: root-collection::context.content::thing.column, kind: *out-of-scope-kind, sourceRefs: [context.content], reason: *out-of-scope-reason }
    - { unitKey: root-collection::context.prepaid::contract.prepaid, kind: *out-of-scope-kind, sourceRefs: [context.prepaid], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.access-completed, kind: *out-of-scope-kind, sourceRefs: [rule.access-completed], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.access-deadline, kind: *out-of-scope-kind, sourceRefs: [rule.access-deadline], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.access-eligible, kind: *out-of-scope-kind, sourceRefs: [rule.access-eligible], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.access-expired, kind: *out-of-scope-kind, sourceRefs: [rule.access-expired], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.content-readable, kind: *out-of-scope-kind, sourceRefs: [rule.content-readable], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.mobile-expired, kind: *out-of-scope-kind, sourceRefs: [rule.mobile-expired], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.payment-expired, kind: *out-of-scope-kind, sourceRefs: [rule.payment-expired], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.prepaid-balance, kind: *out-of-scope-kind, sourceRefs: [rule.prepaid-balance], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.prepaid-completed, kind: *out-of-scope-kind, sourceRefs: [rule.prepaid-completed], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.prepaid-expired, kind: *out-of-scope-kind, sourceRefs: [rule.prepaid-expired], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.prepaid-funded, kind: *out-of-scope-kind, sourceRefs: [rule.prepaid-funded], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.refund-amount, kind: *out-of-scope-kind, sourceRefs: [rule.refund-amount], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.refund-completed, kind: *out-of-scope-kind, sourceRefs: [rule.refund-completed], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.refund-deadline, kind: *out-of-scope-kind, sourceRefs: [rule.refund-deadline], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.refund-eligible, kind: *out-of-scope-kind, sourceRefs: [rule.refund-eligible], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.refund-expired, kind: *out-of-scope-kind, sourceRefs: [rule.refund-expired], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.restore-completed, kind: *out-of-scope-kind, sourceRefs: [rule.restore-completed], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.restore-deadline, kind: *out-of-scope-kind, sourceRefs: [rule.restore-deadline], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.restore-eligible, kind: *out-of-scope-kind, sourceRefs: [rule.restore-eligible], reason: *out-of-scope-reason }
    - { unitKey: rule::rule.restore-expired, kind: *out-of-scope-kind, sourceRefs: [rule.restore-expired], reason: *out-of-scope-reason }
    - { unitKey: scenario::scenario.access-after-refund, kind: *out-of-scope-kind, sourceRefs: [scenario.access-after-refund], reason: *out-of-scope-reason }
    - { unitKey: scenario::scenario.access-expired, kind: *out-of-scope-kind, sourceRefs: [scenario.access-expired], reason: *out-of-scope-reason }
    - { unitKey: scenario::scenario.cutoff-pending, kind: *out-of-scope-kind, sourceRefs: [scenario.cutoff-pending], reason: *out-of-scope-reason }
    - { unitKey: scenario::scenario.discontinuation-refund, kind: *out-of-scope-kind, sourceRefs: [scenario.discontinuation-refund], reason: *out-of-scope-reason }
    - { unitKey: scenario::scenario.free-restoration, kind: *out-of-scope-kind, sourceRefs: [scenario.free-restoration], reason: *out-of-scope-reason }
    - { unitKey: scenario::scenario.insufficient-balance, kind: *out-of-scope-kind, sourceRefs: [scenario.insufficient-balance], reason: *out-of-scope-reason }
    - { unitKey: scenario::scenario.late-paid, kind: *out-of-scope-kind, sourceRefs: [scenario.late-paid], reason: *out-of-scope-reason }
    - { unitKey: scenario::scenario.payment-expired, kind: *out-of-scope-kind, sourceRefs: [scenario.payment-expired], reason: *out-of-scope-reason }
    - { unitKey: scenario::scenario.prepaid-subscription, kind: *out-of-scope-kind, sourceRefs: [scenario.prepaid-subscription], reason: *out-of-scope-reason }
    - { unitKey: scenario::scenario.refund-expired, kind: *out-of-scope-kind, sourceRefs: [scenario.refund-expired], reason: *out-of-scope-reason }
    - { unitKey: scenario::scenario.refund-late, kind: *out-of-scope-kind, sourceRefs: [scenario.refund-late], reason: *out-of-scope-reason }
    - { unitKey: scenario::scenario.restore-charged, kind: *out-of-scope-kind, sourceRefs: [scenario.restore-charged], reason: *out-of-scope-reason }
    - { unitKey: scenario::scenario.restore-expired, kind: *out-of-scope-kind, sourceRefs: [scenario.restore-expired], reason: *out-of-scope-reason }
    - { unitKey: scenario::scenario.short-paid, kind: *out-of-scope-kind, sourceRefs: [scenario.short-paid], reason: *out-of-scope-reason }
    - { unitKey: scenario::scenario.wrong-reader, kind: *out-of-scope-kind, sourceRefs: [scenario.wrong-reader], reason: *out-of-scope-reason }
compiled: { apiCoverage: [{ apiRef: capability.list-subscriptions-reader, deliveryTaskRef: 'api::context.subscription::capability.register-subscription-reader', supportingTaskRefs: ['domain::context.subscription::request.payment', 'foundation::context.subscription::role.reader'] }, { apiRef: capability.read-payment-reader, deliveryTaskRef: 'api::context.subscription::capability.register-subscription-reader', supportingTaskRefs: ['domain::context.subscription::request.payment', 'foundation::context.subscription::role.reader'] }, { apiRef: capability.read-subscription-reader, deliveryTaskRef: 'api::context.subscription::capability.register-subscription-reader', supportingTaskRefs: ['domain::context.subscription::request.payment', 'foundation::context.subscription::role.reader'] }, { apiRef: capability.register-subscription-reader, deliveryTaskRef: 'api::context.subscription::capability.register-subscription-reader', supportingTaskRefs: ['domain::context.subscription::request.payment', 'foundation::context.subscription::role.reader'] }], coverageComplete: true, diagnostics: [], dispositions: [{ kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [role.account-provider], unitKey: 'actor-role::role.account-provider' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [role.account-user], unitKey: 'actor-role::role.account-user' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.access-chapter], unitKey: 'association::relation.access-chapter' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.access-column], unitKey: 'association::relation.access-column' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.access-payment-used], unitKey: 'association::relation.access-payment-used' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.access-refund-used], unitKey: 'association::relation.access-refund-used' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.access-restored-used], unitKey: 'association::relation.access-restored-used' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.access-result], unitKey: 'association::relation.access-result' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.contract-access], unitKey: 'association::relation.contract-access' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.contract-prepaid], unitKey: 'association::relation.contract-prepaid' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.contract-refund], unitKey: 'association::relation.contract-refund' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.contract-restore], unitKey: 'association::relation.contract-restore' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.mobile-as-access-payment], unitKey: 'association::relation.mobile-as-access-payment' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.mobile-as-refund-payment], unitKey: 'association::relation.mobile-as-refund-payment' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.prepaid-as-access-payment], unitKey: 'association::relation.prepaid-as-access-payment' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.prepaid-as-payment-proof], unitKey: 'association::relation.prepaid-as-payment-proof' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.prepaid-as-refund-payment], unitKey: 'association::relation.prepaid-as-refund-payment' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.prepaid-column], unitKey: 'association::relation.prepaid-column' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.prepaid-result], unitKey: 'association::relation.prepaid-result' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.refund-as-access-refund], unitKey: 'association::relation.refund-as-access-refund' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.refund-as-restore-refund], unitKey: 'association::relation.refund-as-restore-refund' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.refund-basis], unitKey: 'association::relation.refund-basis' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.refund-basis-first], unitKey: 'association::relation.refund-basis-first' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.refund-column], unitKey: 'association::relation.refund-column' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.refund-payment-used], unitKey: 'association::relation.refund-payment-used' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.refund-result], unitKey: 'association::relation.refund-result' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.restore-as-access-restored], unitKey: 'association::relation.restore-as-access-restored' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.restore-basis], unitKey: 'association::relation.restore-basis' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.restore-basis-first], unitKey: 'association::relation.restore-basis-first' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.restore-column], unitKey: 'association::relation.restore-column' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.restore-refund-used], unitKey: 'association::relation.restore-refund-used' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.restore-result], unitKey: 'association::relation.restore-result' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [relation.user-as-account-user], unitKey: 'association::relation.user-as-account-user' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [context.content], unitKey: 'context-design::context.content' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [context.prepaid], unitKey: 'context-design::context.prepaid' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [fulfillment.access], unitKey: 'context-design::fulfillment.access' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [fulfillment.prepaid], unitKey: 'context-design::fulfillment.prepaid' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [fulfillment.refund], unitKey: 'context-design::fulfillment.refund' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [fulfillment.restore], unitKey: 'context-design::fulfillment.restore' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [thing.chapter], unitKey: 'entity::thing.chapter' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [thing.column], unitKey: 'entity::thing.column' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [confirmation.access], unitKey: 'evidence::confirmation.access' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [confirmation.prepaid], unitKey: 'evidence::confirmation.prepaid' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [confirmation.refund], unitKey: 'evidence::confirmation.refund' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [confirmation.restore], unitKey: 'evidence::confirmation.restore' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [contract.prepaid], unitKey: 'evidence::contract.prepaid' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [evidence.discontinuation], unitKey: 'evidence::evidence.discontinuation' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [evidence.relaunch], unitKey: 'evidence::evidence.relaunch' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [request.access], unitKey: 'evidence::request.access' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [request.prepaid], unitKey: 'evidence::request.prepaid' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [request.refund], unitKey: 'evidence::request.refund' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [request.restore], unitKey: 'evidence::request.restore' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [role.access-payment], unitKey: 'proof-role::role.access-payment' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [role.access-refund], unitKey: 'proof-role::role.access-refund' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [role.access-restored], unitKey: 'proof-role::role.access-restored' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [role.refund-payment], unitKey: 'proof-role::role.refund-payment' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [role.restore-refund], unitKey: 'proof-role::role.restore-refund' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [context.content], unitKey: 'root-collection::context.content::thing.chapter' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [context.content], unitKey: 'root-collection::context.content::thing.column' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [context.prepaid], unitKey: 'root-collection::context.prepaid::contract.prepaid' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.access-completed], unitKey: 'rule::rule.access-completed' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.access-deadline], unitKey: 'rule::rule.access-deadline' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.access-eligible], unitKey: 'rule::rule.access-eligible' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.access-expired], unitKey: 'rule::rule.access-expired' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.content-readable], unitKey: 'rule::rule.content-readable' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.mobile-expired], unitKey: 'rule::rule.mobile-expired' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.payment-expired], unitKey: 'rule::rule.payment-expired' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.prepaid-balance], unitKey: 'rule::rule.prepaid-balance' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.prepaid-completed], unitKey: 'rule::rule.prepaid-completed' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.prepaid-expired], unitKey: 'rule::rule.prepaid-expired' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.prepaid-funded], unitKey: 'rule::rule.prepaid-funded' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.refund-amount], unitKey: 'rule::rule.refund-amount' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.refund-completed], unitKey: 'rule::rule.refund-completed' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.refund-deadline], unitKey: 'rule::rule.refund-deadline' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.refund-eligible], unitKey: 'rule::rule.refund-eligible' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.refund-expired], unitKey: 'rule::rule.refund-expired' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.restore-completed], unitKey: 'rule::rule.restore-completed' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.restore-deadline], unitKey: 'rule::rule.restore-deadline' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.restore-eligible], unitKey: 'rule::rule.restore-eligible' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [rule.restore-expired], unitKey: 'rule::rule.restore-expired' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [scenario.access-after-refund], unitKey: 'scenario::scenario.access-after-refund' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [scenario.access-expired], unitKey: 'scenario::scenario.access-expired' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [scenario.cutoff-pending], unitKey: 'scenario::scenario.cutoff-pending' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [scenario.discontinuation-refund], unitKey: 'scenario::scenario.discontinuation-refund' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [scenario.free-restoration], unitKey: 'scenario::scenario.free-restoration' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [scenario.insufficient-balance], unitKey: 'scenario::scenario.insufficient-balance' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [scenario.late-paid], unitKey: 'scenario::scenario.late-paid' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [scenario.payment-expired], unitKey: 'scenario::scenario.payment-expired' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [scenario.prepaid-subscription], unitKey: 'scenario::scenario.prepaid-subscription' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [scenario.refund-expired], unitKey: 'scenario::scenario.refund-expired' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [scenario.refund-late], unitKey: 'scenario::scenario.refund-late' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [scenario.restore-charged], unitKey: 'scenario::scenario.restore-charged' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [scenario.restore-expired], unitKey: 'scenario::scenario.restore-expired' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [scenario.short-paid], unitKey: 'scenario::scenario.short-paid' }, { kind: not-applicable, reason: 当前正式 API 规划输入只授权 US-001 至 US-003 的移动支付订阅主链；此单元属于内容访问、退款、恢复、预付费、异常履约或未选验收场景，不进入本计划。, sourceRefs: [scenario.wrong-reader], unitKey: 'scenario::scenario.wrong-reader' }], executionOrder: ['foundation::context.subscription::role.reader', 'domain::context.subscription::request.payment', 'domain::context.mobile::request.mobile', 'mybatis::context.subscription::design.subscription-payment-storage', 'integration::context.mobile::design.local-mobile-payment-adapter', 'api::context.subscription::capability.register-subscription-reader', 'integration::context.subscription::design.subscription-payment-orchestration', 'acceptance::scenario.mobile-subscription::design.mobile-subscription-journey'], inputDigest: 182f29a8eb4fbe3dfa7a44b895ebd509a56e22b8979ac282f1adeba9263f09e9, modelId: column-subscription, policyVersion: sd-modular-monolith-mybatis-1, profile: { architecture: modular-monolith, codeOrganization: composition-root-and-libraries, databaseEngine: null, deploymentUnit: single-backend-application, http: jersey-hal-forms, moduleInteraction: in-process-contracts, mybatisMapping: xml-domain-resultmap, persistence: mybatis, resourceNavigation: jersey-subresources, springBoot: 3.5.x }, tasks: [{ apiRefs: [], concern: acceptance, dependsOn: ['integration::context.subscription::design.subscription-payment-orchestration'], fileName: 移动支付订阅主链验收.md, operationRef: design.mobile-subscription-journey, ownerRef: scenario.mobile-subscription, path: tasks/移动支付订阅主链验收.md, taskKey: 'acceptance::scenario.mobile-subscription::design.mobile-subscription-journey', unitKeys: ['design::design.mobile-subscription-journey', 'scenario::scenario.cutoff-paid', 'scenario::scenario.mobile-subscription', 'scenario::scenario.payment-pending'] }, { apiRefs: [capability.list-subscriptions-reader, capability.read-payment-reader, capability.read-subscription-reader, capability.register-subscription-reader], concern: api, dependsOn: ['domain::context.subscription::request.payment', 'foundation::context.subscription::role.reader'], fileName: 订阅合同与付款查询HTTP接口.md, operationRef: capability.register-subscription-reader, ownerRef: context.subscription, path: tasks/订阅合同与付款查询HTTP接口.md, taskKey: 'api::context.subscription::capability.register-subscription-reader', unitKeys: ['api-capability::capability.list-subscriptions-reader', 'api-capability::capability.read-payment-reader', 'api-capability::capability.read-subscription-reader', 'api-capability::capability.register-subscription-reader', 'api-resource::resource.party-subscriptions', 'api-resource::resource.party-user', 'api-resource::resource.payment', 'api-resource::resource.subscription', 'design::design.subscription-http-contract'] }, { apiRefs: [], concern: domain, dependsOn: ['domain::context.subscription::request.payment'], fileName: 移动扣款与付款证明领域契约.md, operationRef: request.mobile, ownerRef: context.mobile, path: tasks/移动扣款与付款证明领域契约.md, taskKey: 'domain::context.mobile::request.mobile', unitKeys: ['actor-role::role.mobile-provider', 'actor-role::role.mobile-user', 'association::relation.contract-mobile', 'association::relation.mobile-as-payment-proof', 'association::relation.mobile-column', 'association::relation.mobile-result', 'association::relation.user-as-mobile-user', 'context-design::context.mobile', 'context-design::fulfillment.mobile', 'design::design.mobile-domain-contracts', 'evidence::confirmation.mobile', 'evidence::contract.mobile', 'evidence::request.mobile', 'root-collection::context.mobile::contract.mobile', 'rule::rule.mobile-completed'] }, { apiRefs: [capability.list-subscriptions-reader, capability.read-payment-reader, capability.read-subscription-reader, capability.register-subscription-reader], concern: domain, dependsOn: ['foundation::context.subscription::role.reader'], fileName: 订阅合同与付款状态领域行为.md, operationRef: request.payment, ownerRef: context.subscription, path: tasks/订阅合同与付款状态领域行为.md, taskKey: 'domain::context.subscription::request.payment', unitKeys: ['actor-role::role.publisher', 'association::relation.contract-payment', 'association::relation.payment-column', 'association::relation.payment-proof-used', 'association::relation.subscription-column', 'context-design::fulfillment.payment', 'design::design.subscription-domain-contracts', 'evidence::contract.subscription', 'evidence::request.payment', 'proof-role::role.payment-proof', 'root-collection::context.subscription::contract.subscription', 'rule::rule.payment-amount', 'rule::rule.payment-completed', 'rule::rule.payment-deadline', 'rule::rule.payment-start'] }, { apiRefs: [capability.list-subscriptions-reader, capability.read-payment-reader, capability.read-subscription-reader, capability.register-subscription-reader], concern: foundation, dependsOn: [], fileName: 后端平台与Reader上下文基础复验.md, operationRef: role.reader, ownerRef: context.subscription, path: tasks/后端平台与Reader上下文基础复验.md, taskKey: 'foundation::context.subscription::role.reader', unitKeys: ['actor-role::role.reader', 'association::relation.user-as-reader', 'context-design::context.subscription', 'design::design.reader-context-foundation', 'entity::party.user', 'platform::profile.backend-modules', 'platform::profile.jersey', 'platform::profile.modular-monolith', 'platform::profile.mybatis', 'platform::profile.smart-domain'] }, { apiRefs: [], concern: integration, dependsOn: ['domain::context.mobile::request.mobile'], fileName: 本地移动支付端口模拟器.md, operationRef: design.local-mobile-payment-adapter, ownerRef: context.mobile, path: tasks/本地移动支付端口模拟器.md, taskKey: 'integration::context.mobile::design.local-mobile-payment-adapter', unitKeys: ['design::design.local-mobile-payment-adapter'] }, { apiRefs: [], concern: integration, dependsOn: ['api::context.subscription::capability.register-subscription-reader', 'integration::context.mobile::design.local-mobile-payment-adapter', 'mybatis::context.subscription::design.subscription-payment-storage'], fileName: 订阅支付应用装配与模块协作.md, operationRef: design.subscription-payment-orchestration, ownerRef: context.subscription, path: tasks/订阅支付应用装配与模块协作.md, taskKey: 'integration::context.subscription::design.subscription-payment-orchestration', unitKeys: ['design::design.subscription-payment-orchestration'] }, { apiRefs: [], concern: mybatis, dependsOn: ['domain::context.mobile::request.mobile', 'domain::context.subscription::request.payment'], fileName: 订阅与移动支付MyBatis持久化.md, operationRef: design.subscription-payment-storage, ownerRef: context.subscription, path: tasks/订阅与移动支付MyBatis持久化.md, taskKey: 'mybatis::context.subscription::design.subscription-payment-storage', unitKeys: ['design::design.subscription-payment-storage'] }], unassignedUnitKeys: [] }
taskNotes:
  - taskRef: foundation::context.subscription::role.reader
    mode: implementation
    status: done
    sourceRefs: [context.subscription, role.reader, design.reader-context-foundation]
    sliceRefs: [US-001]
    outcome: 复验平台、技术分层和现有 Reader Context，形成后续任务可复用的当前证据。
    gapRefs: []
  - taskRef: domain::context.subscription::request.payment
    mode: implementation
    status: done
    sourceRefs: [contract.subscription, request.payment, rule.payment-completed, design.subscription-domain-contracts]
    sliceRefs: [US-001, US-002, US-003, scenario.payment-pending, scenario.cutoff-paid]
    outcome: 交付包含 11 个必填字段且不可改写的合同、付款请求派生、PaymentProof 契约和 pending/completed 领域判断。
    gapRefs: []
  - taskRef: domain::context.mobile::request.mobile
    mode: implementation
    status: planned
    sourceRefs: [contract.mobile, request.mobile, confirmation.mobile, rule.mobile-completed, design.mobile-domain-contracts]
    sliceRefs: [US-002, scenario.mobile-subscription, scenario.cutoff-paid]
    outcome: 交付使用 local/test 固定协议、标识和业务时间的移动扣款请求/机构结果及 PaymentProof 适配契约。
    gapRefs: []
  - taskRef: mybatis::context.subscription::design.subscription-payment-storage
    mode: implementation
    status: planned
    sourceRefs: [contract.subscription, request.payment, request.mobile, confirmation.mobile, design.subscription-payment-storage]
    sliceRefs: [US-001, US-002, US-003]
    outcome: 交付 H2/MyBatis/Flyway 往返、幂等、唯一结果和本地事务回滚。
    gapRefs: []
  - taskRef: integration::context.mobile::design.local-mobile-payment-adapter
    mode: implementation
    status: planned
    sourceRefs: [request.mobile, confirmation.mobile, design.local-mobile-payment-adapter]
    sliceRefs: [US-002, scenario.mobile-subscription]
    outcome: 交付仅 local/test 注册且使用固定场景夹具的确定性支付端口 Stub。
    gapRefs: []
  - taskRef: api::context.subscription::capability.register-subscription-reader
    mode: implementation
    status: planned
    sourceRefs: [capability.register-subscription-reader, capability.list-subscriptions-reader, capability.read-subscription-reader, capability.read-payment-reader, design.subscription-http-contract]
    sliceRefs: [US-001, US-003]
    outcome: 交付 11 字段合同登记/读取/列表和付款状态读取的独立 HTTP 契约。
    gapRefs: []
  - taskRef: integration::context.subscription::design.subscription-payment-orchestration
    mode: implementation
    status: planned
    sourceRefs: [contract.subscription, request.payment, request.mobile, confirmation.mobile, design.subscription-payment-orchestration]
    sliceRefs: [US-001, US-002, US-003, scenario.mobile-subscription]
    outcome: 交付合同登记成功后自动触发付款的真实适配器装配、模块协作和分段事务证据。
    gapRefs: []
  - taskRef: acceptance::scenario.mobile-subscription::design.mobile-subscription-journey
    mode: implementation
    status: planned
    sourceRefs: [scenario.mobile-subscription, scenario.payment-pending, scenario.cutoff-paid, design.mobile-subscription-journey]
    sliceRefs: [US-001, US-002, US-003]
    outcome: 以真实 HTTP、SQL 和 local/test 固定支付 Stub 消费当前 API 合成测试向量，验收自动触发、completed、pending、截止和 404。
    gapRefs: []
gaps:
  - id: GAP-IDENTITY
    sourceRefs: [QA-IDENTITY, role.reader, binding.caller-subscription-reader]
    statement: 可信身份、主体映射、代表权限和实例归属尚未决定。
    affectedTaskRefs: [api::context.subscription::capability.register-subscription-reader, acceptance::scenario.mobile-subscription::design.mobile-subscription-journey]
    impact: 不阻塞纯领域及隔离 local/test 主链，但阻塞 403、他人实例拒绝和生产受保护接口验收。
    nextAction: 另行确认身份专题方案；本计划不得复制 JWT/OIDC/RBAC 默认实现。
  - id: GAP-DATABASE
    sourceRefs: [QA-DATABASE, design.subscription-payment-storage]
    statement: 生产数据库引擎、版本、隔离级别和并发策略未确定。
    affectedTaskRefs: [mybatis::context.subscription::design.subscription-payment-storage, acceptance::scenario.mobile-subscription::design.mobile-subscription-journey]
    impact: 不阻塞 H2 local/test SQL 与回滚，但阻塞生产方言、隔离和并发保证。
    nextAction: 生产化前形成数据库专题依据并增加对应验证。
```

## 4. 可读任务导航

| 执行顺序 | 任务文件                                                                    | taskKey                                                                        | 模式/状态                | 直接前置                      |
| -------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------ | ----------------------------- |
| 1        | [后端平台与 Reader 上下文基础复验](tasks/后端平台与Reader上下文基础复验.md) | `foundation::context.subscription::role.reader`                                | implementation / done    | 无                            |
| 2        | [订阅合同与付款状态领域行为](tasks/订阅合同与付款状态领域行为.md)           | `domain::context.subscription::request.payment`                                | implementation / done    | Reader 基础复验               |
| 3        | [移动扣款与付款证明领域契约](tasks/移动扣款与付款证明领域契约.md)           | `domain::context.mobile::request.mobile`                                       | implementation / planned | 订阅领域行为                  |
| 4        | [订阅与移动支付 MyBatis 持久化](tasks/订阅与移动支付MyBatis持久化.md)       | `mybatis::context.subscription::design.subscription-payment-storage`           | implementation / planned | 两个领域任务                  |
| 5        | [本地移动支付端口模拟器](tasks/本地移动支付端口模拟器.md)                   | `integration::context.mobile::design.local-mobile-payment-adapter`             | implementation / planned | 移动支付领域契约              |
| 6        | [订阅合同与付款查询 HTTP 接口](tasks/订阅合同与付款查询HTTP接口.md)         | `api::context.subscription::capability.register-subscription-reader`           | implementation / planned | Reader 基础、订阅领域行为     |
| 7        | [订阅支付应用装配与模块协作](tasks/订阅支付应用装配与模块协作.md)           | `integration::context.subscription::design.subscription-payment-orchestration` | implementation / planned | MyBatis、支付 Stub、HTTP 接口 |
| 8        | [移动支付订阅主链验收](tasks/移动支付订阅主链验收.md)                       | `acceptance::scenario.mobile-subscription::design.mobile-subscription-journey` | implementation / planned | 应用装配                      |

- 首个可验收结果：`scenario.mobile-subscription`、`scenario.payment-pending`、`scenario.cutoff-paid` 汇合到任务 8。
- 最小共享基础：任务 1 只复验现有平台和 Reader Context，不重建用户资料。
- 可并行工作：任务 3 完成后，MyBatis 与本地支付 Stub 可并行；订阅 HTTP 在任务 2 完成后可与它们并行。
- 局部限制：可信身份和生产数据库仍未决定，但不阻塞隔离的 local/test 主链。计划没有全局结构缺口。

## 5. 前馈与交接检查

- 项目宪法、业务/API 来源、架构、工序、测试指南和任务 Guides 均须在执行时重新核对；结构编译不表示业务批准或实现完成。
- 每个工作单元只有一个拥有任务；领域规则不在 Resource、Mapper 或组合根重复实现。
- API 独立 HTTP 测试与 app 真实 HTTP + SQL 验收分别规划；Fake/H2 结果不冒充生产身份、支付协议或数据库保证。
- `compiled.coverageComplete` 必须为 `true`：正式 API 规划输入只投影 4 个已授权 capability；范围外 FM 单元按需求边界逐项记为 `not-applicable`，不表示从 FM 删除或否定其业务事实。
- 当前任务文件保存本轮真实 `observedEvidence`；其余未执行任务保持为空。状态只在本索引 `taskNotes` 维护。

## 6. 规划与当前交付检查

- `inventory --fm .evidence/fm --api docs/plans/smart-domain/api-planning-input.yaml`：退出码 0；143 个工作单元、4 个 API capability。
- `compile --fm .evidence/fm --api docs/plans/smart-domain/api-planning-input.yaml --mapping docs/plans/smart-domain/index.md --require-complete`：退出码 0；8 个任务、4 个 API capability、95 个有依据的范围处置、0 个未分配单元、0 个编译诊断，`coverageComplete=true`。
- API 规划投影新鲜度检查：4 个 capability 和 4 个支撑 resource 的编译字段与 `.evidence/api/api.yaml` 一致，投影记录的权威 API SHA-256 匹配当前文件。
- `plan_state.py verify`：规划结构有效；任务 1、任务 2 已完成。
- `CHECK-FND-001`：退出码 0；ReaderTests 3 项通过，3 个 Gradle task 实际执行。
- `CHECK-FND-002`：退出码 0；目标 Spring/H2/MyBatis 注入测试通过，7 个 Gradle task 实际执行。
- `CHECK-FND-003`：退出码 0；BackendArchitectureTests 3 条 ArchUnit 规则通过，12 个 Gradle task 实际执行。
- `./gradlew check`：退出码 0；28 个 task 中 3 个实际执行、3 个 from-cache、22 个 up-to-date，Spotless 违规已解决。
- `PATH=/opt/miniconda3/bin:$PATH npm test`：退出码 0；使用仓库要求的 Python 3.12.3 和已安装 requirements 后，应用、建模扩展、Skills 与 Guides 测试全部通过。
- `npm run lint`：退出码 0；前端 lint 命中 Nx cache，Guides 检查通过。
- `npm run build`：退出码 0；Nx 35 个任务命中缓存，evidence-modeling TypeScript typecheck 实际通过。
- `python3 -B -m unittest discover -s .agents/skills/evidence-task-planning/tests -v`：退出码 0，40 项通过。
- `npm run guides:verify`：退出码 0；Guides 测试 8 项通过，49 份文档的 352 个本地链接无错误，Prettier 检查通过。
- `git diff --check`：退出码 0。任务 1 已满足 completionCriteria；按单任务停止纪律，不在本轮启动任务 2。
- `CHECK-DOM-SUB-001`：退出码 0；SubscriptionTests 4 项通过，3 个 Gradle task 均实际执行，覆盖 11 个必填字段、读者绑定、重复编号拒绝和失败后集合不变。
- `CHECK-DOM-PAY-001`：退出码 0；PaymentStatusTests 5 项通过，3 个 Gradle task 均实际执行，覆盖付款派生、单请求约束、闭合时间边界、pending/completed、重复证明及字段错配。
- `./gradlew :backend-domain:test --rerun-tasks`：退出码 0；领域模块 20 项测试通过，3 个 Gradle task 均实际执行。
- 本轮 `./gradlew check`：退出码 0；28 个 task 中 13 个实际执行、15 个 up-to-date；Java 测试、Spotless 和分层回归通过。
- 本轮 `PATH=/opt/miniconda3/bin:$PATH npm test`、`npm run lint`、`npm run build`、`npm run guides:verify`：退出码均为 0；lint 的前端任务命中 Nx cache，build 的 35 个成功任务中 34 个命中缓存，后端打包与 TypeScript typecheck 实际执行，Guides 8 项测试及 49 份文档的 352 个本地链接通过。
- 本轮 `git diff --check`：退出码 0。任务 2 已满足 completionCriteria；按单任务停止纪律，不在本轮启动任务 3。
