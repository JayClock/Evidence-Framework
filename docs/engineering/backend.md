# 后端工程指南

先读 [模块边界](../architecture/modules.md)、[领域映射](../architecture/domain-mapping.md)与当前任务，再按改动加载本页。固定框架细节由 [后端模式规范](../../.agents/skills/evidence-task-planning/references/backend-layout.md)维护，不在项目里复制其完整内容。

## 设计与代码

- Java 17、Boot 与 smart-domain 版本以 [构建](../../build.gradle)和 [版本配置](../../gradle.properties)为准。使用根 Wrapper，不在 app 内再维护构建根。
- 领域只消费 Core 与必要纯 Java 类型。实体、Description、ContextRole 拥有行为；没有实际责任不建 application/security/common 空模块。
- 根集合定位成员并承担有依据的生命周期操作；成员行为不移交给万能 Repository/Service。叶子实体不补造关联。
- 可变关联按拥有者、窄/宽接口和持久化适配器设计。读取暴露窄接口，写能力保留在拥有者内部。
- 使用具名领域异常描述失败；API 负责协议转换。不要吞异常、伪造写入成功或返回内部栈。

## MyBatis / Flyway

- Mapper + XML 直接映射领域实体与不可变 Description，不增加无独立用途的 Row/PO 转换层。
- 配置实际 mapper-locations、XML namespace、官方对象工厂与 leafEntityTypes；用真实 SqlSessionFactory 和读写结果验证，不只检查 Bean 存在。
- SQL 参数绑定，排序稳定，写入检查影响行数；并发策略与事务入口必须有依据并有真实数据库检查。
- 数据表、迁移与写入口由业务拥有者维护。新增关系前复核删除、引用、留存与本地回滚，不跨模块直接操作私有表。
- 不修改已使用迁移来掩盖 schema 差异；新变更追加迁移。H2 验证不证明生产方言。
- 事务代理不能覆盖框架 final 方法；根集合适配器的框架组合方式参考真实 [Users 实现](../../libs/backend/persistent/src/main/java/com/evidencepoc/backend/persistent/associations/Users.java)。

## HTTP 与测试

HTTP 导航、输入与表示见 [API 指南](api.md)。业务规则归 domain 测试；真实 SQL/XML 归 persistent；API 独立启动 HTTP 并 mock 领域；app 保留真实 HTTP + SQL、配置与装配测试。

本次相关模块测试后执行 `./gradlew check` 和项目质量命令。格式化仅在确需修改时执行 `./gradlew spotlessApply`，之后审查差异并重跑检查。精确任务与证据边界见 [测试指南](testing.md)。

## 当前构建适配

[backend Nx 配置](../../apps/backend/project.json)让组合根 build/serve 调用根 Wrapper，并声明缓存输入、输出及串行约束。这是现有配置用于处理 Nx Gradle 批处理与 Boot 延迟 artifact provider 的调度问题；库目标仍由插件推断。修改构建时核对实际任务图和完整打包，不通过跳过上游 jar/test 来解决装配错误。

[范例索引](examples.md)提供实际源码和测试落点。参考产品的数据库、身份系统、旧版依赖或 Service 不随组织形式一起继承。
