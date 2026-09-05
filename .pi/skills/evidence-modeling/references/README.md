# FM Schema v2 · 权威规则索引

本目录共同构成 `modeling` skill 的权威规则。`SKILL.md` 只负责触发与执行顺序；语义或格式冲突时，以这里的规则为准。

## 按任务加载

| 任务                                                 | 必读                                  |
| ---------------------------------------------------- | ------------------------------------- |
| 判断是否适合 FM、按 Role-first 建立合同和履约主链    | `semantics.md`                        |
| 创建或更新 YAML、按证据建立可选 Participant→Role     | `format.md`、`semantics.md`           |
| 编写金额、时间、KPI、资格、违约规则                  | `cel-rules.md`                        |
| 建立关键数据项追溯、单据实例、自动场景和人工角色扮演 | `traceability-and-simulation.md`      |
| 支付渠道、合约前、多合同、KPI、退款等模式            | `patterns.md`                         |
| 校验、评审或修复模型                                 | `validation.md`，并按错误回读其它文件 |

创建完整模型时按顺序读取：

1. `semantics.md`
2. `format.md`
3. `cel-rules.md`
4. `traceability-and-simulation.md`
5. 与场景有关的 `patterns.md`
6. `validation.md`

## 唯一事实源

- 分片 YAML 是可维护的模型定义事实源。
- `validation/` 中的 Instance 与 Scenario 是独立测试输入，不是生产凭证或模型类型。
- `generated/model.json`、`traceability.json` 和 `simulation.json` 是确定性派生产物，可以随时重新生成。
- Markdown 只解释范围、术语、假设和业务模式。
- REST、AsyncAPI、数据库和图形都是下游投影，不属于 FM 核心事实。

Schema v2 不兼容旧版以 `name` 为引用键、以通用二元关系推断履约语义的格式，也不接受 `partyAssignments` 或 Evidence Role 的 `sourceEvidenceRefs`。不要在同一模型中混用旧结构与 v2。
