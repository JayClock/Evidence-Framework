# API 能力候选

| Role   | URI                                                            | Method | Business Capability |
| ------ | -------------------------------------------------------------- | ------ | ------------------- |
| 供应商 | `/product-procurements/{procurementId}/delivery/confirmation`  | POST   | 确认商品发货        |
| 供应商 | `/product-procurements/{procurementId}/invoicing/confirmation` | POST   | 确认开具发票        |
| 客户   | `/product-procurements/{procurementId}/payment/confirmation`   | POST   | 确认支付货款        |
| 客户   | `/product-inquiries`                                           | POST   | 发起商品询价        |
| 供应商 | `/product-procurements/{procurementId}/invoicing/invoice`      | POST   | 提交发票            |
| 供应商 | `/product-inquiries/{inquiryId}/quotation`                     | POST   | 提交商品报价        |
| 客户   | `/products/{productId}`                                        | GET    | 客户查看商品        |
| 供应商 | `/products/{productId}`                                        | GET    | 供应商查看商品      |
| 供应商 | `/product-procurements/{procurementId}/delivery/delivery-note` | POST   | 提交发货单          |
| 客户   | `/product-procurements`                                        | POST   | 登记商品采购协议    |
| 客户   | `/product-procurements/{procurementId}/delivery`               | POST   | 申请商品发货        |
| 客户   | `/product-procurements/{procurementId}/invoicing`              | POST   | 申请开具发票        |
| 供应商 | `/product-procurements/{procurementId}/payment`                | POST   | 申请支付货款        |

> 本表是有来源的 API 候选，不是业务批准、完整 REST 契约或运行时授权配置。
