# Spring Boot 担保履约参考服务

自包含的 Java 工程。只需复制本目录，便能独立编译、测试、打包与启动；不读取父目录、Evidence 模型/断言或其他仓库代码。内存账本用于隔离测试，不是生产资金托管服务。

## 环境与运行

**JDK 21**（`JAVA_HOME` 指向 JDK）、Spring Boot **3.3.13**。自带 Maven Wrapper **3.3.2**，固定 Maven **3.9.9** 并校验分发包 SHA-256；不要求预装 Maven。首次运行需访问 Maven Central。父 POM 固定传递依赖版本。

```sh
./mvnw -B verify
java -jar target/escrow-0.1.0.jar --test-mode --port 8082
# Windows 使用 mvnw.cmd -B verify
```

- `--port 0` 选择空闲端口，启动后 stdout 输出 JSON `{"host":"http://127.0.0.1:<port>"}`。
- `--mode v1|v2` 默认 v2；v1 不开放里程碑操作。
- 必须显式 `--test-mode`，仅监听 `127.0.0.1`。`x-evidence-role` 是测试身份；`x-evidence-asof` 是整秒 UTC 测试时钟。身份缺失返回 401，越权 403，非法时钟 400。没有时钟头时使用当前 UTC。
- `--fault none|accept-derived|extra-field|clock|precision`：默认 `none`，未知值启动失败。仅在测试模式下模拟接受 caller 派生值、泄漏字段、忽略合法注入时钟或经 double 丢失整数精度；不改变正常账本算法，保留身份与时钟格式校验。
- SIGINT / SIGTERM 关闭 Spring 上下文。每次全量 HTTP 验收、每个 gate 使用新进程，内存账本不会自动复位。

## v6 HTTP 契约

合同集合为 `/agreements`、`/escrows`、`/fulfillments`、`/settlements`，均支持 GET 列表和 POST 签署。合同实例通过 `/{collection}/{contractId}` 读取。

履约项使用合同下的业务复数集合，例如 `POST /agreements/{contractId}/orders`；GET 同一路径返回订单请求集合，GET `…/orders/{orderId}` 读取请求。POST `…/orders/{orderId}/confirmation` 登记确认，`201 Location` 和 HAL `self` 指向顶层 `GET /order-confirmations/{orderConfirmationId}`。交付集合为 `deliveries`，其余履约项使用 `commitments`、`deposit-locks`、`custody-statements`、`acceptances`、`first-milestones`、`final-milestones`、`milestone-acceptances`、`releases`、`settlement-receipts`、`milestone-releases`、`milestone-statements`。

每个正常 POST 的 201 `Location` 与 `_links.self.href` 指向同一可 GET 的主 URI。集合以 `application/hal+json` 返回 `_links.self`、`_embedded.<集合名>` 数组和 `total`；空集合返回空数组与 0。合同读取沿用签署角色，履约项集合/请求读取使用请求方角色，确认读取使用确认方角色。

## 结构与边界

- `Application`：参数与服务器生命周期，严格 Jackson JSON 配置。
- `RequestContextFilter`：`OncePerRequestFilter` + `ThreadLocal`，`finally` 清理；只支持当前同步 Servlet 处理，不宣称上下文可自动传播到线程池 / Reactor。
- `EscrowController`：HTTP 寻址、角色准入、请求大小限制、HAL / Location 与错误输出；不直接暴露内部实体。
- `EscrowService`：合同、托管、交付、验收和分账。内存事务由 synchronized 覆盖校验和提交；不可变凭证防止读者篡改。持久化适配器必须替换为数据库事务、唯一键和订单级放款保护。
- `Money`：严格 signed int64 / UTC 边界，`BigInteger` 精确中间运算，明示 half-up 舍入。

金额为 **CNY 整数分**，费率为基点。不使用 double 或擅自将契约改为 Decimal 金额。大于 JSON 安全整数的合法值使用精确十进制字符串；保留必填零值，派生值与服务时间不接受 caller 输入。单次和两期交付模式不可混用，跨合同凭证必须关联同一订单，48 小时请求有效期及不可逆放款需真实实施。

`./mvnw verify` 包含原生 JUnit / Spring MockMvc 测试：金额精度、半分舍入、封顶、时间边界、严格输入、缺身份/越权、跨订单凭证、请求时钟隔离、并发放款（一个 201、一个 409）、默认关闭测试头，以及 v1 路由边界。外部真实进程 HTTP 验收另行执行：

```sh
evidence test --target http://127.0.0.1:8082 --scenarios "$CONTRACTS" --strict-drift
```

`CONTRACTS` 是外部提供的标准 suite 目录，不参与本工程构建。通过只说明已执行的用例符合契约，不证明生产身份、所有状态或浏览器交互。

原生 `FaultTest` 单独覆盖四种故障、默认无故障、未知故障失败关闭和测试模式保护。double 转换只存在于刻意损坏响应的测试分支，不用于正常金额算法。

## Wrapper 来源

`mvnw` / `mvnw.cmd` 来自 Apache Maven Wrapper 3.3.2 的 `only-script` 分发包（Apache-2.0；脚本内保留许可证）。Unix 脚本仅对 checksum 命令补充显式 stdin 参数：`sha256sum -c -`，兼容较新 macOS 的 `sha256sum`，仍校验同一固定 SHA-256；没有关闭校验或自动下载仓库私有工具。
