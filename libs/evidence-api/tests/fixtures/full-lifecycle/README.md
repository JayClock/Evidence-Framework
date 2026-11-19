# 采购全生命周期模型

`fm/` 是适配器、CLI、交付和 OpenAPI 测试共用的合成 FM v6 模型。

模型包含：

- 询价、报价与采购协议，协商与履约使用独立上下文。
- 支付、开票、发货请求与确认，以及发票和发货单。
- 参与方、责任角色、商品和跨上下文支付凭证角色。
- 完成规则、实例和场景断言。

API 与 OpenAPI 均由模型实时派生；这里不保存手写 API 设计或生成快照。测试直接验证：独占确认由请求下的动作登记，`201 Location` 和 HAL `self` 指向顶层凭证；共享确认的派生夹具则验证单一写入口与各请求的反向追溯。局部路径覆盖在测试中显式声明。

运行 API 回归测试：

```bash
pnpm exec vitest run --project evidence-api
```

多步演进与共享确认的内存模型构造器位于 [`src/testing/procurement.ts`](../../../src/testing/procurement.ts) 和 [`src/testing/fulfillment.ts`](../../../src/testing/fulfillment.ts)。
