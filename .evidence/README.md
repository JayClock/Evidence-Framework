# 专栏订阅业务

读者订阅“业务建模实战”专栏，支付 99 元后访问内容；断更下架时全额退款，再次上架后免费恢复原读者的访问资格。付款可使用移动支付或预付费余额抵扣。

## 文件导航

| 内容               | 文件                                                        |
| ------------------ | ----------------------------------------------------------- |
| 完整业务规则       | [discovery.md](discovery.md)                                |
| 模型入口           | [fm/README.md](fm/README.md)                                |
| 合同、责任与变化点 | [fm/00-overview.md](fm/00-overview.md)                      |
| 统一术语           | [fm/01-glossary.md](fm/01-glossary.md)                      |
| FM 模型            | [fm/model.yaml](fm/model.yaml)                              |
| API 设计入口       | [api/README.md](api/README.md)                              |
| 完整 API 定义      | [api/api.yaml](api/api.yaml)                                |
| 接口清单           | [api-capabilities.md](api/generated/v1/api-capabilities.md) |
| HTTP 契约          | [api-contracts.md](api/generated/v1/api-contracts.md)       |
| OpenAPI 3.1        | [openapi.yaml](api/generated/v1/openapi.yaml)               |
| FM 校验            | [checks/fm/v1.json](checks/fm/v1.json)                      |
| API 校验           | [checks/api/v1/check.json](checks/api/v1/check.json)        |

## 业务结构

- 3 个合同：专栏订阅、移动支付、预付费账户。
- 6 项履约：订阅费支付、内容访问、断更退款、免费恢复、移动扣款、余额抵扣。
- 内容领域包含专栏和章节，跨重新上架保留专栏身份。
- 移动支付与抵扣凭证扮演同一付款证明角色，新增支付方式不修改订阅付款规则。
- 18 个业务回放场景覆盖正常流程、截止边界、错误金额、错配读者、余额不足和违约补偿。
- 42 个角色接口，合并同路由的角色变体后为 28 个 OpenAPI 操作。

## 阅读顺序

先读业务规则和模型概览，再看具体凭证、CEL 规则及场景；接口清单用于总览，HTTP 契约和 OpenAPI 用于后续实现。

校验记录包含真实执行结果。HTTP 消费流程是静态契约检查，不是已部署服务；付款机构接入、实际到账核实、实时授权和并发扣减还需运行时验收。
