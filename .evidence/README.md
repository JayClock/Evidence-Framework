# 业务来源与检查导航

本目录保存专栏订阅业务的来源、当前 FM/API 与获授权检查记录；不等于已部署业务系统。软件职责与实现状态见 [范围](../docs/requirements/scope.md)，项目阅读路由见 [Guides](../docs/guides/index.md)。

| 内容                         | 位置                                                     |
| ---------------------------- | -------------------------------------------------------- |
| 业务材料与发现               | [discovery.md](discovery.md)                             |
| FM 使用入口                  | [fm/README.md](fm/README.md)                             |
| 合同、责任、变化点与场景概览 | [fm/00-overview.md](fm/00-overview.md)                   |
| 正式业务术语                 | [fm/01-glossary.md](fm/01-glossary.md)                   |
| 模型源                       | [fm/model.yaml](fm/model.yaml)                           |
| API 设计说明                 | [api/README.md](api/README.md)                           |
| API 唯一设计源               | [api/api.yaml](api/api.yaml)                             |
| 现有接口清单                 | [api-capabilities.md](api/generated/api-capabilities.md) |
| 现有 HTTP 契约               | [api-contracts.md](api/generated/api-contracts.md)       |
| 现有 OpenAPI 3.1             | [openapi.yaml](api/generated/openapi.yaml)               |
| 检查记录约定                 | 仅在获授权时于 [checks/](checks/) 留存紧凑运行清单       |

先读业务来源与概览，再读当前任务引用的源 YAML、规则及场景。API 清单用于定位能力，生成投影不覆盖源文件。消费时核对源摘要和实际检查版本，不把目录中有报告视为本次通过。

业务模型区分稳定主体及上下文角色、请求与完成证明、业务事件时间与记录时间。具体业务事实只在 FM/发现记录维护，不在导航重复金额、期限、接口或场景计数。

付款机构接入、到账核实、实时授权、并发扣减与生产运维必须由实际实现验收；静态 HTTP 消费流程不是已部署服务或生产保证。
