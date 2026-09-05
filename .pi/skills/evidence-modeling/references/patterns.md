# FM Schema v2 标准模式

## 1. Role-first 合同

```text
Role A ↔ Contract ↔ Role B
             ↓
         Fulfillment
```

先识别合同中的两个 Role，再按证据决定是否存在 Participant 玩家。缺少 Party 不会让合同不完整。

## 2. 已知同一 Participant 跨上下文扮演角色

当依据明确同一稳定对象进入多个上下文时：

```text
Customer Party
├── Subscriber Role（订阅上下文）
├── Buyer Role（订单上下文）
└── Account Holder Role（支付上下文）
```

用多个 `plays_role` 表达，不把各上下文逻辑堆进 Customer。只有依据明确同一性时才建立共同玩家；名称相似不构成证据。

## 3. 单次与多次确认

一次确认：

```text
Contract → Request → Confirmation
```

分批履约仍只建一个 Confirmation 类型，用：

```yaml
completionPolicy:
  mode: count
  minimumConfirmations: 3
```

累计金额使用 `mode: amount` 和 CEL `completionRuleRef`。不要复制类型节点模拟运行时实例。

## 4. 多个 Fulfillment 共用确定结果

季度与年度 KPI 等场景可以共享 Confirmation 类型，但每个 Fulfillment 都必须通过 `sharedConfirmationRationale` 说明同一不可变凭证为何足以证明该责任。

## 5. 自动动作代表业务 Role

```yaml
requestTrigger:
  kind: schedule
  schedule: '0 9 * * MON'
  actsForRoleRef: role.manager
```

调度器不是 Participant。支付回调同样只是 trigger mechanism；是否存在支付供应商 Party 由依据决定。

## 6. 多支付渠道：凭证角色化

订阅核心只声明开放确认插槽：

```text
Order Payment Request → Qualified Payment Confirmation Evidence Role
```

每个支付合同产生自己的时刻凭证：

```text
Channel A Payment Confirmation ─┐
Channel B Payment Confirmation ─┼─plays_role→ Qualified Payment Confirmation Role
Channel C Payment Confirmation ─┘
```

Evidence Role 不列 `sourceEvidenceRefs`。增加渠道只新增外部 Context、Evidence 和关系，不修改核心订阅合同。

每个被展开的支付合同仍由两个合同 Role 构成。若依据明确同一 Customer Participant 同时扮演订阅方与支付账户持有人，可以建立两个 `plays_role`；若没有供应商 Participant 的证据，则只保留服务提供方 Role。

## 7. 未展开的外部协作者

只知道当前业务使用某种外部能力、又不展开其合同内部结构时，可以建立独立 `third_party` Role。它不要求上层 Party。若完整展开外部合同，应在那个合同中建立两个 `party` Role，而不是用 Third-party Role 替代合同参与 Role。

## 8. 合约前与渠道变化

- 询价：RFP → Proposal → Contract；
- 固定套餐：Proposal → Contract 或直接 Contract；
- 招标：一个 RFP 对多个 Proposal，最终 Contract 追溯被接受 Proposal；
- 拼团、赠送、活动和谈判位于独立 Channel/Pre-contract Context。

## 9. KPI / 目标—实际

无现金流时：

```text
Performance Contract → Target Request → Actual Result Confirmation
```

联系记录、周报等只作为证明材料时建成 Other Evidence；真正关闭目标履约的结果才是 Confirmation。

## 10. 取消、退款与补偿

原凭证保持不变：

```text
Cancellation Request → Cancellation Confirmation
Refund Request       → Refund Confirmation
Return Request       → Receipt Confirmation
Compensation Request → Compensation Confirmation
```

异常修正是新的履约，不是 update/delete/status overwrite。

## 11. 纯领域或工具负例

拨号、播放器、推荐、索引、算法和数据同步，如果没有合同、收费、KPI、验收、责任或审计留痕，不生成 FM 合同链。
