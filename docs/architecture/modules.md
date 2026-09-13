# 模块边界与本地一致性

## 技术库

| 位置                      | 职责                                              | 允许依赖                               |
| ------------------------- | ------------------------------------------------- | -------------------------------------- |
| `apps/backend`            | 组合根、运行配置、Jersey/Jackson 装配、跨模块测试 | domain、api、persistent                |
| `libs/backend/domain`     | 稳定身份、Description、实体/角色行为、关联契约    | smart-domain Core 与必要纯 Java 类型   |
| `libs/backend/api`        | Root、集合/实体子资源、请求、表示及独立 HTTP 测试 | domain 与 HTTP/表示框架                |
| `libs/backend/persistent` | 关联适配器、Mapper、XML、迁移、SQL 测试           | domain 与持久化框架                    |
| `apps/frontend`           | React UI、导航、消费者交互                        | 已约定 HTTP 契约，不共享 Java 内部对象 |

API 与 persistent 不相互依赖；domain 不反向依赖 Spring、MyBatis、Jackson 或 HTTP。组合根不得成为业务 Service。构建库数量不能证明业务封装已经完成。

[settings.gradle](../../settings.gradle)定义真实 Gradle 项目；[架构测试](../../apps/backend/src/test/java/com/evidencepoc/backend/BackendArchitectureTests.java)检查当前分层。规划新增业务模块时还要补充其公开包、禁止依赖与内部数据访问检查。

## 已有业务基础：用户主体资料

| 责任             | 现有落点与边界                                                                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 业务来源         | [party.user](../../.evidence/fm/participants/user.yaml)提供稳定主体概念；本地显示名称来自独立的软件切片说明，不冒充 FM 属性                                                                                                |
| 根集合公开契约   | [domain.model.Users](../../libs/backend/domain/src/main/java/com/evidencepoc/backend/domain/model/Users.java)                                                                                                              |
| 成员行为         | [User](../../libs/backend/domain/src/main/java/com/evidencepoc/backend/domain/model/User.java)、[UserDescription](../../libs/backend/domain/src/main/java/com/evidencepoc/backend/domain/description/UserDescription.java) |
| 数据与迁移拥有者 | persistent 的 Users 适配器拥有 `app_users` 写入与 [V1 迁移](../../libs/backend/persistent/src/main/resources/db/migration/V1__create_users.sql)                                                                            |
| 本地事务         | [Users 适配器](../../libs/backend/persistent/src/main/java/com/evidencepoc/backend/persistent/associations/Users.java)管理本切片写入，参与现有 Spring 事务；实际回滚由 persistent/app 测试证明                             |
| 消费边界         | 通过根集合与成员契约操作；未来模块不得直接依赖 UsersMapper 或读写私有表                                                                                                                                                    |

当前独立表的删除行为不得直接推广到存在业务引用的主体生命周期。切片的并发和 HTTP 细节只在 [切片契约](../../apps/backend/README.md)维护。

## FM 到业务模块

订阅、移动支付、预付费账户与内容上下文不是自动生成的模块列表。后续规划依据行为内聚性、数据所有权和变更原因决定合并/拆分；每项至少记录：

1. FM Context、实体与规则来源，以及映射理由。
2. 对外公开的能力、身份或不可变值；内部包、Mapper 和可变实现。
3. 表、迁移、写入口的唯一拥有者。
4. 允许的模块依赖与禁止访问；需要联合查询时由拥有者提供查询契约或投影。
5. 本地事务入口、参与操作、数据源/事务管理器及失败回滚范围。

这些决定进入规划 `designItems` 及任务局部设计，不凭架构图预填已实现模块。

## 一致性与外部边界

模块协作走进程内公开契约，不调用本应用 HTTP 绕行。共享数据库不授予跨模块写表权限；多个模块写入同一业务操作时，显式设计共同事务，而不是依赖默认传播猜测原子性。

只对有真实依据的外部调用设计协议、超时、重试、幂等和结果登记。本地事务不覆盖远程副作用；外部证明角色不自动要求 RPC、消息或补偿。未知生产数据库只阻塞相应 SQL/并发验收，不阻塞已知纯领域设计。
