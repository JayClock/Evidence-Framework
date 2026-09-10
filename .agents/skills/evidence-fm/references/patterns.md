# FM Schema v3 标准建模模式

本文件提供常见结构，不能替代从当前业务中提取 `business-patterns/*.yaml`。后者使用 `business-pattern-extraction.md`。

## 1. Role-first Contract 与子履约边界

```text
Contract Context
├── Role A ↔ Contract ↔ Role B
├── Fulfillment Context A
│   └── Request → Confirmation
└── Fulfillment Context B
    └── Request → Confirmation
```

先识别合同 Role，再按证据决定 Participant 玩家。每个 Fulfillment Context 必须指向父 Contract Context；不要把不同弹性诉求的履约压回 Contract Context。

## 2. 已知 Participant 跨上下文扮演 Role

```text
Customer Party
├── Subscriber Role（订阅合同）
├── Buyer Role（销售合同）
└── Account Holder Role（支付合同）
```

只有来源明确同一性时才建立多个 `plays_role`。名称相似不构成证据。

## 3. Request interval、单次与多次确认

固定期限：

```yaml
requestInterval:
  startAttribute: started_at
  endAttribute: expired_at
```

每个请求必须有确定的截止时间；不支持无期限或 `openEndedReason`。若来源只说明持续合作，继续核实每次请求的具体期限或确定性计算规则，不自行补造。

一次确认使用 `all`／`any`。分批履约仍只建一个 Confirmation 类型，使用 `count`；累计金额使用 `amount` 和 CEL completion Rule。不要复制类型节点模拟运行时实例。

## 4. 多个 Fulfillment 共用确定结果

季度与年度 KPI 若消费同一确定结果，应让外部时刻 Evidence 分别通过 Evidence Role 或合法跨 Context 引用进入各自 Fulfillment。具体 Confirmation 只属于一个 Fulfillment；不要通过复制或多重归属制造共享。

## 5. 自动动作代表业务 Role

```yaml
requestTrigger:
  kind: schedule
  schedule: '0 9 * * MON'
  actsForRoleRef: role.manager
```

调度器不是 Participant。支付回调同样只是 trigger mechanism。

## 6. 多支付渠道：凭证角色化

订阅付款 Fulfillment Context 只声明开放插槽：

```text
Payment Request → Qualified Payment Confirmation Evidence Role
```

每个支付合同在自己的 Fulfillment Context 产生时刻凭证：

```text
Channel A Confirmation ─┐
Channel B Confirmation ─┼─plays_role→ Qualified Payment Confirmation Role
Channel C Confirmation ─┘
```

增加渠道只新增外部 Context、Evidence 和 Relationship，不修改核心订阅合同或履约确认插槽。

## 7. 未展开的外部协作者

只知道当前业务使用外部能力、又不展开其合同内部结构时，建立独立 `third_party` Role。若完整展开外部合同，则建立 Contract Context、两个 Party Role 及作为子 Context 的 Fulfillment。

## 8. 合约前与渠道变化

- 询价：RFP → Proposal → Contract；
- 固定套餐：Proposal → Contract 或直接 Contract；
- 招标：一个 RFP 对多个 Proposal，最终 Contract 追溯被接受 Proposal；
- 拼团、赠送、活动和谈判位于独立 Channel／Pre-contract Context。

RFP／Proposal 不是 Fulfillment，但仍是异步请求—响应凭证。它们的生产 Role、`started_at`／`expired_at` 时间定义和回应关系必须明确；Contract 已形成且纳入范围时才建立 Proposal→Contract 审计追溯。纯渠道可没有 Contract 和 Fulfillment，不补造未来履约。

## 9. KPI／目标—实际

绩效协议与对外合同使用同一套履约机制，不另设 KPI 模式或内核，也不虚构支付流。先确认目标是在何时、由谁、按什么权限形成的。

- **签约前谈妥目标**：目标磋商属于 Pre-contract／Channel 的 RFP／Proposal；签约后按约定检查履约，不默认再创建“目标设定履约”。
- **执行中可变更目标**：协议明确变更机制时，目标请求与确认可成为合同下的变更履约；必须保留旧约定及新变更凭证。
- **主管指派目标**：在这一事实分支中，管理方负责形成目标请求，执行方负责形成回应凭证。
- **执行方自报目标、主管审核**：目标请求和回应凭证的责任 Role 对调；进度检查的凭证责任仍单独确认，不随之全局对调。

是否允许拒绝或要求修改要按真实管理机制建模，不把“只能同意”和“可拒绝”混为一谈。拒绝结果不能自动算作目标已获批准；完成策略必须表达当前履约到底要求答复还是要求同意，必要时用已有属性与 CEL 规则区分。

只有材料明确允许执行中设定／变更目标时，才使用以下示例：

```text
Performance Contract
├── Target-change Fulfillment Context（按协议条款可选）
│   └── Target-change Request → Decision Confirmation
└── Review Fulfillment Context
    └── Review Request → Actual Result Confirmation
```

联系记录、周报等只作为证明材料时建成 Other Evidence，必备 `created_at`；真正关闭当前责任的结果才是 Confirmation，必备 `confirmed_at`。周检查、季度目标等是否共用确认，仍按共享确认的证明理由和边界判断。

## 10. 取消、退款与补偿

原凭证保持不变，每种新责任位于对应 Fulfillment Context：

```text
Cancellation Request → Cancellation Confirmation
Refund Request       → Refund Confirmation
Return Request       → Receipt Confirmation
Compensation Request → Compensation Confirmation
```

异常修正是新履约，不是 update/delete/status overwrite。

## 11. 领域模型与业务输入

领域部分本来就在 8X Flow 内，用同一 FM 的 Entity、Relationship、CEL Rule 表达。商品、内容、客户档案、场所等 Thing 位于 Domain Context；稳定 Party 保持外部身份，通过 Role 扮演进入上下文。

独立领域任务不要求 Contract 或 Fulfillment；混合模型才按事实通过 `subjectRefs`、领域 Role 及合法凭证协作组合。领域对象不是完成凭证，能力插槽不是已经展开的领域逻辑。详细过程与表达边界见 `domain-modeling.md`。

## 12. 工具集成与无需建模

电脑控制座机拨号、挂断、重拨，如果只是协议调用的胶水代码且无独立领域规则，可以不生成模型，以范围说明正常结束；不要求用户补出合同。

但出现拨号策略、号码有效性、排队约束、重拨资格等独立领域问题时，应按事实使用 FM 的领域部分，而不是因无合同、收费或 KPI 而排除。播放器、推荐、索引、算法和同步也不能仅凭名称判为不适用；判断的是本次范围内的领域语义，不是工具标签。

## 13. 同一 CRM 的组合范围

```text
客户信息 Domain：客户身份、档案、联系方式及有效性规则
      ↓ 作为联系对象／领域输入，不自动证明履约完成
绩效 Contract：双方就 KPI 达成协议
      └── 进度检查 Fulfillment：检查请求 → 合格结果确认
                  ↑ 真实联系记录提供证据
拨号工具：技术执行机制，不因此成为合同 Role
```

只做客户信息时可以停止在 Domain；只做绩效时不必展开全部客户信息规则；完整范围才按真实关系组合。新增上下文不重命名或改写已有对象来制造关联。
