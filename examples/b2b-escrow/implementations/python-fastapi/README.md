# FastAPI 担保履约参考服务

自包含的 Python HTTP 工程，可以单独复制到任意目录。构建和原生测试不依赖父目录、模型文件、验收期望或 Evidence 包。内存状态仅用于隔离参考验收，不是生产支付系统。

## 环境与运行

Python **3.12+**、uv；`pyproject.toml` 固定直接依赖，`uv.lock` 锁定完整依赖树（包括开发依赖）。

```sh
uv sync --frozen --python 3.12
uv run --frozen pytest -q
uv run --frozen ruff check app tests
uv run --frozen ruff format --check app tests
uv run --frozen python -m app.main --test-mode --port 8083
```

- `--port 0` 分配空闲端口并输出一行 JSON `{"host":"http://127.0.0.1:<port>"}`。
- `--mode v1|v2` 默认 v2；v1 不开放里程碑路由。
- 必须显式 `--test-mode`，只绑定回环地址。`x-evidence-role` / `x-evidence-asof` 仅用于隔离测试，不是生产鉴权或可信的外部时钟。非法整秒 UTC 时间返回 400，缺少身份返回 401，越权返回 403；未传时间时使用当前 UTC。
- `--fault none|accept-derived|extra-field|clock|precision`：默认 `none`，未知值启动失败。仅在测试模式下模拟接受 caller 派生值、泄漏字段、忽略合法注入时钟或经 float 丢失整数精度；不改变正常账本算法，保留身份与时钟格式校验。
- Uvicorn 接收 SIGINT / SIGTERM 退出。每次全量验收和每个 gate 均需干净进程；账本重启即清空。

## v6 HTTP 契约

合同集合为 `/agreements`、`/escrows`、`/fulfillments`、`/settlements`，均支持 GET 列表和 POST 签署。合同实例通过 `/{collection}/{contractId}` 读取。

履约项使用合同下的业务复数集合，例如 `POST /agreements/{contractId}/orders`；GET 同一路径返回订单请求集合，GET `…/orders/{orderId}` 读取请求。POST `…/orders/{orderId}/confirmation` 登记确认，`201 Location` 和 HAL `self` 指向顶层 `GET /order-confirmations/{orderConfirmationId}`。交付集合为 `deliveries`，其余履约项使用 `commitments`、`deposit-locks`、`custody-statements`、`acceptances`、`first-milestones`、`final-milestones`、`milestone-acceptances`、`releases`、`settlement-receipts`、`milestone-releases`、`milestone-statements`。

每个正常 POST 的 201 `Location` 与 `_links.self.href` 指向同一可 GET 的主 URI。集合以 `application/hal+json` 返回 `_links.self`、`_embedded.<集合名>` 数组和 `total`；空集合返回空数组与 0。合同读取沿用签署角色，履约项集合/请求读取使用请求方角色，确认读取使用确认方角色。

## 结构与语义

- `app/api.py`：FastAPI 路由、错误归一化、HAL / Location 输出以及有界请求读取。
- `app/context.py`：纯 ASGI 中间件 + `ContextVar`，请求结束始终 reset，不修改全局时间或在请求间共用角色。
- `app/domain.py`：Pydantic v2 `strict=True` / `extra='forbid'`，明确区分布尔与整数；禁止 caller 回填派生值和服务时间。
- `app/service.py`：合同、托管、单次/两期交付、验收、最终分账与前置依赖检查。
- `app/ledger.py`：内存适配器，`RLock` 覆盖完整 check + commit；ID / 确认 / 放款唯一性，返回深拷贝。

金额为 **CNY 整数分**，费率为基点；Python 任意精度整数用于中间计算，检查 signed int64 结果，half-up 舍入。超过 2^53−1 的 JSON 整数以精确十进制字符串传入和返回，不能先转 float。此契约不是 Decimal JSON 字符串金额模型。

原生测试独立构造业务数据，覆盖整数边界、精度与封顶守恒、截止时间、身份/字段校验、时钟并发隔离、跨订单凭证、过期请求、GET 以及并发放款（一个 201、一个 409）。不读取外部测试断言来生成响应。

`tests/test_faults.py` 也验证四种故障可观察、默认无故障、未知故障失败关闭以及测试模式保护。float 转换只用于刻意损坏响应的测试分支，不用于正常金额算法。

## 外部验收

启动服务后，由有 Evidence CLI 的终端对接收到的标准契约目录运行：

```sh
evidence test --target http://127.0.0.1:8083 --scenarios "$CONTRACTS" --strict-drift
```

`CONTRACTS` 只是验收输入，不参与安装、构建或原生测试。通过表示已执行的 HTTP 流程符合契约，不证明未执行状态、浏览器 UI 或生产安全。持久化、真实认证与银行支付都未实现。
