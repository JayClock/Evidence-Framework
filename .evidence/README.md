# 业务来源与检查导航

本目录保存电话销售绩效协议业务的来源、当前 FM/API 与获授权检查记录；不等于已部署业务系统。软件职责与实现状态见 [范围](../docs/requirements/scope.md)，项目阅读路由见 [Guides](../docs/guides/index.md)。

| 内容                         | 位置                                               |
| ---------------------------- | -------------------------------------------------- |
| 业务材料与发现               | [discovery.md](discovery.md)                       |
| FM 使用入口                  | [fm/README.md](fm/README.md)                       |
| 合同、责任、变化点与场景概览 | [fm/00-overview.md](fm/00-overview.md)             |
| 正式业务术语                 | [fm/01-glossary.md](fm/01-glossary.md)             |
| 模型源                       | [fm/model.yaml](fm/model.yaml)                     |
| API 设计说明                 | [api/README.md](api/README.md)                     |
| API 唯一设计源               | [api/api.yaml](api/api.yaml)                       |
| 可视化人工审核               | [views/index.html](views/index.html)               |
| 当前 OpenAPI 3.1             | [openapi.yaml](api/generated/openapi.yaml)         |
| 检查记录约定                 | 仅在获授权时于 [checks/](checks/) 留存紧凑运行清单 |

先从可视化审核页查看业务边界、责任、场景、规则、消费者旅程、FM/API 覆盖、HTTP 契约和变更影响；存在争议时再回到对应源 YAML。消费机器投影时核对源摘要和实际检查版本，不把目录中有报告视为本次通过。

业务模型区分稳定主体及上下文角色、请求与完成证明、业务事件时间与记录时间。具体业务事实只在 FM/发现记录维护，不在导航重复金额、期限、接口或场景计数。

业务系统上线所需的身份、数据库与运维依据必须由实际实现和专题方案验收；静态 HTTP 消费流程不是已部署服务或生产保证。
