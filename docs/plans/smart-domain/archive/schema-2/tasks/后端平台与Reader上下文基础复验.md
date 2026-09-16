# 后端平台与 Reader 上下文基础复验

> 复验现有共享基础，避免订阅切片重新实现用户主体、技术模块或角色切换。

## 1. Guides：当前任务前馈

- 项目入口：`AGENTS.md`、`docs/guides/index.md`；总索引：[`../index.md`](../index.md)。
- 交付目标：确认 Java 17/Boot 3.5.9/smart-domain 0.3.0、技术库依赖方向以及 `Users.inSubscriptionContext().asReader(user)` 的现有行为可被后续任务复用。
- 非目标：不实现合同、付款、认证或新数据库结构；不把 `role.reader` 当作登录权限。
- 业务来源：`party.user`、`role.reader`、`relation.user-as-reader`、`context.subscription`。
- 工程基线：`docs/architecture/{overview,modules,domain-mapping}.md`、`docs/engineering/{backend,testing,examples}.md`。
- 工序实例：采用共享基础复验和领域行为工序；真实 `User`/`Reader`，内存 Users Fake 仅证明角色切换不重读主体；persistent 测试证明 Spring 注入，ArchUnit 证明技术分层。
- 前置产物：无。

## 2. 局部设计

- `User` 是唯一稳定主体；`Reader` 直接装饰调用方已加载快照。
- domain 只声明 `SubscriptionContext`；persistent 独立实现并注入 `Users` 适配器。
- 后续订阅关联可由 Context 注入 Reader，但本任务不预先创建合同集合。

## 3. 实施与检查

```yaml
schemaVersion: '2.0'
kind: task-plan
taskKey: foundation::context.subscription::role.reader
planRef: ../index.md
sourceRefs: [party.user, context.subscription, role.reader, relation.user-as-reader, design.reader-context-foundation]
ruleRefs: []
scenarioRefs: []
storyRefs: [US-001]
acceptanceRefs: []
procedureRefs:
  - docs/engineering/procedures.md
  - docs/engineering/testing.md
  - docs/engineering/backend.md
  - docs/engineering/examples.md
dependencyUsage: []
files:
  create: []
  modify:
    - libs/backend/domain/src/test/java/com/evidencepoc/backend/domain/ReaderTests.java
  reuse:
    - libs/backend/domain/src/main/java/com/evidencepoc/backend/domain/model/Users.java
    - libs/backend/domain/src/main/java/com/evidencepoc/backend/domain/context/SubscriptionContext.java
    - libs/backend/domain/src/main/java/com/evidencepoc/backend/domain/role/Reader.java
    - libs/backend/persistent/src/main/java/com/evidencepoc/backend/persistent/associations/Users.java
    - libs/backend/persistent/src/main/java/com/evidencepoc/backend/persistent/context/SubscriptionContext.java
    - libs/backend/persistent/src/test/java/com/evidencepoc/backend/persistent/MyBatisUsersTests.java
    - apps/backend/src/test/java/com/evidencepoc/backend/BackendArchitectureTests.java
steps:
  - 按当前 Google Java Format 修复 ReaderTests 的现有换行违规，不改变断言、输入或行为。
  - 核对构建版本、四个 Gradle 项目和 domain/api/persistent 依赖方向与当前基线一致。
  - 定位 Reader 角色切换及其测试，确认 asReader 直接装饰传入 User、拒绝 null 且不重新读取主体。
  - 运行领域、持久化注入和架构定向检查；若现有行为不满足来源，停止并返回设计，不在 verify 任务扩展功能。
checks:
  - id: CHECK-FND-001
    purpose: 复验 Reader 角色切换的身份与快照语义。
    quadrant: Q1
    subject: Users -> SubscriptionContext -> Reader 领域入口
    dependencies: 真实 User/Reader；内存 Users Fake 明确禁止重读主体。
    inputs: reader-1、固定显示名称、null 反例。
    expected: roleId=role.reader、readerId 保持主体身份、actor 为同一快照；null 被拒绝。
    testFiles: [libs/backend/domain/src/test/java/com/evidencepoc/backend/domain/ReaderTests.java]
    cwd: .
    command: ./gradlew :backend-domain:test --tests com.evidencepoc.backend.domain.ReaderTests --rerun-tasks
    procedure: docs/engineering/testing.md
    preparationTaskRefs: []
    gapRefs: []
    evidenceRequired: 命令、退出码、实际执行而非 UP-TO-DATE 的测试摘要。
  - id: CHECK-FND-002
    purpose: 复验 SubscriptionContext 由适配层注入且不在根集合中构造。
    quadrant: Q1
    subject: persistent Users 与 SubscriptionContext 装配
    dependencies: 真实 Spring、H2/MyBatis 测试上下文；不证明合同存储。
    inputs: 已持久化 User 与一个过期显示名称快照。
    expected: 返回注入的同一 Context，并直接装饰给定快照。
    testFiles: [libs/backend/persistent/src/test/java/com/evidencepoc/backend/persistent/MyBatisUsersTests.java]
    cwd: .
    command: ./gradlew :backend-persistent:test --tests com.evidencepoc.backend.persistent.MyBatisUsersTests.subscriptionContextIsInjectedAndDecoratesTheGivenUser --rerun-tasks
    procedure: docs/engineering/testing.md
    preparationTaskRefs: []
    gapRefs: []
    evidenceRequired: 命令、退出码和目标测试结果。
  - id: CHECK-FND-003
    purpose: 复验固定技术库依赖方向。
    quadrant: Q4
    subject: domain 独立、api 不访问 persistent、persistent 不访问 HTTP
    dependencies: ArchUnit 扫描生产类。
    inputs: 当前 backend classpath。
    expected: 三条禁止依赖规则通过。
    testFiles: [apps/backend/src/test/java/com/evidencepoc/backend/BackendArchitectureTests.java]
    cwd: .
    command: ./gradlew :backend:test --tests com.evidencepoc.backend.BackendArchitectureTests --rerun-tasks
    procedure: docs/engineering/testing.md
    preparationTaskRefs: []
    gapRefs: []
    evidenceRequired: 命令、退出码和 ArchUnit 规则摘要。
completionCriteria:
  - CHECK-FND-001 证明角色切换的身份、快照和拒绝语义。
  - CHECK-FND-002 证明适配层 Context 注入可复用。
  - CHECK-FND-003 证明固定技术分层未被破坏。
observedEvidence:
  - checkId: CHECK-FND-001
    command: ./gradlew :backend-domain:test --tests com.evidencepoc.backend.domain.ReaderTests --rerun-tasks
    exitCode: 0
    observed: BUILD SUCCESSFUL；3 个 ReaderTests 测试全部通过，3 个 Gradle task 均实际执行，证明 roleId、readerId、同一快照及 null 拒绝语义。
  - checkId: CHECK-FND-002
    command: ./gradlew :backend-persistent:test --tests com.evidencepoc.backend.persistent.MyBatisUsersTests.subscriptionContextIsInjectedAndDecoratesTheGivenUser --rerun-tasks
    exitCode: 0
    observed: 串行重跑 BUILD SUCCESSFUL；7 个 Gradle task 均实际执行，目标测试证明 Spring 注入同一 SubscriptionContext 并直接装饰给定 User 快照。
  - checkId: CHECK-FND-003
    command: ./gradlew :backend:test --tests com.evidencepoc.backend.BackendArchitectureTests --rerun-tasks
    exitCode: 0
    observed: 串行重跑 BUILD SUCCESSFUL；12 个 Gradle task 均实际执行，3 条 ArchUnit 禁止依赖规则全部通过。
  - checkId: PROJECT-QUALITY-JAVA
    command: ./gradlew check
    exitCode: 0
    observed: BUILD SUCCESSFUL；28 个 Gradle task 中 3 个实际执行、3 个 from-cache、22 个 up-to-date；backend-domain Spotless 与测试均通过。
  - checkId: PROJECT-QUALITY-NPM-TEST
    command: PATH=/opt/miniconda3/bin:$PATH npm test
    exitCode: 0
    observed: 系统 Python 3.9.6 的首次执行因不满足仓库声明的 Python 3.10+ 与依赖要求失败；改用已有 Python 3.12.3 及 requirements 依赖后，同一 npm test 全部通过，包括应用/Nx、建模扩展、Skills 和 Guides 测试。
  - checkId: PROJECT-QUALITY-LINT
    command: npm run lint
    exitCode: 0
    observed: 前端 lint 从 Nx cache 命中；Guides 检查确认 49 份文档、352 个本地链接和 Prettier 均通过。
  - checkId: PROJECT-QUALITY-BUILD
    command: npm run build
    exitCode: 0
    observed: Nx 的 35 个成功任务均命中缓存；随后 evidence-modeling TypeScript typecheck 实际通过。Nx 同时报告既有 Gradle spotlessJava dependsOn 配置警告，但未导致失败。
  - checkId: PROJECT-QUALITY-GUIDES
    command: npm run guides:verify
    exitCode: 0
    observed: Guides 测试 8 项通过，49 份文档的 352 个本地链接无错误，Prettier 检查通过。
```

## 4. 执行与交接纪律

本任务因用户授权解决 `GAP-FND-READER-TEST-FORMAT` 而转为窄范围 `implementation`：只允许修复 `ReaderTests.java` 的格式并复验既有行为。任何业务或产品代码变化仍须返回计划；通过也不证明生产认证或订阅功能已实现。
