# 本地数据库操作

## 已知配置与边界

[local 配置](../../apps/backend/src/main/resources/application-local.properties)为：

- JDBC：`jdbc:h2:file:./.data/users;DB_CLOSE_ON_EXIT=FALSE`。
- 用户：`sa`；本地空密码是示例配置，不可用于生产。
- bootRun 工作目录：`apps/backend`；因此通常使用该目录的 `.data/users.mv.db`。
- [默认配置](../../apps/backend/src/main/resources/application.properties)禁用 H2 Web Console；没有已配置的 TCP 数据库服务器。

[迁移](../../libs/backend/persistent/src/main/resources/db/migration/V1__create_users.sql)由 Flyway 首次建表，现有 `app_users` 的数据归属见 [模块设计](../architecture/modules.md)。生产引擎、连接和隔离级别仍是 QA-DATABASE 缺口。

## 通过应用读写

优先使用 [用户 HTTP 契约](../../apps/backend/README.md)，它保留领域校验与事务入口。创建/修改/删除会改变本地资料，只在需要这些操作的任务中执行。

```bash
# 只读；先启动本地后端
curl -i 'http://127.0.0.1:8080/api/users?page=0&size=20'
```

## 使用 JDBC 客户端只读检查

1. 有序停止正在使用该 H2 文件的后端和其他客户端，避免多个进程争用嵌入式文件库。
2. 使用与 Gradle 实际解析版本一致的 H2 JDBC 驱动；可先在仓库根运行：

   ```bash
   ./gradlew :backend:dependencyInsight --dependency h2 --configuration runtimeClasspath
   ```

3. 在已安装的 JDBC 客户端中设置 URL：`jdbc:h2:file:/绝对仓库路径/apps/backend/.data/users;IFEXISTS=TRUE;ACCESS_MODE_DATA=r`。使用绝对路径且不追加 `.mv.db`，避免工作目录错误或自动创建空库。
4. 用户 `sa`，本地空密码；执行只读查询，例如 `SELECT id, display_name FROM app_users ORDER BY id`。
5. 关闭连接后再启动后端。客户端/驱动未安装时明确环境缺口，不承诺命令可以直接运行。

不启用 H2 控制台或 TCP 服务来绕过文件锁，也不通过直接 SQL 写入绕过领域契约。

## 测试数据库

```bash
# 仓库根；真实 H2/MyBatis/XML/Flyway 与事务检查
./gradlew :backend-persistent:test
./gradlew :backend:test
```

测试配置在 [persistent 测试资源](../../libs/backend/persistent/src/test/resources/application-test.properties)与 [app 测试资源](../../apps/backend/src/test/resources/)，不连接本地文件库。H2 测试不证明生产方言、隔离级别或并发模型已通过。

## 备份与重置

备份前先停止所有使用该库的进程，核对实际 cwd 与数据库文件；将文件复制到用户指定的安全位置。重置会永久删除本地资料，只在单独明确授权并确认备份后操作指定文件，不提供默认执行的删除命令，不触及其他数据库或业务证据。
