# 本地用户基础切片契约

## 范围

当前切片以跨上下文稳定主体 [party.user](../../.evidence/fm/participants/user.json)为定位，提供 `id + displayName` 的本地 CRUD。显示名称是软件资料字段，不假称 FM 已定义该属性；正式业务 API 与本切片分开，不由代码反向改写 FM/API。

这是本地开发接口，不是生产用户管理、认证或合同授权系统。默认 local profile 绑定 `127.0.0.1`，Root CRUD 只在 local/test 注册。不得用代理或监听地址变更暴露公网；生产数据库、可信身份及权限需要独立依据。

项目级设计只在 [架构基线](../../docs/architecture/overview.md)、[模块边界](../../docs/architecture/modules.md)、[领域映射](../../docs/architecture/domain-mapping.md)维护；工程做法见 [后端指南](../../docs/engineering/backend.md)。本页只维护这个切片的行为契约。

## 用户行为

- ID 服务端生成 UUID，创建后不变；相同显示名称不合并用户。
- displayName 为字符串，非 null、非空白，最多 100 个 UTF-16 单元；原样保留，不自动裁剪。禁止提交 id 和其他未知字段，不把数字/布尔值隐式转成名称。
- PUT 替换显示名称，不 upsert；缺失为 404；并发采用最后成功写入者覆盖，不提供乐观版本检查。
- DELETE 在当前独立表物理删除，缺失为 404，不级联。未来加入业务引用前必须先明确限制、生命周期与留存要求。
- SQL 参数绑定，分页按 ID 稳定排序，写入检查行数；异常不伪装成功。写操作参与外层本地事务并可回滚，不使用用户缓存。

## HTTP 契约

| 方法   | 路径                        | 请求                          | 成功                      |
| ------ | --------------------------- | ----------------------------- | ------------------------- |
| GET    | `/api/`                     | —                             | 200，含 users 入口        |
| POST   | `/api/users`                | `{ "displayName": "小明" }`   | 201 + Location + 用户表示 |
| GET    | `/api/users?page=0&size=20` | page ≥ 0，size 1..100         | 200，分页 HAL 集合        |
| GET    | `/api/users/{id}`           | —                             | 200，用户表示             |
| PUT    | `/api/users/{id}`           | `{ "displayName": "新名称" }` | 200，同一 ID              |
| DELETE | `/api/users/{id}`           | —                             | 204，无响应体             |

支持 `application/json`、`application/hal+json` 和 `application/prs.hal-forms+json`。HAL 链接相对站点根；Location 可能被 Jersey 规范化为绝对 URI，两者解析后指向同一资源。

集合直接消费 smart-domain Pagination 的结果，仅追加创建操作。非空结果为 `_embedded.users`；空集合采用框架形式：省略 `_embedded`，保留 page/links/templates。0.3.0 零基页号，偏移大于总数为 404，等于总数允许空页；因此整页末尾可能存在指向空页的 next。HTTP 层拒绝非法参数及整数溢出，不另建分页算法或集合包装。

HAL-FORMS 首个模板为 default：集合是创建，成员是更新，并有 delete 模板。独立可写请求 Bean 提供 text/required/maxLength；不改变领域 Description 的不可变性。表示直接继承 RepresentationModel，不增加仅包装链接方法的公共父类。

非法请求/分页为 400，缺失成员为 404。坏 JSON、尾随 JSON、未知属性和错误名称类型被拒绝；失败不修改数据。`/actuator/health` 只是基础运行检查，不证明业务已验收。

## 运行与检查

启动、端口与环境步骤见 [本地开发](../../docs/howtos/local-development.md)；H2 文件路径、连接与重置边界见 [数据库 howto](../../docs/howtos/database.md)。Flyway 首次建表，正常重启保留数据；测试使用隔离内存库。

```bash
# 仓库根；本请求会写入本地资料
curl -i http://127.0.0.1:8080/api/users \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/prs.hal-forms+json' \
  -d '{"displayName":"小明"}'
```

[范例索引](../../docs/engineering/examples.md)定位源码与分层测试；[测试指南](../../docs/engineering/testing.md)定义精确命令与证据边界。API 独立真实 HTTP + mock 领域测试不替代 persistent 的 SQL/回滚或 app 的真实装配测试。文件存在不表示本次已通过；本地测试不证明生产数据库、业务权限或远程资金操作。
