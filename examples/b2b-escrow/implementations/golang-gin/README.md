# Gin 担保履约参考服务

自包含的 Go HTTP 工程，可将本目录复制到任意位置独立构建和测试。只依赖 Go 模块，不读取模型、验收期望或仓库源文件；不需要 Evidence 运行时。它是内存账本参考实现，不是银行或生产支付服务。

## 环境与运行

Go **1.22+**（支持该版本的原生编译工具链）。`go.mod` 固定 Gin 版本，`go.sum` 校验传递依赖。

```sh
go mod download
go test -race ./...
go vet ./...
go build -o build/escrow ./cmd/server
./build/escrow --test-mode --port 8081
# 也可以 go run ./cmd/server --test-mode --port 8081
```

较新 macOS 若使用旧 Go 出现 `missing LC_UUID`，请升级受支持的 Go，或安装 Xcode Command Line Tools 后用 `go build -ldflags=-linkmode=external` / `go test -race -ldflags=-linkmode=external ./...`。

- `--port 0`：系统分配端口；启动后 stdout 输出一行 `{"host":"http://127.0.0.1:<port>"}`。
- `--mode v1|v2`：默认 v2；v1 不注册里程碑路由，其他行为不变。
- `--test-mode`：必须显式指定，只绑定 `127.0.0.1`。`x-evidence-role` 是测试身份，不是生产认证；`x-evidence-asof` 是整秒 UTC 测试时钟。非法时间返回 400，缺身份 401，越权 403。未传时钟则读取当前 UTC。
- `--fault none|accept-derived|extra-field|clock|precision`：默认 `none`，未知值启动失败。仅在显式测试模式中模拟接受 caller 派生值、泄漏字段、忽略合法注入时钟或经 float64 丢失整数精度；不改变正常账本算法。每种故障保留原有身份与时钟格式校验。
- SIGINT / SIGTERM 优雅退出。每次验收或 gate 都须启动干净进程，重启丢失所有内存状态。

## 工程边界

- `cmd/server/`：参数、回环监听和生命周期。
- `internal/httpapi/`：Gin 路由、请求上下文、身份与严格输入边界、HAL 响应。
- `internal/domain/`：凭证账本、因果前置条件和整数金额计算。一个互斥锁覆盖检查与提交，保护 ID、确认及订单放款唯一性；GET 返回副本。

金额为 **CNY 整数分**，费率为基点。`math/big.Int` 计算中间值，输出检查 signed int64，half-up 舍入；超过 JSON 安全整数范围的金额必须用十进制字符串传输。不能用 float64 计算，也不需要引入小数库来改变契约。单次完整交付和两期交付互斥；托管、验收必须关联同一订单，确认不得早于请求或超过 48 小时有效期。

原生测试覆盖半分舍入、精确大整数、罚金封顶与守恒、时间边界、字段与身份校验、GET、跨订单关联、时钟并发隔离、过期请求及并发放款（一个 201，一个 409）。真实 HTTP 的契约一致性由外部验收验证，不能用这些原生测试代替。

原生测试也验证四种故障确实可观察、默认模式不注入故障、未知故障失败关闭，以及未启用测试模式时故障不能绕过保护。故障模式中的 float64 仅为刻意制造的错误，不能用于正常金额计算。

## 外部黑盒验收

在安装了 Evidence CLI 的环境执行（`CONTRACTS` 指向外部提供的标准验收目录，不是本工程的构建依赖）：

```sh
evidence test --target http://127.0.0.1:8081 --scenarios "$CONTRACTS" --strict-drift
```

验收覆盖声明的流程，不代表所有状态、生产安全或浏览器交互都已验证。持久化需另行实现事务和唯一约束；此工程不接真实支付、不提供生产身份供应商。
