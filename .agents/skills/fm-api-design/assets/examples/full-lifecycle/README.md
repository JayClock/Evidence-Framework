# 商品采购协议完整 FM 与 API 示例

这是基于 PDF“商品采购协议”案例整理的可执行示例。模型覆盖合同前、合同、三个履约项、参与方和商品领域对象：

```text
商品询价 RFP → 商品报价 Proposal → 商品采购协议 Contract
                                      ├→ 支付申请 → 支付凭证 → 支付确认
                                      ├→ 开票申请 → 发票 → 开票确认
                                      └→ 发货申请 → 发货单 → 发货确认
```

为形成可执行 FM 场景，示例补充了标识、数量、金额、期限、凭证号和完成规则等合成字段；这些字段不代表生产业务批准。按示例约束，`design.yaml` 使用 `sources: []`，FM 与 API 文件不包含 `sourceRefs`、原文摘录或来源摘要。

## 节点覆盖

| 节点类型                  | 示例节点                                            |
| ------------------------- | --------------------------------------------------- |
| Context                   | 商品采购协商、商品采购协议、商品目录                |
| RFP / Proposal / Contract | 商品询价、商品报价、商品采购协议                    |
| Fulfillment               | 支付、开票、发货                                    |
| Request                   | 支付申请、开票申请、发货申请                        |
| Confirmation              | 支付确认、开票确认、发货确认                        |
| Other Evidence            | 支付凭证、发票、发货单                              |
| Role                      | 客户、供应商（合同绑定的两个角色）                  |
| Participant               | 甲方采购员、乙方销售                                |
| Thing                     | 商品                                                |
| Rule                      | 支付、开票、发货的证据前提与履约完成规则            |
| Relationship              | `plays_role`、`references`、`precedes`、`evidences` |

## 业务角色与经办主体

本示例只有甲方采购员和乙方销售两个 Party，分别扮演客户 `role.buyer` 与供应商 `role.seller`。采购协议的 `roleRefs` 绑定这两个角色，从 RFP、Proposal 到 Request、Confirmation、Other Evidence 的责任角色全部来自此绑定，不新增阶段角色。

询报价 Context 通过 `parentContextRef` 显式关联采购协议责任上下文，并保持自己的 URI 根。该关联不表示合同已在询价时签署；Contract 仍在实际签约时形成。

| 业务角色 | Participant 经办主体 | 本示例涉及的经办活动                               |
| -------- | -------------------- | -------------------------------------------------- |
| 客户     | 甲方采购员           | 办理询价、相关申请、提供支付凭证及形成支付确认     |
| 供应商   | 乙方销售             | 办理报价、支付申请、提供发票和发货单及形成相关确认 |

Participant Party 保持在 Context 外，`plays_role` 表达示例中的角色扮演。它不授予某个经办主体该角色的全部操作权限；真实代理范围及访问控制必须另有依据。本示例不包含人员资料管理能力，不为这些主体生成查询接口。

## 必需补充证据

支付凭证、发票和发货单分别补充证明支付确认、开票确认和发货确认。它们必须先存在，才能形成依赖它们的确认：`evidences` 表达证明对象，`precedes` 表达形成前提，确认实例的 `basedOn` 引用申请与已有证据。

本示例每份补充证据通过 `request_number` 归属申请，确认引用同一申请编号及证据业务编号。形成确认前检查证据已存在、当前可见且记录值符合申请；完成规则同时检查编号、记录值和证据形成时间。`created_at` 是凭证形成时间，`confirmed_at` 是基于证据形成确认的时间。

API 声明了证据前提规则，FM 场景实际验证凭证依赖与规则结果；这不代表已实现服务端校验。实例归属和证据访问权限仍须由服务端按声明执行。

## URI 边界

- 商品询价协商：`/product-inquiries`
- 商品采购协议：`/product-procurements`
- 商品目录：`/products`
- 报价属于询价；支付、开票和发货履约沿采购协议根展开
- 补充证据与确认分别位于已有申请之下；先提交证据，再在确认中引用证据，无循环创建依赖
- 报价到采购协议的跨 Context 跳转通过超媒体链接表达，不形成跨 Context 父子 URI

## API 候选

| Role   | URI                                                                                          | Method | Business Capability |
| ------ | -------------------------------------------------------------------------------------------- | ------ | ------------------- |
| 客户   | `/product-inquiries`                                                                         | POST   | 发起商品询价        |
| 供应商 | `/product-inquiries/{inquiryId}/quotations`                                                  | POST   | 提交商品报价        |
| 客户   | `/product-procurements`                                                                      | POST   | 登记商品采购协议    |
| 供应商 | `/product-procurements/{procurementId}/payment-requests`                                     | POST   | 申请支付货款        |
| 客户   | `/product-procurements/{procurementId}/payment-requests/{paymentRequestId}/vouchers`         | POST   | 提交支付凭证        |
| 客户   | `/product-procurements/{procurementId}/payment-requests/{paymentRequestId}/confirmations`    | POST   | 确认支付货款        |
| 客户   | `/product-procurements/{procurementId}/invoice-requests`                                     | POST   | 申请开具发票        |
| 供应商 | `/product-procurements/{procurementId}/invoice-requests/{invoiceRequestId}/invoices`         | POST   | 提交发票            |
| 供应商 | `/product-procurements/{procurementId}/invoice-requests/{invoiceRequestId}/confirmations`    | POST   | 确认开具发票        |
| 客户   | `/product-procurements/{procurementId}/delivery-requests`                                    | POST   | 申请商品发货        |
| 供应商 | `/product-procurements/{procurementId}/delivery-requests/{deliveryRequestId}/delivery-notes` | POST   | 提交发货单          |
| 供应商 | `/product-procurements/{procurementId}/delivery-requests/{deliveryRequestId}/confirmations`  | POST   | 确认商品发货        |
| 客户   | `/products/{productId}`                                                                      | GET    | 客户查看商品        |
| 供应商 | `/products/{productId}`                                                                      | GET    | 供应商查看商品      |

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

预期产生 14 个角色×接口候选，`complete: true`，且无缺口。

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
