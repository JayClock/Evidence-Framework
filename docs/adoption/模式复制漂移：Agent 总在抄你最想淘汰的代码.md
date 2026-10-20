# 模式复制漂移：Agent 总在抄你最想淘汰的代码

## Bad Smell

Agent 为新功能寻找参考时，很容易把同类代码整套搬过来。目录怎么分、测试怎么写、依赖选哪个版本，甚至示例里的业务字段，都可能跟着进入新实现。文档写了新的约定，参考代码却沿用另一套模式，Agent 就有了两个不同的答案。

Evidence 引用的外部工程中，有的使用应用服务，有的使用旧版 Spring Boot 和 `javax` 包。本项目采用领域对象承担业务行为的写法，HTTP 接口使用 Jersey。参考工程可以帮助理解组织形式，照搬实现却会把原工程的技术选择一起带进来。

## Solution

### 给出带测试的复用入口

[范例索引](../engineering/examples.md)把可复用做法指向仓库中的真实源码与测试。不可变描述和实体行为对应 `UserDescription`、`User` 与 `UserTests`，持久化对应根集合、MyBatis XML 与读写测试，HTTP 对应子资源和独立测试应用。每项还附有仓库根的复验命令，Agent 可以从具体位置开始读取。

范例里的行为由测试说明。比如 [UserTests](../../libs/backend/domain/src/test/java/com/evidencepoc/backend/domain/UserTests.java)构造一个已有对象，调用重命名方法后，分别断言标识不变、新对象使用新名称、原对象仍保留旧名称。复用时能看到不可变快照的实际含义，而不只是读到一句“实体保持身份”。

索引也记录适用条件。用户切片是无关联叶子，示例中的物理删除、覆盖写入和分页界限只属于这个切片。任务通过 `files.reuse` 和 `dependencyUsage` 说明消费哪部分实现、为何适用、重跑哪些检查，关联与角色协作仍按本任务设计处理。

### 参考外部工程时明确取舍

[上游依据](../../.agents/skills/evidence-task-planning/references/upstream.md)固定参考仓库的提交版本，并逐项说明采用的内容。smart-domain 的模式契约用于确认根集合、关联和行为归属，消费者工程用于参考应用组合根与实现库的组织，Accounting 的 API 测试用于参考独立测试应用、随机端口和领域根集合替身。

同一份依据也说明了与本项目的差异。消费者工程中的 PostgreSQL、OIDC、旧组件版本和应用服务不随目录结构一起引入。Accounting 的旧 `javax` 包和手工 HAL 表示也不照搬，本项目按当前依赖使用官方集成、`@MockitoBean` 和请求级 HTTP 客户端配置。参考位置与采用范围放在一起，Agent 不必从整份工程里猜哪些写法仍适用。

### 把依赖约定变成架构测试

[BackendArchitectureTests](../../apps/backend/src/test/java/com/evidencepoc/backend/BackendArchitectureTests.java)用 ArchUnit 检查实际类依赖。领域层不能依赖 API、持久化、配置和相关框架，API 不能访问持久化、Mapper 或 Spring JDBC，持久化也不能反向依赖 HTTP 层。复制代码带来这些依赖时，架构测试会报告违反的规则。

规则针对依赖方向，没有规定每个方法怎么拆。Agent 可以在领域对象内部选择实现方式，但不能为了少写一次调用就让 API 直接访问 Mapper。

这些测试随应用测试运行，并通过根目录的 `./gradlew check` 纳入 Java 检查。任务复用范例时仍运行相应的领域、HTTP 或持久化测试，既检查依赖位置，也检查这次改动涉及的行为。
