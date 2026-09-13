# 商品采购协议完整 FM 与 API 示例

这是商品采购协议的可执行示例。模型覆盖采购合同前、采购合同三项履约、外部微信支付链、参与方和商品领域对象：

```text
商品询价 RFP → 商品报价 Proposal → 商品采购协议 Contract
                                      ├→ 支付申请 → 支付确认 ─uses_role→ 支付凭证 Role
                                      ├→ 开票申请 → 发票 → 开票确认
                                      └→ 发货申请 → 发货单 → 发货确认

微信支付服务协议 → 微信支付申请 → 微信支付确认 ─plays_role→ 支付凭证 Role
```

为形成可执行 FM 场景，示例补充了标识、数量、金额、期限、凭证号和完成规则等合成字段；这些字段不代表生产业务批准。按示例约束，`api.yaml` 使用 `sources: []`，FM 与 API 文件不包含 `sourceRefs`、原文摘录或来源摘要。

## 节点覆盖

| 节点类型                  | 示例节点                                                         |
| ------------------------- | ---------------------------------------------------------------- |
| Context                   | 商品采购协商、商品采购协议、商品目录、微信支付服务               |
| RFP / Proposal / Contract | 商品询价、商品报价、商品采购协议、微信支付服务协议               |
| Fulfillment               | 采购支付、开票、发货、微信支付                                   |
| Request                   | 采购支付申请、开票申请、发货申请、微信支付申请                   |
| Confirmation              | 采购支付确认、开票确认、发货确认、微信支付确认                   |
| Other Evidence            | 发票、发货单                                                     |
| Party Role                | 采购合同：客户、供应商；微信支付合同：微信用户、腾讯             |
| Evidence Role             | 支付凭证（无责任人，由外部微信支付确认扮演）                     |
| Participant               | 甲方采购员、乙方销售                                             |
| Thing                     | 商品                                                             |
| Rule                      | 采购三项的证据前提与完成规则、微信支付完成规则                   |
| Relationship              | `plays_role`、`uses_role`、`references`、`precedes`、`evidences` |

## 业务角色与经办主体

本示例只有甲方采购员和乙方销售两个 Party，分别扮演客户 `role.buyer` 与供应商 `role.seller`。采购协议的 `roleRefs` 绑定这两个角色，其责任范围内的具体凭证复用此绑定，不新增阶段角色。外部微信支付服务协议单独绑定微信用户和腾讯，未补造其 Participant 玩家。支付凭证是 Evidence Role，不属于任何责任人；实际微信支付确认由外部合同中的腾讯角色负责。

询报价 Context 通过 `parentContextRef` 显式关联采购协议责任上下文，并保持自己的 URI 根。该关联不表示合同已在询价时签署；Contract 仍在实际签约时形成。

| 业务角色 | Participant 经办主体 | 本示例涉及的经办活动                               |
| -------- | -------------------- | -------------------------------------------------- |
| 客户     | 甲方采购员           | 办理询价、相关申请及基于外部结果形成支付确认       |
| 供应商   | 乙方销售             | 办理报价、支付申请、提供发票和发货单及形成相关确认 |

Participant Party 保持在 Context 外，`plays_role` 表达示例中的角色扮演。它不授予某个经办主体该角色的全部操作权限；真实代理范围及访问控制必须另有依据。本示例不包含人员资料管理能力，不为这些主体生成查询接口。

## 证明角色与具体证据

支付确认通过 `uses_role` 使用 `role.payment-proof`。外部微信支付确认通过 `plays_role` 扮演此角色；规则绑定角色，场景提供实际确认实例。角色没有责任字段、自己的业务时间或可签发实例；其属性表达对玩家数据的要求。实际玩家的 `confirmed_at` 不等于采购支付确认时间。

发票和发货单是具体 Other Evidence，通过 `evidences` 证明各自确认，以 `precedes` 表达形成前提。它们的 `created_at` 是自身形成时间。

三项采购确认的 `basedOn` 均引用本申请和实际证据实例，形成前校验已存在、可见、申请归属及金额／记录值，完成规则核对编号及业务时间。微信支付合同链仅作为外部玩家验证，不扩充采购侧 API。

API 声明了证据前提规则，FM 场景实际验证凭证依赖与规则结果；这不代表已实现服务端校验。实例归属和证据访问权限仍须由服务端按声明执行。

## URI 边界

- 商品询价协商：`/product-inquiries`
- 商品采购协议：`/product-procurements`
- 商品目录：`/products`
- 报价属于询价；支付、开票和发货履约沿采购协议根展开
- 发票、发货单与各自确认分别位于已有申请之下，无循环创建依赖
- 支付凭证 Role 不生成资源或提交 API；采购确认引用外部微信支付确认，外部三步映射为 `external`，不猜测回调或接入接口
- 报价到采购协议的跨 Context 跳转通过超媒体链接表达，不形成跨 Context 父子 URI

## 业务数量与命名

资源使用业务称谓，不按 FM 类型拼接路径。示例已有的采购协议到支付、开票、发货申请，以及申请到确认均声明一对一；申请与具体发票／发货单的数量由相应两组一对一关系确定。因此这些资源采用 `singleton`，在父实例路径下直接定位。报价也以询价下的单例表示。

询价、采购协议及商品是独立根集合。`confirmation` 表示业务中的支付确认、开票确认或发货确认，不是所有结果的默认名字。单例仅省略冗余路径 ID，实际凭证保留自身标识、责任及追加语义；静态基数校验不等于实现了运行时唯一性或重复提交策略。

## API 接口清单

| Role   | URI                                                            | Method | Business Capability |
| ------ | -------------------------------------------------------------- | ------ | ------------------- |
| 客户   | `/product-inquiries`                                           | POST   | 发起商品询价        |
| 供应商 | `/product-inquiries/{inquiryId}/quotation`                     | POST   | 提交商品报价        |
| 客户   | `/product-procurements`                                        | POST   | 登记商品采购协议    |
| 供应商 | `/product-procurements/{procurementId}/payment`                | POST   | 申请支付货款        |
| 客户   | `/product-procurements/{procurementId}/payment/confirmation`   | POST   | 确认支付货款        |
| 客户   | `/product-procurements/{procurementId}/invoicing`              | POST   | 申请开具发票        |
| 供应商 | `/product-procurements/{procurementId}/invoicing/invoice`      | POST   | 提交发票            |
| 供应商 | `/product-procurements/{procurementId}/invoicing/confirmation` | POST   | 确认开具发票        |
| 客户   | `/product-procurements/{procurementId}/delivery`               | POST   | 申请商品发货        |
| 供应商 | `/product-procurements/{procurementId}/delivery/delivery-note` | POST   | 提交发货单          |
| 供应商 | `/product-procurements/{procurementId}/delivery/confirmation`  | POST   | 确认商品发货        |
| 客户   | `/products/{productId}`                                        | GET    | 客户查看商品        |
| 供应商 | `/products/{productId}`                                        | GET    | 供应商查看商品      |

Context、Role、Rule 和纯 Relationship 只约束模型及授权语义，不机械生成 CRUD API。

## 校验 FM

```bash
"$PYTHON" "$FM_SKILL_DIR/scripts/check_fm.py" \
  "$API_SKILL_DIR/assets/examples/full-lifecycle/fm"
```

预期 FM 有效，1 个场景实际执行并通过：包含 14 个具体凭证实例，采购支付、开票、发货及外部微信支付均完成。

## 校验 API 设计

```bash
"$PYTHON" "$API_SKILL_DIR/scripts/fm_api.py" check \
  --project-root "$PROJECT_ROOT" \
  --fm "$API_SKILL_DIR/assets/examples/full-lifecycle/fm" \
  --fm-skill "$FM_SKILL_DIR" \
  --api "$API_SKILL_DIR/assets/examples/full-lifecycle/api.yaml"
```

API 设计采用格式 4.0，直接消费整个 FM v3。预期产生 13 个角色接口和 13 个完整 HTTP 契约，`complete: true`，无缺口。[接口清单](api-capabilities.md) 是当前完整设计的索引，不需要另行筛选或审核后才能生成接口。

整体覆盖包含采购和微信支付的所有上下文：11 份采购业务凭证对应登记接口；商品对应两个角色读取接口；3 份微信支付凭证由外部主体形成；两个经办主体是角色身份依据，不生成无业务根据的人员管理接口。内部／外部处理在 `nonApiActivities` 中引用模型依据；不是省略接口的实施范围开关。

## 生成投影

输出目录必须尚不存在：

```bash
mkdir -p "$PROJECT_ROOT/.evidence/api/generated"

"$PYTHON" "$API_SKILL_DIR/scripts/fm_api.py" project \
  --project-root "$PROJECT_ROOT" \
  --fm "$API_SKILL_DIR/assets/examples/full-lifecycle/fm" \
  --fm-skill "$FM_SKILL_DIR" \
  --api "$API_SKILL_DIR/assets/examples/full-lifecycle/api.yaml" \
  --out "$PROJECT_ROOT/.evidence/api/generated/product-procurement"
```

## HTTP 契约

[api.yaml](api.yaml) 的 `http` 部分完整覆盖所有 13 个接口：

- 11 个登记接口提供请求字段、响应表示、201 Location、403／409／422 错误响应、幂等键、并发策略和成功消费流程。
- 登记字段引用合成 FM 原始凭证记录；已有凭证通过 `evidenceRefs` 关联，服务端须核对实例归属、可见性及规则前提。业务时间不使用入库或回调时间替代。
- 两个商品读取接口提供 HAL 表示、私有缓存、ETag；客户流程含基于前次响应头的 304 条件读取。失败或仅 304 不替代 2xx 成功覆盖。
- HTTP 流程按角色描述入口及证据交接，FM 14 个签发步骤全部回映。微信支付活动仍是外部证据来源，不生成伪造的本地支付回调。

缺少任一接口契约、成功消费步骤或整体对象／场景映射时，默认返回非零且不生成交付目录。

上面的命令会同时检查整体模型覆盖与全部接口契约，生成固定八份文件：`projection.json`、`api-capabilities.md`、`design-report.md`、`api-contracts.md`、`openapi.yaml`、`representation-examples.json`、`http-journeys.json` 和 `manifest.json`。[示例 OpenAPI](openapi.yaml) 是由当前 `api.yaml` 和 FM 确定性生成的受测快照，不是第二份设计输入，不应手工修改。它合并同一路由的客户／供应商角色变体，以扩展字段保留能力和角色来源，不生成认证配置。13 个角色接口合并同路由商品读取变体后形成 12 个 OpenAPI Path＋Method 操作。`complete` 是整体覆盖和契约静态检查结果，`runtimeValidated` 始终为 false。

字段格式、边界及完整命令参见 [HTTP 资源与消费契约](../../../references/contracts.md)。
