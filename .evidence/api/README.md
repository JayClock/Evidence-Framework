# 电话销售绩效协议 API

唯一设计文件为 [api.json](api.json)，采用 API 格式 5.0，消费当前 FM v3（模型 `sales-performance`）。文件按严格 JSON 解析；拒绝注释、尾部逗号、重复 key 与 `NaN`。

## 接口范围

共 3 个资源、3 个角色接口，合并角色变体后为 3 个 OpenAPI 操作。

| 业务                 | URI                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 电话销售绩效协议     | `POST /sales-performance-agreements`、`/sales-performance-agreements/{agreementId}`                                          |
| 月度客户联系目标请求 | `/sales-performance-agreements/{agreementId}/monthly-customer-contact-targets` 及其 `/{targetId}`                            |
| 客户联系记录         | `/sales-performance-agreements/{agreementId}/monthly-customer-contact-targets/{targetId}/contact-records` 及其 `/{recordId}` |

3 个 POST 只追加由已建模 Participant Party 扮演角色（绩效管理者、电话销售）发起的业务凭证；登记协议或联系记录不等于履约完成，月度目标是否完成由 `rule.monthly-customer-contact-completed` 另行判断。用户主体只用于扮演这两个角色，FM 未定义用户资料交互；客户档案也没有定义的读取或维护交互，两者按内部非 API 活动回映，不生成资料或档案 CRUD。

## 契约要点

- POST 返回 201 和 Location，客户端可沿 Location 读取原记录；登记动作不替代业务事实。
- 每个接口都有类型化入口（`http.entryPoints`）；HTTP 流程必须声明 `scenarioRefs` 并把请求绑定到 FM 业务步骤，首步引用入口，后续步骤只能沿返回的 HAL 链接或 Location 接续，不能重新填写 ID。
- 写入使用 Idempotency-Key；同键同输入复用原结果，不同输入返回 409。
- 协议达成时刻、目标周期与联系确认时刻按业务含义接收；服务端不以入库时间或当前时间替换。
- 所有当前表示使用 no-store；不跨协议参与方缓存。
- 403 表示调用者不是本协议实例的参与方或缺少代表资格；409 表示重复或幂等冲突；422 表示引用、周期、目标值或实例归属不合要求。

## 交付文件

当前交付文件固定保存在 [generated](generated/)；目录只保存机器消费的投影、OpenAPI、表示样例、类型化入口与消费者覆盖、HTTP 流程、合成 E2E 向量和 manifest。接口清单、覆盖与 HTTP 契约统一在 [可视化审核页](../views/index.html) 中阅读，不再维护重复 Markdown。它们是 API 源的派生结果，不是已部署接口或本次运行验收结果。生成文件按权威字节交付，不应再被格式化，否则 manifest 摘要失效。

生成规则以 [API Skill](../../.agents/skills/evidence-api-design/SKILL.md)为准：获授权后先检查当前源，再整体更新固定输出目录；失败保留原目录，成功后由 Git 展示和保存版本差异。源或校验器变化后重验，不用已留存报告替代当前检查。

检查命令：

```bash
python3 .agents/skills/evidence-api-design/scripts/fm_api.py check \
  --project-root "$PWD" \
  --fm "$PWD/.evidence/fm" \
  --fm-skill "$PWD/.agents/skills/evidence-fm" \
  --api "$PWD/.evidence/api/api.json"
```

HTTP 流程和 `e2e-test-vectors.json` 只验证契约与数据衔接，`runtimeValidated` 为 false。合成向量不决定数据库装载、认证身份或外部系统 Stub。认证与协议参与方实例核验、`evidenceRefs` 寻址、生产数据库方言与并发仍需由实际服务执行并验收。
