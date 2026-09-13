# 本地启动与环境定位

## 环境

在仓库根操作。准备 Node.js 24 LTS、npm 10+、Python 3.10+ 和 JDK 17；真实依赖以锁文件、[根构建](../../build.gradle)、[Wrapper 配置](../../gradle/wrapper/gradle-wrapper.properties)为准。Python 校验器需要各 Skill 的 requirements.txt，不能把解释器版本符合当作依赖齐备。

```bash
node --version
npm --version
python3 --version
java -version
./gradlew --version
npm ci
```

`npm ci` 根据锁文件重建 node_modules，需可用的包仓库；不需要时不要重复安装。Gradle 使用根 Wrapper 下载并缓存配置版本，不另装 app 内 Wrapper。不使用 mavenLocal 代替可复现依赖来源。

## 启动

```bash
# 仓库根；持续运行，Ctrl-C 停止
npm run dev

# 或分开两个终端
npm run dev:backend
npm run dev:frontend
```

预期入口：

- 前端：`http://localhost:4200/`，显示用户 API 导航页。
- 后端：`http://127.0.0.1:8080/api/`，返回含 users 关系的 Root 表示。
- 健康：`http://127.0.0.1:8080/actuator/health`；健康不代表业务已验收。

```bash
curl -i http://127.0.0.1:8080/api/
curl -i http://127.0.0.1:8080/actuator/health
```

后端等价入口为 `./gradlew :backend:bootRun`。默认 local profile 绑定回环地址，CRUD 仅 local/test 注册。不得通过反向代理、隧道或监听地址变更暴露公网。

## 数据与配置

[默认配置](../../apps/backend/src/main/resources/application.properties)选择 local；[local 配置](../../apps/backend/src/main/resources/application-local.properties)使用 H2 文件库。bootRun 默认工作目录为 `apps/backend`，数据文件通常为 `apps/backend/.data/users.mv.db`；运行 jar 时相对路径按实际进程 cwd 计算。

重启保留数据，测试使用独立内存库。连接、停机备份及破坏性重置边界见 [数据库 howto](database.md)。生产 profile、数据库和身份策略未确定，不提供“修改地址即可上线”的步骤。

## 故障定位

| 现象                         | 检查                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| Java 编译或 Wrapper 启动失败 | JDK 17、Wrapper 下载、Maven 仓库与实际错误；记录为环境问题                                     |
| 端口占用                     | `lsof -nP -iTCP:8080 -sTCP:LISTEN` 或 4200；识别进程后再决定，不自动杀其他服务                 |
| 前端 `/api` 失败             | 后端是否启动，直连 curl 是否成功，Vite 代理目标与实际监听地址是否匹配                          |
| H2 文件锁                    | 是否有后端或另一个 JDBC 进程占用同一文件；先有序停止，不删除锁/数据绕过                        |
| Nx 目标或缓存异常            | 读取 Nx 输出与 backend project.json；用根 Wrapper 的精确模块命令定位，不能把缓存命中当全新执行 |

运行结果、端口和环境限制进入本次 CHECK 证据。完整检查入口见 [测试指南](../engineering/testing.md)。
