# 模块化单体：业务边界、组合根与资源导航

本约束提取自 [固定来源](upstream.md) 的构建和源码，不继承参考产品的业务范围。适用于任意 FM，不默认增加用户管理、外部身份、工作空间或合同。计划任务应明确以下落点和检查；本 Skill 自身不修改产品代码。

## 1. 构建模块，而不只是分包

```text
apps/<现有后端应用>/           启动入口、运行配置、依赖装配、跨模块集成测试
libs/<后端实现>/
├── domain/                  model、description、关联契约、规则和领域测试
├── api/                     Root API、子资源、请求/表示/链接模板及独立 HTTP 测试
└── persistent/              associations、mappers、XML、Flyway 和适配器测试
```

这是单一后端应用中的技术分层。业务模块按实际行为和数据所有权在这些库中组织，通过公开接口协作；只有现有边界需要编译隔离时才有依据地细分构建模块，不要求每个 FM Context 对应一套库或服务。名称沿用实际项目，不为了套模板强制改名。Gradle 使用 project dependency 连接真实模块，Nx 编排各自目标。共用一个 Wrapper 和版本来源，分别核对构建、运行工作目录和任务完整路径；移动构建入口后旧 Nx serve/taskName 不能继续指向失效根任务。

优先使用插件推断的 Nx 目标。若真实构建证明 Gradle 批处理排除上游任务与 Boot 的延迟 artifact provider 冲突，可为组合根显式调用根 Wrapper；记录原因、完整 inputs/outputs 与串行约束，保留 check/test，而不是跳过测试或伪造依赖已执行。不能仅凭缓存命中或单模块编译宣称整体打包通过。

依赖方向：组合根 → API/持久化/领域；API → 领域；持久化 → 领域。领域只消费 smart-domain Core 和必要纯 Java 值类型，不反向依赖 Spring、MyBatis、Jackson 或 HTTP。API 不访问 Mapper，持久化不依赖 API/组合根。

组合根统一装配和打包后端，模块间默认使用进程内契约，不通过自身 HTTP 接口绕行。除了上述技术层依赖，还要列出业务模块的公开包/接口、内部包、表/迁移拥有者以及允许的依赖方向；通过实际依赖图、包可见性和架构测试检查内部访问与依赖环。多 Gradle 项目不自动证明业务模块封装完成。

共享数据库仍须保持表和写入入口的模块归属。跨模块操作调用拥有者契约，按业务要求显式设计本地事务参与者、事务管理器和失败回滚，不在组合根堆积业务编排或跨模块 SQL。

不为凑层数创建空 application/security/common 模块。存在真实跨上下文角色或认证适配责任时按来源增加模块；不要用 application Service 替代领域行为拥有者。

## 2. 领域与根集合

- 实体实现 `Entity<Identity, Description>`；稳定身份与不可变描述分开，描述属性从本次已确认 FM/软件需求取得。
- 根集合接口放在 domain，适配器放在 persistent.associations。根集合承担定位和有依据的生命周期操作，不把所有对象都变成全局 CRUD 入口。
- 规则位于 Description/实体/ContextRole；适配器只做映射、加载、存储、并发机制和本地事务。
- 叶子实体不补造关联。拥有真实关联时遵循 `Owner.field → Owner.WideInterface → OwnerField → Mapper`，公开读取保持最窄契约。
- 生命周期、加载策略、DTO 与数据库表是不同选择，不机械复制参考仓库的实例字段、自动开通规则、关系和删除语义。

## 3. MyBatis XML 直接装配领域图

持久化使用 Mapper 接口 + 独立 XML：`resultMap` 映射 identity、构造 Description，并按真实关系装配关联对象；查询返回领域实体。普通实体往返不增加无独立意义的 Row/PO → Entity 复制层，也不把 SQL 堆在 Resource/领域注解中。独立报表/联合投影有确切用途时可使用专用查询表示，需说明原因。

- 集中配置 mapper-locations、mybatis-config、对象工厂和 Flyway；XML namespace 与接口/方法对应。
- 完整采用官方 MyBatis Starter，并明确引用需要用于编译的 MyBatis Starter/Core API；传递运行依赖存在不保证编译类路径可用。
- `@EnableSmartDomainMybatis` 扫描实际 associations 包，leafEntityTypes 登记需要 hydrate 的无关联实体。
- 对象工厂只出现在装配配置，业务代码不依赖框架内部 bootstrap 实现。所选版本有内部类型时记录配置依赖，并用消费者集成测试证明实际 factory 生效，不仅断言 Bean 存在。
- 描述值通过构造器装配，验证字段类型、null、嵌套图和写后重读。`@AssociationMapping` 只用于真实实体拥有的关联。
- SQL 全部参数绑定；分页稳定排序、边界/溢出和空集合有断言；写入检查行数，异常/回滚不得伪装成功。
- 事务代理不要拦截框架 final 方法；必要时根适配器组合非代理的 `EntityList` 读取视图。
- 缓存、幂等、版本/锁、方言和数据库测试环境按实际使用设计。H2/Fake 不等于生产方言已验证，参考项目的 PostgreSQL 不构成本项目的数据库选择。

## 4. Jersey 子资源与 representation

```text
RootApi → 根集合 Api → 绑定实体的 Api → 实体关联 Api
```

组合根注册 Root API，使用 `ResourceContext.initResource(...)` 为手工构造子资源补充 `@Context` 注入。实体子资源持有已从根集合找到的实体/必要生命周期契约，不成为多仓库编排器。

资源负责解析输入、调用领域行为、转换结果和错误。`ApiTemplates` 按资源类/方法生成 URI，representation 负责 `_links`、`_embedded`、分页和操作；不把 MyBatis 对象工厂、权限规则或 JDBC 放进表示层。表示模型默认直接继承框架 `RepresentationModel`；不要仅为 addSelf/addRelation 这类简单链接辅助方法另设公共抽象父类。

### 复用现成分页组件

先核对所选版本的公共 API。`io.github.jayclock.smartdomain.api.hateoas.pagination.Pagination` 已提供分页，不另造同名工具、切片、页数或导航算法。已核对源码及版本见 [来源](upstream.md)。调用形式：

```java
new Pagination<>(root.findAll(), pageSize).page(
    page,
    entity -> toRepresentation(entity),
    number -> absolutePageUri(number));
```

0.3.0 的具体契约与消费边界：

- 构造器消费 `Many<E>` 并读取一次 total；`page` 负责 `subCollection`、PageMetadata 和 self/prev/next。先切片、后映射表示，不在 HTTP 层先全量加载再分页。
- 页号从 0 开始；`page * pageSize > total` 返回 404，等于 total 时仍允许空页。整页边界可能出现到空页的 next 链接。这是当前实现行为，不误称为严格总页数范围校验。
- `toUri` 必须提供绝对 URI（内部调用 `URI.toURL()`）；组件输出相对路径/查询串链接。不要把 `ApiTemplates.relative(...)` 的结果作为该回调 URI。
- 组件不负责验证页大小与溢出；HTTP 层按已约定接口校验 page、pageSize，使用 long 检查 `(page + 1) * pageSize` 不溢出。不得把某个项目的默认大小/上限扩散成所有业务默认值。
- 声明返回 `CollectionModel<M>`，该版本实际返回 `PagedModel<M>`。默认直接返回结果并按需追加 affordance，不创建独立 CollectionModel 类、Page DTO 或公共表示基类。成员 rel 使用框架 `@Relation`。只有真实额外业务契约明确要求时才讨论定制，不主动包装一层。
- 一次读取 total 不代表数据库列表与计数处于同一一致快照；单应用运行也不消除并发变化，需要的读取一致性按真实事务契约验证。

规划检查覆盖空集合、首尾页、整页边界、越界 404、非法大小/溢出、可跟随链接和实际 JSON。契约与组件不一致时显式记录决定，不静默改接口，不只为测试通过删除边界预期。

契约检查必须通过实际 HTTP 序列化，而非只测 Java 对象：

- Root → 集合 → 成员链接可跟随；Location 与 self 解析后指向同一资源，不能混淆相对链接和 Jersey 可能规范化的绝对 Location。
- 空集合遵循实际框架序列化契约：直接 Pagination 结果可能省略 `_embedded`，应验证 page、self、操作及确实无成员，而不是为了添加空数组创造集合包装。分页元数据/next/prev 与已约定页号口径一致；不要照搬参考产品的参数名和起始页号。
- HAL-FORMS 保留协议默认模板规则。以所选 HATEOAS 版本为准：首个模板可能叫 `default`，不是 `.withName()` 字符串。
- 输入属性必须实际可写，required/type/长度限制正确。不可变 record 可能被该版本推断成 readOnly；采用独立可写请求 Bean 或经过验证的元数据配置，不能修改领域不可变性来迁就 HTTP。
- 校验错误类型、缺失实体、非法 JSON/未知字段和类型转换；失败不改变数据，不向客户端泄露 SQL/内部栈。
- 权限必须在真实操作点成立。无来源时不复制参考产品的 principal、角色和身份开通；本地演示限制不等于生产授权。

## 5. 工序与证据

任务文件声明业务模块及公开契约、对应技术库/build task/cwd、源码/XML/迁移/测试路径。检查仅允许的业务模块依赖、不访问其他模块内部实现/私有表，以及实际模块协作和本地事务回滚；测试结果不能只停留在技术三层分包。领域单测归 domain；API 模块必须有自己的测试，不能只依赖 app 的跨模块用例；适配器测试归 persistent；跨模块 HTTP/装配测试归 app。Java 格式/架构检查需有实际命令；前端 lint 通过不代表 Java 已检查。

API 测试采用 [Accounting 的隔离方式](upstream.md)：本模块的测试应用启动真实 Jersey/官方超媒体集成，以随机端口 HTTP 客户端检查协议，用 mock 替代领域根集合、真实实体/描述及小型 Many 夹具准备事实。不要 mock 被测 Resource、序列化器或分页组件，也不要依赖 app/persistent、Mapper 或数据库。验证请求参数到领域调用、失败时不调用写操作、子资源上下文注入、状态码/响应体、可跟随链接、媒体类型和适用的 HAL-FORMS。客户端端口按请求设置，避免全局静态状态干扰并行测试。

本模块 mock 测试证明 HTTP 映射与领域边界，不证明业务规则、SQL、事务或生产装配。app 继续验证真实持久化与运行配置（如严格 JSON 策略），不可为了让 API 测试独立而复制整套 app 配置或删除真实集成测试。迁移参考测试时保留本项目版本与官方集成，不照搬旧版 javax.ws.rs/javax.inject、手工 HAL 配置或产品业务。

implementation 需要回归、失败不变性和真实验收；执行模式来自用户授权和当前任务计划。明确区分未执行、环境失败、结构校验通过和业务通过。参考仓库中 application Service、认证、数据库及版本的差异必须显式取舍，不能打着“照搬结构”的名义继承整个产品。
