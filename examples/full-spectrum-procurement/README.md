# 工业智能制造装备跨境采购与托管清结算全生命周期履约模型

## Full-Spectrum Procurement & Escrow Lifecycle Model

本案例是面向 **8X Flow 履约建模法** 与 **领域驱动设计（DDD）** 的工业级复杂标杆模型，**完全覆盖了 Evidence Framework 规范中的所有节点类型、实体类别、角色类别、关系流向和 CEL 规则种类**。

---

## 一、全要素覆盖矩阵（All-Node Coverage Checklist）

| 维度                             | 分类 / Kind                | 对应实体 / 关系 / 规则 ID                                           | 业务语义与现实映射                                                    |
| :------------------------------- | :------------------------- | :------------------------------------------------------------------ | :-------------------------------------------------------------------- |
| **上下文 (Context)**             | `pre_contract`             | `ctx-sourcing`                                                      | 缔约前设备寻源比价与招投标上下文（父上下文为 `ctx-main-procurement`） |
|                                  | `contract`                 | `ctx-main-procurement`                                              | 工业母机主采购买卖契约上下文（以正式采购合同为根节点）                |
|                                  | `contract`                 | `ctx-escrow-settlement`                                             | 三方资金与物权离岸独立账户托管清算契约上下文                          |
|                                  | `domain`                   | `ctx-machinery-domain`                                              | 工业机器人重载标的物与型号规格领域                                    |
|                                  | `domain`                   | `ctx-fintech-domain`                                                | 托管划拨、清算周期与逾期罚息测算金融科技领域                          |
|                                  | `domain`                   | `ctx-inspection-domain`                                             | 国际出入境口岸检测合规与 SGS 技术公证支持域                           |
| **参与方 (Participant)**         | `party`                    | `party-buyer-corp`                                                  | 领航智能制造装备集团（全球大型采购方）                                |
|                                  | `party`                    | `party-supplier-apex`                                               | 顶峰高精数控工业机器人有限责任公司（原厂供应商）                      |
|                                  | `party`                    | `party-escrow-bank`                                                 | 远东国际信托与离岸托管清算银行（第三方中立金融机构）                  |
|                                  | `party`                    | `party-sgs-inspection`                                              | 瑞士 SGS 国际工业产品技术公证检测行（法检与适航公证机构）             |
|                                  | `thing` (通用标的)         | `thing-robot-workstation`                                           | 六轴重载工业机器人柔性装配单元标的物（物理资产）                      |
|                                  | `thing` + `calculator`     | `thing-tariff-calculator`                                           | 跨境税费与逾期违约罚息阶梯测算器（领域计算能力）                      |
|                                  | `thing` + `checker`        | `thing-compliance-checker`                                          | 工业母机技术标准与进出口合规核验器（领域质量核验能力）                |
| **角色 (Role)**                  | `party` (买卖双方)         | `role-buyer`, `role-seller`                                         | 主采购合同买卖双方当事人角色                                          |
|                                  | `party` (托管双方)         | `role-escrow-depositor`, `role-escrow-agent`                        | 资金托管委托人与离岸监管清算代理人角色                                |
|                                  | `domain`                   | `role-clearing-engine`                                              | 资金清算核算器角色（由 `thing-tariff-calculator` 扮演）               |
|                                  | `third_party`              | `role-technical-inspector`                                          | 中立第三方专业质检官角色（由 SGS 机构扮演）                           |
|                                  | `context`                  | `role-sourcing-gateway`                                             | 寻源比选阶段转结主合同的跨上下文网关角色                              |
|                                  | `evidence`                 | `role-collateral-voucher`                                           | 跨合同凭证质押担保角色（**8X Flow 核心：凭证角色化**）                |
| **证据 (Evidence)**              | `rfp`                      | `doc-sourcing-rfp`                                                  | 智能装备全球采购招标建议书（带招标时段与预算上限）                    |
|                                  | `proposal`                 | `doc-supplier-proposal`                                             | 供应商竞标技术报价方案单（带报价时段与报价总额）                      |
|                                  | `contract`                 | `doc-procurement-contract`                                          | 高端智能装备国际采购主买卖契约（双当事人约束）                        |
|                                  | `contract`                 | `doc-escrow-agreement`                                              | 三方资金与物权托管监管协议（独立账户冻结资金）                        |
|                                  | `fulfillment_request`      | `req-advance-payment`                                               | 首期生产预付款支付请求（权利主张：时段）                              |
|                                  | `fulfillment_confirmation` | `conf-advance-payment`                                              | 首期预付款到账确认书（义务履行：时刻）                                |
|                                  | `fulfillment_request`      | `req-equipment-delivery`                                            | 整机出厂及航运交付催告请求（发货窗口：时段）                          |
|                                  | `fulfillment_confirmation` | `conf-equipment-delivery`                                           | 国际海运多式联运提单签收确认（到港签收：时刻）                        |
|                                  | `fulfillment_request`      | `req-breach-penalty`                                                | 逾期交货滞纳金违约赔偿请求（救济索赔：时段）                          |
|                                  | `fulfillment_confirmation` | `conf-breach-settlement`                                            | 违约金扣减抵扣结清确认凭单（责任结清：时刻）                          |
|                                  | `fulfillment_confirmation` | `conf-escrow-release`                                               | 托管尾款清算放款确认（清结算闭环）                                    |
|                                  | `fulfillment_request`      | `req-escrow-release`                                                | 验收合格后的托管尾款放款窗口                                          |
|                                  | `other_evidence`           | `doc-sgs-inspection-cert`                                           | SGS 国际技术质量公证证书（关键第三方合规凭据）                        |
| **关系流向 (Relationship Flow)** | `primary`                  | `rel-contract-references-proposal`, `rel-conf-advance-pairs-req` 等 | 顺畅业务主履约链路（投标 -> 签约 -> 预付 -> 交付 -> 终验）            |
|                                  | `breach_compensation`      | `rel-breach-claims-overdue`, `rel-conf-breach-pairs-req` 等         | 违约救济与补偿流（逾期判定 -> 阶梯罚息派生 -> 尾款扣划结清）          |
|                                  | `escalation`               | `rel-escrow-references-voucher`                                     | 争议升级与终极裁决流（托管行介入凭单质押与司法冻结）                  |
| **CEL 业务规则 (Rules)**         | `eligibility`              | `rule-supplier-eligibility`                                         | 供应商竞标准入门禁（最低技术参数与报价有效性）                        |
|                                  | `precondition`             | `rule-precondition-delivery`                                        | 前置守卫：必须先收到预付款，卖方才承担发货义务                        |
|                                  | `derivation`               | `rule-derive-penalty-amount`                                        | 派生计算：逾期天数 × 阶梯日费率 = 索赔金额                            |
|                                  | `invariant`                | `rule-invariant-escrow-balance`                                     | 资金平衡不变式：托管账户冻结金额守恒约束                              |
|                                  | `breach`                   | `rule-breach-detection-overdue`                                     | 违约判定：签收时刻 > 约定交货时限自动触发违约                         |
|                                  | `completion`               | `rule-completion-advance-payment`                                   | 完工闭环：到账金额达标且在窗口期内完成即销项                          |
| **关键数据 (Key Data)**          | 多类型台账                 | `timestamp`, `money`, `decimal`, `int`, `string`, `bool`            | 资金、时限、交付量、公证通过标志全部具备可追溯数据链                  |

## 校验

```bash
pnpm exec vitest run --project evidence-schema libs/evidence-schema/tests/fixtures/fullSpectrumProcurement.spec.ts
pnpm exec vitest run --project evidence-model-core libs/evidence-model-core/src/validation/fullSpectrumProcurement.spec.ts
```

Schema 全覆盖与 fmCheck / CEL 编译分别位于 schema 和 model-core 测试中，以保持依赖方向。静态有效不等于后端 HTTP 验收或人工业务批准。

## 三条可放映的业务场景

模型以标准 `entities[].examples[].test` 声明三个独立场景，`basedOn` 使用同一场景内的完整样例引用，不增加文件格式字段：

- `happy-path`：寻源 → 签约与托管 → 预付 → 到港交付 → SGS 合格 → 尾款放款。
- `late-delivery`：签收逾期两天触发 `rule-breach-detection-overdue`，按合同总额 × 日费率 0.05% × 2 派生违约金，索赔结清后扣减尾款。
- `defect-escalation`：SGS 核验失败，凭证角色化的提单注入托管合同，发起冻结并由独立托管行确认受理；不假设仲裁结果。

打开桌面项目后选择“业务流放映”，在“选择业务流”中切换。播放器只对当前已展示的样例前缀做本地 CEL 预演：未发生的步骤不会提前满足绑定，规则错误显示为未知，退出或切换场景不会写回模型。放映不是 HTTP 测试。金额采用规范的 `minorUnits` / `currency`，而非自定义 `amount` 字段。

领域能力挂件显示声明的示例参数，仍保留其原始领域 Context 归属；泳道推导与高亮都是临时展示状态。
