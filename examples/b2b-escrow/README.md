# B2B 担保采购与里程碑履约

> 阶段四：四个独立框架实现（Gin / Spring Boot / FastAPI / Fastify）支持故障注入、真实 HTTP 红绿验证与 v1/v2 双门禁演练。尚无本案例的浏览器 UI / E2E；多语言 CI 矩阵留给阶段五。

本案例用三个独立参与方、四份双边合同，描述「锁定商业条款 → 全额资金托管 → 交付与买方验收 → 托管方终态分账」。重点不是增加 CRUD，而是明确每项事实的形成方、跨合同凭证依据、金额计算和时间边界。

## 资产与边界

```text
model/
  b2b-escrow-v1.evidence.json   # 冻结基线：单次完整交付
  b2b-escrow.evidence.json      # v2：保留基线，新增可选的两阶段里程碑交付
generated/                    # evidence export 生成；禁止手改，提交 Git
  openapi.json
  acceptance.stepci.yml
```

两个 Bundle 是可编辑源；`generated/` 只对应当前 v2。v1 的验收套件在后续 regression 门禁中由基线模型重新编译，不复制成另一份手工维护的 YAML。Tree 与 Bundle 都是框架支持的源格式，本案例选择 Bundle 以便独立分发；这不是移除 Tree 格式支持。

四个实现（Gin、Spring Boot、FastAPI、Fastify）各自自包含、互不知道对方存在，不共享运行时代码、数据库、拦截器或构建配置。实现不得读取本模型的 examples 或导出的断言值来伪造响应。每个工程都有自己的依赖清单与原生测试，可单独复制安装、构建、启动和测试；都不属于框架 pnpm workspace。外部验收只使用统一契约和目标 HTTP 地址，不要求四种服务同时启动，也不要求单个开发者安装全部语言环境。

## 四份双边合同与三方角色

FM 的一份合同恰有两个 contextual Party Roles，不能把三个签约角色硬塞进同一份合同：

| Context               | 合同双方      | 双向主要履约（权利方请求 → 责任方确认）                            |
| --------------------- | ------------- | ------------------------------------------------------------------ |
| `context.procurement` | 买方 / 卖方   | 买方请求订单确认，卖方形成条款凭证；卖方请求买方确认采购承诺       |
| `context.escrow`      | 买方 / 托管方 | 买方请求锁款，托管方确认全额托管；托管方请求买方确认托管对账单     |
| `context.fulfillment` | 买方 / 卖方   | 买方请求交付，卖方记录交付数量；卖方请求验收，买方形成最终验收凭证 |
| `context.settlement`  | 卖方 / 托管方 | 卖方请求放款，托管方形成分账凭证；托管方请求卖方确认分账对账单     |

`party.buyer`、`party.seller`、`party.escrow` 是真实参与方，同一参与方可在多份合同中扮演不同的 contextual Role。订单确认、托管确认、交付确认和验收确认通过 `references` 跨 Context 传递，不直接跨合同引用另一张根合同。

后续合同请求体显式传入 `order_confirmation_id`、`deposit_confirmation_id`、`acceptance_confirmation_id` 等凭证标识。服务必须解析、鉴权并检查它们属于同一业务订单，**不能根据 ID 命名约定或全局“最近一单”猜测关联关系**。样例中的 ID 是调用方提交的业务 ID；路径参数从上游 HTTP 响应捕获。

## 确定性金额与时间语义

### 金额

- 币种固定为 **CNY**，全部金额为「分」的 CEL `int`；费率为基点（10000 bps = 100%）。不使用 CEL `decimal` / double 模拟任意精度十进制。
- 订单数量达到 `tier_threshold` 时，**整单**采用第二档单价，不是分段累进阶梯价。
- `subtotal = quantity × selected_unit_price_minor`。
- `gross = half_up(subtotal × (10000 + tax_bps) / 10000)`。
- `retention = half_up(gross × retention_bps / 10000)`。
- `raw_penalty = half_up(gross × late_days × daily_penalty_bps / 10000)`。
- `late_penalty = min(raw_penalty, gross - retention)`；`payout = gross - retention - late_penalty`。
- 总账恒等式：`gross = retention + late_penalty + payout`。罚金封顶保留质保金，实付款最低为零。

每个结果属性都有反向关联的 `derivedByRuleRef`。舍入只发生在上述明确的步骤；规则用商和余数计算基点乘法，避免先做 `gross × 10000` 导致中间结果溢出。输入和结果必须落在 signed int64；超出 JavaScript 安全整数范围的合法值以**精确十进制字符串**跨 JSON 传递，前端也不能转成 `number` 后再提交。

此案例托管的是**全额 gross**，不是仅 20% 定金；否则最终放款会缺少剩余资金的事实来源。质保金和罚金留在托管账上；质保到期释放、真实银行支付、争议仲裁与退款补偿是后续扩展，不宣称已实现。

### 时钟与不可逆确认

- `signed_at`、`started_at`、`confirmed_at` 由服务形成，不接受请求体回填。
- 每份履约请求的 `expired_at` 显式派生为 `started_at + 48h`，不是客户端可任填的截止时间。
- `delivery_deadline` 是买卖双方协商的合同参数，由卖方订单确认凭证固化，和服务端形成时刻不同。
- 罚金起算点为**买方最终验收**相对约定 deadline 的偏差：在截止时刻或之前为 0，之后每开始一个 24 小时区间记 1 天。例子覆盖恰好到期、晚 1 秒、晚 15 天。
- 本阶段样例使用整秒 UTC；当前 CEL timestamp 的 JSON 归一化输出为整秒，不借此宣称支持任意亚秒精度。
- 非法派生值输入与回填时间戳分别声明为 422；成功确认后再用新 ID 重复放款声明为 409。实现需在事务中保证同一请求只产生一次不可逆结果；单次交付和里程碑结算不能对同一订单重复放款。

测试头 `x-evidence-asof` 和 `x-evidence-role` **仅用于可信的隔离测试环境**，不是生产鉴权或可信时钟。生产必须关闭外部时钟覆盖，身份由真实认证凭据解析；收到客户端自报的角色不能直接视为已授权。

## v1 / v2 与样例覆盖

v1 已覆盖四份合同的完整单次交付与一次性结算。v2 **只新增可选履约**：卖方分别形成首期和末期两份交付事实，买方对总数量作最终验收，再由托管方一次性分账。固定两期是本案例的明确范围，不冒充任意多期分账引擎。原有 v1 条款、路由、规则、验收流程保持不变，不能把所有旧订单强制改成分期才能通过。

| Flow                  | 集合       | 主要边界                                        | gross / retention / penalty / payout（分）                                 |
| --------------------- | ---------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| `single-on-time`      | regression | 999 件，低于阶梯阈值；恰好到期；零罚金          | 1466402 / 73320 / 0 / 1393082                                              |
| `single-late`         | regression | 1000 件，达到阶梯阈值；逾期 15 天；半分向上舍入 | 1354870 / 67744 / 203231 / 1083895                                         |
| `milestone-on-time`   | DoD        | 500 + 500 件；最终验收恰好到期                  | 1354870 / 67744 / 0 / 1287126                                              |
| `milestone-precision` | DoD        | 1 + 1 件；大于 2^53 的精确金额；晚 1 秒计一天   | 22600000000000002 / 1130000000000000 / 226000000000000 / 21244000000000002 |
| `milestone-capped`    | DoD        | 500 + 501 件；罚金封顶；必填 payout 显式为 0    | 1356225 / 67811 / 1288414 / 0                                              |

当前导出 **47 个 HTTP endpoints、5 个 flows、121 个 steps**。每个 flow 独立创建业务记录，没有跨 flow 依赖；两个单次交付流程保留在 v1 和 v2。每个 flow 独立测试派生金额篡改、服务时间回填、成功放款、重复确认。阶段二的真实进程验收执行这些步骤；这不是对未覆盖状态、所有 GET 路由或浏览器交互的完整性证明。

约束规则还表达了正数数量、合法费率、足额锁款、完整交付等前置与完成条件。它们是实现的业务要求；现有 HTTP suite **不会自动把所有 bool 规则变成探测流量**。当前投影器要求样例 acting role 属于 route 允许的角色，而且通用响应模板未声明 403，因此本阶段**没有伪造已导出的越权 403 测试**。本阶段通过 Fastify 原生测试覆盖权限、请求时钟隔离、跨订单凭证关联、范围校验和并发放款。持久化尚未实现；如需统一导出越权、缺凭证和其他负向样例，应先显式扩展契约与投影能力。

## 阶段一复现

在仓库根目录执行，仅使用现有 Node / pnpm 工具链：

```sh
pnpm exec nx build cli

pnpm evidence check examples/b2b-escrow/model/b2b-escrow-v1.evidence.json \
  --scope context.procurement --scope context.escrow \
  --scope context.fulfillment --scope context.settlement --json
pnpm evidence check examples/b2b-escrow/model/b2b-escrow.evidence.json \
  --scope context.procurement --scope context.escrow \
  --scope context.fulfillment --scope context.settlement --json

# 开发时生成并提交；CI 只读验证，不替作者修复产物。
pnpm evidence export --model examples/b2b-escrow/model/b2b-escrow.evidence.json \
  --out examples/b2b-escrow/generated
pnpm evidence export --model examples/b2b-escrow/model/b2b-escrow.evidence.json \
  --out examples/b2b-escrow/generated --verify

# 模型、CEL 预期、基线集合与生成字节回归；不会启动后端。
pnpm exec vitest run --config libs/evidence-acceptance/vitest.config.mts src/b2bEscrow.spec.ts

# 可选：HTTP 兼容性检查须先显式准备 pinned oasdiff。
pnpm api:setup
pnpm evidence diff examples/b2b-escrow/model/b2b-escrow-v1.evidence.json \
  examples/b2b-escrow/model/b2b-escrow.evidence.json --format markdown
```

## 阶段二：独立工程与真实 HTTP 验收

框架仓库根目录执行：

```sh
pnpm example:setup  # 安装独立冻结锁文件并构建，不改变框架 workspace
pnpm example:test   # Fastify 工程自身的原生测试
pnpm exec nx build cli
node examples/b2b-escrow/implementations/ts-fastify/dist/server.js --test-mode --port 8085
# 另一个终端：
pnpm evidence test --target http://127.0.0.1:8085 \
  --scenarios examples/b2b-escrow/generated --strict-drift --verbose
```

原生工程说明见 [ts-fastify/README.md](implementations/ts-fastify/README.md)。服务只监听回环地址，必须显式启用 `--test-mode`；不将测试头冒充生产安全机制。状态暂存内存，**每次全量验收、每个 gate 都启动新进程**，不能重复使用已放款账本。

### v1 / v2 双门禁

将启动参数改为 `--mode v1`，分别启动干净进程执行：

```sh
pnpm evidence test --target http://127.0.0.1:8085 \
  --scenarios examples/b2b-escrow/generated --gate regression \
  --baseline-model examples/b2b-escrow/model/b2b-escrow-v1.evidence.json --strict-drift
# 重启后再运行；v1 对里程碑步骤返回 404，DoD 应失败。
pnpm evidence test --target http://127.0.0.1:8085 \
  --scenarios examples/b2b-escrow/generated --gate dod \
  --baseline-model examples/b2b-escrow/model/b2b-escrow-v1.evidence.json
```

v1 regression 为两个原有流程、46 步；DoD 为三个新增里程碑流程、75 步。改为 `--mode v2` 后分别重启运行，两套 gate 均应通过。`--allow-pending` 仅用于显式开发探索，报告仍保留失败；CI 不使用它。支持 `--fault amount|clock|extra-field|missing-derived|accept-derived|precision` 做负向演练，不要求不同语言拥有相同内部代码或诊断文案。

### 存量迁移与范围

- 旧 `dogfood-backend/`、转发 shim 和旧治理产物已移除，不保留兼容启动入口。
- 采购/定金小模型移至 `libs/evidence-model-core/tests/fixtures/acceptance/`，仅供叙事、哈希和导出等框架回归使用；真实 HTTP 验收及 CI 使用本案例。
- GitHub/GitLab 门禁目前使用本契约与 Fastify 服务；每个 gate 独立进程。新增语言尚未纳入 CI 矩阵，自定义浏览器客户端及浏览器 E2E 留给后续阶段。
- 后端契约通过只证明已执行用例，不代表前端 E2E 失败一定是前端问题；排障仍需结合浏览器、网络、测试数据和服务日志。

## 阶段三：独立多语言工程

框架自身仍只需要 Node / pnpm。以下语言环境是可选的示例工具链，不进入根 workspace、根安装或框架常规测试；只安装准备运行的那一种即可。

| 工程                                                       | 环境与依赖管理                                   | 原生测试 / 构建（在工程内执行）                                |
| ---------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| [golang-gin](implementations/golang-gin/README.md)         | Go 1.22+；`go.mod` + `go.sum`                    | `go test -race ./...` / `go build -o build/escrow ./cmd/server`  |
| [java-spring](implementations/java-spring/README.md)       | JDK 21；固定 Spring Boot 3.3.13 与 Maven Wrapper | `./mvnw -B verify`                                             |
| [python-fastapi](implementations/python-fastapi/README.md) | Python 3.12+ / uv；`uv.lock`                     | `uv sync --frozen --python 3.12` / `uv run --frozen pytest -q` |
| [ts-fastify](implementations/ts-fastify/README.md)         | Node / pnpm；独立锁文件                          | `pnpm install --frozen-lockfile && pnpm test`                  |

### 任意选择一个服务启动

以下命令均从仓库根目录执行，分别在独立终端运行，不需要互相调用或同时启动：

```sh
(cd examples/b2b-escrow/implementations/golang-gin && \
  go run ./cmd/server --test-mode --port 8081)

(cd examples/b2b-escrow/implementations/java-spring && \
  ./mvnw -B verify && java -jar target/escrow-0.1.0.jar --test-mode --port 8082)

(cd examples/b2b-escrow/implementations/python-fastapi && \
  uv sync --frozen --python 3.12 && \
  uv run --frozen python -m app.main --test-mode --port 8083)
```

在另一个终端，从仓库根目录使用同一套验收，仅修改目标地址（8081 / 8082 / 8083 / 8085）：

```sh
pnpm evidence test --target http://127.0.0.1:8081 \
  --scenarios examples/b2b-escrow/generated --strict-drift --verbose
```

三个新增实现提供 `--test-mode`、`--port`（包括 0）和 `--mode v1|v2`，启动报告目标 URL，且都只绑定回环。阶段四已补齐 `accept-derived`、`extra-field`、`clock`、`precision` 四种显式故障模式，未知故障仍会直接拒绝，不以忽略参数冒充已实现。

本阶段金额以各语言原生的任意精度整数实现（Go `math/big.Int`、Java `BigInteger`、Python `int`），而不是照搬早期方案里的浮点 / Decimal 金额；这遵守本案例已经冻结的整数分契约。三个工程的原生测试各自构造业务事实，覆盖严格输入、角色边界、精确金额、时钟隔离、跨订单关联、请求过期及并发放款唯一性。服务不读取模型或验收期望，也没有跨实现依赖。

各工程可复制出仓库单独构建、运行和测试。只有做外部 HTTP 验收时才需要另外接收 `generated/` 中的标准契约与 Evidence CLI。状态依然是内存账本；每次全量运行或 gate 重启服务，不能重复使用已放款订单。持久化、生产身份与浏览器 UI / E2E 不在阶段三范围内。

## 阶段四：故障注入与双门禁红绿演练

每个工程独立实现故障分支，不共享中间件，也不读取模型/预期值。`--fault none` 保持精确整数分算法；四种故障仅在显式 `--test-mode` 下可用，不绕过身份、角色或时钟格式检查。

| 故障 | 故意损坏的行为 | 外部验收必须观察到的失败证据 |
| --- | --- | --- |
| `accept-derived` | 结算确认直接接受 caller 提交的 `payout_minor` 并回显，不提交账本 | 原应返回 422 的确认实际返回 201 |
| `extra-field` | HAL 响应额外返回 `unmodeled: true` | strict drift 的 `extraneous_field`，路径 `/unmodeled` |
| `clock` | 校验时钟头后丢弃其值，错误使用当前 UTC | 201 响应中的 `signed_at` 与声明预期不符 |
| `precision` | 响应整数经过 binary64 后再编码，丢失大整数低位 | `milestone-precision` 的 `tier1_unit_price_minor` 精确值不符 |

精度故障模拟的是序列化边界损坏，不把正常金额算法改成浮点，也不再用 `0.1 + 0.2` 演示已经冻结的整数分契约。strict drift 只检查已观察到的响应，开放 map 仍按契约保持开放；不宣称检查了所有路由或所有状态。

### 自动验证（外部观察者，不是工程依赖）

先按上面的各工程说明完成原生测试与构建。构建 CLI：`pnpm exec nx build cli`。然后从仓库根目录选一种实现运行；只需要这一种语言的环境：

```sh
# 验证器本身的判定逻辑测试（不启动服务）
node --test examples/b2b-escrow/verification/expectations.test.mjs

# 每个场景自动启动新进程，使用空闲端口，执行后关闭
node examples/b2b-escrow/verification/run.mjs --implementation ts-fastify
# 也可选择 golang-gin / java-spring / python-fastapi

# 已安装并构建四种环境时才执行 all；这不是根 pnpm test 的先决条件
node examples/b2b-escrow/verification/run.mjs --implementation all
```

验证器使用构建好的 `golang-gin/build/escrow`、`java-spring/target/escrow-0.1.0.jar`、`python-fastapi/.venv/bin/python` 与 `ts-fastify/dist/server.js`（Windows 对应 `.exe` / `Scripts/python.exe`）。Java 使用 `JAVA_HOME/bin/java`，未设置时使用 PATH。它不安装依赖、不替实现构建、不生成或修改契约；先通过 `export --verify` 确认生成物新鲜。

每种实现执行 **11 个独立场景**：

| 场景 | CLI 退出码 | 必须验证的结果 |
| --- | --- | --- |
| v2 全量、无故障、strict drift | 0 | 5 flows / 121 步全部真实通过 |
| v1 regression、strict drift | 0 | 2 flows / 46 步基线通过 |
| v1 DoD | 1 | 3 flows / 75 步；新里程碑路由 404，后续依赖跳过 |
| v1 DoD、显式 `--allow-pending` | 0 | 仍然 `passed=false`、`pending=true`，不得称为验收已通过 |
| v2 regression / DoD、strict drift（各一次） | 0 | 分别 46 / 75 步全部通过 |
| 四种故障、v2 全量、strict drift（各一次） | 1 | 各自出现上表指定失败证据，不能只看非零退出码 |
| 字段漂移 + DoD + strict drift + allow-pending | 1 | strict drift 不可被 pending 豁免，`pending=false` |

每轮默认在临时目录保存报告，并打印绝对路径；可用 `--report-dir <全新目录>` 指定位置（拒绝覆盖旧目录）。每个场景保留同一次执行的 CLI JSON / Markdown / JUnit、完整 stdout/stderr 与后端日志，顶层 `summary.json` 记录 `expectationMet`。**汇总验证成功表示预期红绿都得到证实，不是把故障服务报告成 passed**。启动失败、超时、空执行、非预期 500 或错误的失败原因都判本轮失败；服务与 CLI 均有超时清理，验证被中断时也不会继续运行后续场景。

这套验证器只作为仓库外部观察者了解各启动命令；四个实现本身仍互不感知，可单独提取。框架常规测试不新增 Go / Java / Python 工具链要求，多语言 CI 自动构建矩阵和统一编排仍属于阶段五。
