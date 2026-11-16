# B2B 担保采购与里程碑履约

> 阶段一：模型与契约基线。**尚无本案例的真实后端实现，也尚未完成 HTTP / 浏览器 E2E 验收。**

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

四个后续实现（Gin、Spring Boot、FastAPI、Fastify）必须各自自包含、互不知道对方存在，不共享运行时代码、数据库、拦截器或构建配置。实现可以只收到契约交付物；不得读取本模型的 examples 或导出的断言值来伪造响应。阶段一没有新增任何语言运行时要求。

## 四份双边合同与三方角色

FM 的一份合同恰有两个 contextual Party Roles，不能把三个签约角色硬塞进同一份合同：

| Context | 合同双方 | 双向主要履约（权利方请求 → 责任方确认） |
| --- | --- | --- |
| `context.procurement` | 买方 / 卖方 | 买方请求订单确认，卖方形成条款凭证；卖方请求买方确认采购承诺 |
| `context.escrow` | 买方 / 托管方 | 买方请求锁款，托管方确认全额托管；托管方请求买方确认托管对账单 |
| `context.fulfillment` | 买方 / 卖方 | 买方请求交付，卖方记录交付数量；卖方请求验收，买方形成最终验收凭证 |
| `context.settlement` | 卖方 / 托管方 | 卖方请求放款，托管方形成分账凭证；托管方请求卖方确认分账对账单 |

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

| Flow | 集合 | 主要边界 | gross / retention / penalty / payout（分） |
| --- | --- | --- | --- |
| `single-on-time` | regression | 999 件，低于阶梯阈值；恰好到期；零罚金 | 1466402 / 73320 / 0 / 1393082 |
| `single-late` | regression | 1000 件，达到阶梯阈值；逾期 15 天；半分向上舍入 | 1354870 / 67744 / 203231 / 1083895 |
| `milestone-on-time` | DoD | 500 + 500 件；最终验收恰好到期 | 1354870 / 67744 / 0 / 1287126 |
| `milestone-precision` | DoD | 1 + 1 件；大于 2^53 的精确金额；晚 1 秒计一天 | 22600000000000002 / 1130000000000000 / 226000000000000 / 21244000000000002 |
| `milestone-capped` | DoD | 500 + 501 件；罚金封顶；必填 payout 显式为 0 | 1356225 / 67811 / 1288414 / 0 |

当前导出 **47 个 HTTP endpoints、5 个 flows、121 个 steps**。每个 flow 独立创建业务记录，没有跨 flow 依赖；两个单次交付流程保留在 v1 和 v2。每个 flow 独立测试派生金额篡改、服务时间回填、成功放款、重复确认。数字是**声明/编译数量，不是已执行通过数量**。

约束规则还表达了正数数量、合法费率、足额锁款、完整交付等前置与完成条件。它们是实现的业务要求；现有 HTTP suite **不会自动把所有 bool 规则变成探测流量**。当前投影器要求样例 acting role 属于 route 允许的角色，而且通用响应模板未声明 403，因此本阶段**没有伪造已导出的越权 403 测试**。后续实现需有原生权限/事务/并发/持久化测试；如需统一导出越权、缺凭证和其他负向样例，应先显式扩展契约与投影能力。

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

后续实现就绪后，才可针对真实 `--target` 执行 `evidence test --strict-drift`。本阶段保留现有 `examples/acceptance/`、`examples/dogfood-backend/` 和治理产物，避免在阶段二替换并迁移测试之前使现有 CI 失效；仅移除无引用的 `procurement-breach.evidence.json`。历史 `examples/.evidence/` 在本阶段开始时已不存在，无需删除，也不应为清理而重建。
