# 履约建模业务模式提取

在模型包含多个合同、渠道、角色化确认，或用户希望构建平台／中台与复用能力时读取本文件。业务模式不是技术模板；它描述一种运营特定、领域中立的履约责任脊梁，以及其中可替换的变化点。

## 提取顺序

1. **找业务脊梁**：从收入、支出、KPI、合规或风险链中选出能够解释业务价值的 Fulfillment。
2. **找运营不变量**：说明跨案例保持不变的权利、义务、完成证明和违约后果。
3. **找变化点**：优先选择 Evidence Role、Domain Role、Third-party Role、Context Role、Pre-contract Context 或 Fulfillment Context。
4. **隔离领域输入**：列出被业务模式消费的 Domain Context、Thing 或 Domain Role，不把具体领域对象误写成业务不变量。
5. **提出领域中立主张**：说明替换领域输入后，为什么履约责任脊梁仍可能成立。
6. **分级复用证据**：一个领域案例只能产生候选；至少两个合同上下文和两个领域上下文才能支持复用；具名业务方确认后才能标为 confirmed。

## Schema v3 产物

每个模式写入独立的 `business-patterns/*.yaml`：

```yaml
type: business_pattern
id: pattern.multi-channel-payment
label: 多渠道付款确认
businessGoals:
  - revenue
  - risk
operationInvariant: 销售方要求购买方付款，并只依赖可审计的合格付款确认完成履约。
domainNeutralClaim: 商品、内容或服务均可作为交易标的，付款凭证责任不依赖具体领域对象。
businessSpineRefs:
  - fulfillment.sales-payment
invariantRefs:
  - role.qualified-payment-confirmation
variationPointRefs:
  - role.qualified-payment-confirmation
domainInputRefs:
  - thing.product
  - thing.content
supportedByContractContextRefs:
  - context.product-sales
  - context.content-sales
domainExampleContextRefs:
  - context.catalog
  - context.content
reuseStatus: supported
stakeholderReview:
  status: pending
```

## 复用状态

- `candidate`：至少一个真实案例，但领域中立仍是假设。
- `supported`：至少两个 Contract Context 和两个 Domain Context 提供证据；仍未等于业务方确认。
- `confirmed`：满足 supported，并由具名业务审核者确认。

不要为了达到数量门槛复制 Context，也不要把支付 SDK、数据库表、消息 Topic 或微服务名称当作复用证据。

## 派生文档

分片 YAML 是事实源。需要人类阅读版时运行：

```bash
python3 scripts/build_fm_business_patterns.py <model-dir> \
  --output <model-dir>/02-business-patterns.md
```

不要直接维护 `02-business-patterns.md`，否则会与 YAML 漂移。

## 检查问题

- 模式是否真的解释收入、成本、KPI、合规或风险？
- 所谓不变量是否只是当前产品功能？
- 变化点是否来自业务结构，而不是当前技术方案？
- 替换领域输入后，合同履约责任和凭证链是否仍成立？
- `reuseStatus` 是否超出了现有案例与人工确认？
