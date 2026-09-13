# 上游规范与固定技术基线

本 Skill 是通用 FM 消费者的任务规划工具，不是 smart-domain 官方代码生成器。业务来自实际 FM/API；模块化单体与统一 MyBatis 是本 Skill 的技术约束，不是上游文档推导出的业务事实。

## 固定规范来源

- 仓库：<https://github.com/JayClock/smart-domain>
- 文档 commit：`6ff4c1b9b2489ae14d285660d6db39d31722182f`
- 核对日期：2026-09-12
- 文档兼容范围：smart-domain 0.3.x，源码/样例版本为 0.3.0。

| 文档               | 固定链接                                                                                                                           | 消费内容                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Pattern Contract   | [模式契约](https://github.com/JayClock/smart-domain/blob/6ff4c1b9b2489ae14d285660d6db39d31722182f/docs/pattern-contract.md)        | no-service、根集合、窄/宽关联、行为归属和API投影 |
| Adoption Guide     | [消费者指南](https://github.com/JayClock/smart-domain/blob/6ff4c1b9b2489ae14d285660d6db39d31722182f/docs/adoption-guide.md)        | Agent指令入口、设计映射、纵向切片和验证          |
| Compatibility      | [兼容基线](https://github.com/JayClock/smart-domain/blob/6ff4c1b9b2489ae14d285660d6db39d31722182f/docs/compatibility.md)           | Java、Boot、MyBatis、Jersey及消费方验证要求      |
| Association Matrix | [关联矩阵](https://github.com/JayClock/smart-domain/blob/6ff4c1b9b2489ae14d285660d6db39d31722182f/templates/association-matrix.md) | 拥有者、契约、生命周期、原子性和API对应          |
| Context Roles      | [角色设计](https://github.com/JayClock/smart-domain/blob/6ff4c1b9b2489ae14d285660d6db39d31722182f/templates/context-roles.md)      | 可信Actor、实例角色、允许和拒绝场景              |
| Adoption Checklist | [消费验证](https://github.com/JayClock/smart-domain/blob/6ff4c1b9b2489ae14d285660d6db39d31722182f/templates/adoption-checklist.md) | 真实适配器、HTTP、数据库、架构和人工证据         |

引用文档时固定 commit/tag，不使用移动 main 作为唯一依据。依赖版本与文档版本分别记录；具体更新必须核对发布、兼容和安全状态。

## 公共分页组件依据

用户指定的 [main/Pagination.java](https://github.com/JayClock/smart-domain/blob/main/api-hateoas/src/main/java/io/github/jayclock/smartdomain/api/hateoas/pagination/Pagination.java) 在本次核对时 main HEAD 为上述 `6ff4c1b9...`；[固定源码](https://github.com/JayClock/smart-domain/blob/6ff4c1b9b2489ae14d285660d6db39d31722182f/api-hateoas/src/main/java/io/github/jayclock/smartdomain/api/hateoas/pagination/Pagination.java) 与 Maven Central 0.3.0 sources 中同文件逐字一致。

组件坐标为 smart-domain-api-hateoas，类名 `io.github.jayclock.smartdomain.api.hateoas.pagination.Pagination`。具体构造器、page 回调、返回类型与边界已整理到 [后端组织](backend-layout.md)。main 是定位入口，不是可复现版本标识；以后升级仍需重新核对已安装依赖源码及实际 HTTP/SQL 行为。

## 消费者后端组织参考

另核对 `JayClock/Evidence@b4b9ace5badf7e4c37b13bd1e19f3499073bfff6` 源码（2026-09-13），只采纳组织形式，不继承其产品模型：

- [Gradle 模块](https://github.com/JayClock/Evidence/blob/b4b9ace5badf7e4c37b13bd1e19f3499073bfff6/settings.gradle)：app 组合根与 domain/api/persistent 实现库分离。
- [MyBatis 配置](https://github.com/JayClock/Evidence/blob/b4b9ace5badf7e4c37b13bd1e19f3499073bfff6/libs/server-java/persistent/src/main/resources/mybatis-config.xml)：XML 与实际对象工厂装配。
- [领域映射形式](https://github.com/JayClock/Evidence/blob/b4b9ace5badf7e4c37b13bd1e19f3499073bfff6/libs/server-java/persistent/src/main/resources/mybatis.mappers/UsersMapper.xml)：identity/description/关联直接 resultMap，不把示例字段当输入模型要求。
- [Root API](https://github.com/JayClock/Evidence/blob/b4b9ace5badf7e4c37b13bd1e19f3499073bfff6/libs/server-java/api/src/main/java/reengineering/ddd/evidence/api/RootApi.java)：ResourceContext 注入的子资源导航、独立表示和 URI 模板。

该消费者使用 smart-domain 0.2.1、PostgreSQL、local/OIDC，并存在 application Service；这些不是本 Skill 的默认业务/技术选择。其用户入口也不是完整 CRUD。保留本 Skill 的 no-service 约定和 0.3.x 核验基线，不复制用户/工作空间/认证字段，不因参考库版本而降级。其组合根与实现库形式可用于统一后端应用，但不证明已完成消费项目的业务模块映射、数据封装或本地事务设计。完整适用规则见 [后端组织](backend-layout.md)。

## API 模块测试参考

另核对 `Re-engineering-Domain-Driven-Design/Accounting@ffe0a3648c275b0e930aca1fae13060bb2bdfd1b`：

- [ApiTest](https://github.com/Re-engineering-Domain-Driven-Design/Accounting/blob/ffe0a3648c275b0e930aca1fae13060bb2bdfd1b/api/src/test/java/reengineering/ddd/accounting/api/ApiTest.java)：API 模块独立测试应用、随机端口和 RestAssured。
- [CustomersApiTest](https://github.com/Re-engineering-Domain-Driven-Design/Accounting/blob/ffe0a3648c275b0e930aca1fae13060bb2bdfd1b/api/src/test/java/reengineering/ddd/accounting/api/CustomersApiTest.java)：mock 领域根集合，验证真实 HTTP 的不存在、字段和导航链接。
- [测试依赖](https://github.com/Re-engineering-Domain-Driven-Design/Accounting/blob/ffe0a3648c275b0e930aca1fae13060bb2bdfd1b/api/build.gradle)：HTTP 测试依赖归 api 模块，而非要求消费 app/persistent。

采纳的是测试隔离边界，不是参考产品的业务字段。该库使用 Boot 2.7/旧 javax.ws.rs 和 javax.inject、手工 HAL 和全局 RestAssured 配置；本项目保留 Boot 3.5、官方 smart-domain 集成，使用当前 Spring 的 `@MockitoBean` 与请求级 HTTP 客户端配置。具体规划规则见 [工序与证据](backend-layout.md#5-工序与证据)。

## 采用的组件

Group 为 `io.github.jayclock`，主要入口为：

- `smart-domain-bom`
- `smart-domain-core`
- `smart-domain-mybatis-spring-boot-starter`
- `smart-domain-api-spring-boot-starter`

所核对文档中 Core 为 Java 17；Starter 基线为 Boot 3.5.x（样例 3.5.9）；MyBatis Starter 为 3.0.x（样例 3.0.4）；HTTP 为 Jersey 与 Spring HATEOAS/HAL/HAL-FORMS。实际项目必须验证解析的完整依赖图、启动和运行时行为，不能只改版本字符串。

MyBatis 不替代数据库引擎和事务管理器。统一后端应用、进程内模块契约是本 Skill 的架构约束；具体业务模块、公开接口、表归属、本地事务和权限仍需从真实模型与项目设计确定。上游也不为消费项目决定远程依赖；确有外部调用时本地事务不覆盖其副作用。

上游 `smartDomainCheck` 只检查上游示例，不由 Maven 依赖安装到消费项目。POM 可下载、本地发布、样例通过不等于消费项目已完成集成；生产依赖仓库及真实测试证据需单独记录。
