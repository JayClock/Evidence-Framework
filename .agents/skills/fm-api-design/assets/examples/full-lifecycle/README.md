# 商品采购协议完整 FM 与 API 示例

这是基于 PDF“商品采购协议”案例整理的可执行示例。模型覆盖合同前、合同、三个履约项、参与方和商品领域对象：

```text
商品询价 RFP → 商品报价 Proposal → 商品采购协议 Contract
                                      ├→ 支付申请 → 支付确认 → 支付凭证
                                      ├→ 开票申请 → 开票确认 → 发票
                                      └→ 发货申请 → 发货确认 → 发货单
```

为形成可执行 FM 场景，示例补充了标识、数量、金额、期限、凭证号和完成规则等合成字段；这些字段不代表生产业务批准。按示例约束，`design.yaml` 使用 `sources: []`，FM 与 API 文件不包含 `sourceRefs`、原文摘录或来源摘要。

## 节点覆盖

| 节点类型                  | 示例节点                                                         |
| ------------------------- | ---------------------------------------------------------------- |
| Context                   | 商品采购协商、商品采购协议、商品目录                             |
| RFP / Proposal / Contract | 商品询价、商品报价、商品采购协议                                 |
| Fulfillment               | 支付、开票、发货                                                 |
| Request                   | 支付申请、开票申请、发货申请                                     |
| Confirmation              | 支付确认、开票确认、发货确认                                     |
| Other Evidence            | 支付凭证、发票、发货单                                           |
| Role                      | 客户、供应商、采购方、供应方、采购方财务、供应方财务、供应方库管 |
| Participant               | 甲方采购员、甲方财务、乙方销售、乙方财务、乙方库管               |
| Thing                     | 商品                                                             |
| Rule                      | 支付完成、开票完成、发货完成                                     |
| Relationship              | `plays_role`、`references`、`precedes`、`evidences`              |

同一现实参与方通过 `plays_role` 连接不同 Context 中的 Role，例如甲方采购员同时扮演合同前的“客户”和合同中的“采购方”。Participant Party 按 FM v3 约束保持在所有 Context 之外。

## URI 边界

- 商品询价协商：`/product-inquiries`
- 商品采购协议：`/product-procurements`
- 商品目录：`/products`
- Participant：使用独立可定位根，不嵌入合同前或合同 Context
- 报价属于询价；支付、开票和发货履约沿采购协议根展开
- 报价到采购协议的跨 Context 跳转通过超媒体链接表达，不形成跨 Context 父子 URI

## API 候选

| Role       | URI                                                                                                                                 | Method | Business Capability |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------- |
| 客户       | `/product-inquiries`                                                                                                                | POST   | 发起商品询价        |
| 供应商     | `/product-inquiries/{inquiryId}/quotations`                                                                                         | POST   | 提交商品报价        |
| 采购方     | `/product-procurements`                                                                                                             | POST   | 登记商品采购协议    |
| 供应方     | `/product-procurements/{procurementId}/payment-requests`                                                                            | POST   | 申请支付货款        |
| 采购方     | `/product-procurements/{procurementId}/payment-requests/{paymentRequestId}/confirmations`                                           | POST   | 确认支付货款        |
| 采购方财务 | `/product-procurements/{procurementId}/payment-requests/{paymentRequestId}/confirmations/{paymentConfirmationId}/vouchers`          | POST   | 提交支付凭证        |
| 采购方     | `/product-procurements/{procurementId}/invoice-requests`                                                                            | POST   | 申请开具发票        |
| 供应方     | `/product-procurements/{procurementId}/invoice-requests/{invoiceRequestId}/confirmations`                                           | POST   | 确认开具发票        |
| 供应方财务 | `/product-procurements/{procurementId}/invoice-requests/{invoiceRequestId}/confirmations/{invoiceConfirmationId}/invoices`          | POST   | 提交发票            |
| 采购方     | `/product-procurements/{procurementId}/delivery-requests`                                                                           | POST   | 申请商品发货        |
| 供应方     | `/product-procurements/{procurementId}/delivery-requests/{deliveryRequestId}/confirmations`                                         | POST   | 确认商品发货        |
| 供应方库管 | `/product-procurements/{procurementId}/delivery-requests/{deliveryRequestId}/confirmations/{deliveryConfirmationId}/delivery-notes` | POST   | 提交发货单          |
| 采购方     | `/products/{productId}`                                                                                                             | GET    | 采购方查看商品      |
| 供应方     | `/products/{productId}`                                                                                                             | GET    | 供应方查看商品      |
| 采购方     | `/procurement-agents/{agentId}`                                                                                                     | GET    | 查看甲方采购员      |
| 采购方财务 | `/buyer-finance-members/{financeMemberId}`                                                                                          | GET    | 查看甲方财务        |
| 供应方     | `/sales-representatives/{salesRepresentativeId}`                                                                                    | GET    | 查看乙方销售        |
| 供应方财务 | `/seller-finance-members/{financeMemberId}`                                                                                         | GET    | 查看乙方财务        |
| 供应方库管 | `/warehouse-operators/{operatorId}`                                                                                                 | GET    | 查看乙方库管        |

Context、Role、Rule 和纯 Relationship 只约束模型及授权语义，不机械生成 CRUD API。

## 校验 FM

```bash
"$PYTHON" "$FM_SKILL_DIR/scripts/check_fm.py" \
  "$API_SKILL_DIR/assets/examples/full-lifecycle/fm"
```

预期 FM 有效，1 个采购全生命周期场景实际执行并通过。

## 校验 API 设计

```bash
"$PYTHON" "$API_SKILL_DIR/scripts/fm_api.py" check \
  --project-root "$PROJECT_ROOT" \
  --fm "$API_SKILL_DIR/assets/examples/full-lifecycle/fm" \
  --fm-skill "$FM_SKILL_DIR" \
  --design "$API_SKILL_DIR/assets/examples/full-lifecycle/design.yaml" \
  --require-complete
```

预期产生 19 个候选，`complete: true`，且无缺口。

## 生成投影

输出目录必须尚不存在：

```bash
mkdir -p "$PROJECT_ROOT/docs/api/.work"

"$PYTHON" "$API_SKILL_DIR/scripts/fm_api.py" project \
  --project-root "$PROJECT_ROOT" \
  --fm "$API_SKILL_DIR/assets/examples/full-lifecycle/fm" \
  --fm-skill "$FM_SKILL_DIR" \
  --design "$API_SKILL_DIR/assets/examples/full-lifecycle/design.yaml" \
  --out "$PROJECT_ROOT/docs/api/.work/product-procurement-v1" \
  --require-complete
```
