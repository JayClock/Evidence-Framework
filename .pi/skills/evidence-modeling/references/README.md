# FM Schema v3 · 权威规则索引

本目录共同构成 `modeling` skill 的权威规则。`SKILL.md` 负责触发与执行顺序；语义或格式冲突时，以这里的规则为准。

Schema v3 不接受 Schema v2 模型。统一表达合同履约、签约前渠道和领域，允许局部模型与混合模型；有 Fulfillment 才要求子 Fulfillment Context 和 Request interval，Place/Thing 仍在 Domain Context，模型评审状态仍必需。

本次范围重构保留 v3 文档形状与既有履约约束：只放开无履约范围的空 `fulfillments` 集合，不新增领域／绩效 profile。使用旧版 v3 加载器或 compiled Schema 的消费者需同步更新，否则仍会拒绝空集合。

本地时间契约进一步收紧：所有 Evidence 按 kind 显式定义必备 snake_case 时间属性，RFP／Proposal／Request 不再允许无期限；详见 `format.md` 的时间表及 `migration-v3.md`。源 YAML 和编译 Schema 同步校验；已识别凭证直接展开类型时间，非派生属性不要求实例值或生成公式。类型展开后仍需追溯业务来源，来源或规则缺口影响当前判断时回到发现，不能用字段齐全解除；实例仍须有确定时间值，不为通过校验造业务日期。此规则不要求纯领域模型创建 Evidence。

所有 Entity 业务属性及其引用统一小写 snake_case，协议字段保持现有 camelCase；不自动改名既有模型。YAML 排版与属性键顺序见 `format.md`，它们是生成规范而非业务语义；迁移边界见 `migration-v3.md`。

业务来源发现与提问只有 `discovery-workshop.md` 第1节的四色循环一个入口，覆盖直接记录、引用、派生和来源未知，不等待疑似派生。`semantics.md`／`format.md` 定义类型结构，`cel-rules.md` 定义公式表达，`traceability-and-simulation.md` 定义机器检查及其边界；这些检查不能替代业务来源核对。

## 按任务加载

| 任务                                               | 必读                                              |
| -------------------------------------------------- | ------------------------------------------------- |
| 从业务叙述、领域问题、Epic、访谈发现范围与事实     | `discovery-workshop.md`                           |
| 人工更新模型、Context 事实依赖评估与发布覆盖       | `incremental-assessment.md`                       |
| 识别上下文、组合模型；有履约时按 Role-first 建主链 | `semantics.md`                                    |
| 客户信息、商品、内容等纯领域或混合模型中的领域部分 | `domain-modeling.md`、`format.md`、`cel-rules.md` |
| 创建或更新 YAML、Context 与 Participant→Role       | `format.md`、`semantics.md`                       |
| 编写金额、时间、KPI、资格、完成与违约规则          | `cel-rules.md`                                    |
| 建立关键数据追溯、单据实例、自动场景和人工角色扮演 | `traceability-and-simulation.md`                  |
| 支付渠道、合约前、多合同、KPI、退款等标准模式      | `patterns.md`                                     |
| 从当前模型提取可复用业务模式                       | `business-pattern-extraction.md`                  |
| 校验、评审或修复模型                               | `validation.md`，并按错误回读其它文件             |
| 从旧 Schema v2 手工迁移                            | `migration-v3.md`                                 |

按当前范围渐进加载，不为纯领域任务读取所有合同模式：

1. 事实或范围不明时读 `discovery-workshop.md`；
2. `semantics.md` 与 `format.md`；
3. 涉及领域对象与规则时读 `domain-modeling.md`；
4. 有规则时读 `cel-rules.md`，有关键数据／单据验证时读 `traceability-and-simulation.md`；
5. 有合同／渠道场景时读相关 `patterns.md`；
6. 有权责复用主张时读 `business-pattern-extraction.md`；
7. 按 `validation.md` 验收实际存在的结构。

## 唯一事实源

- 分片 YAML 是可维护的模型定义事实源。
- `business-patterns/*.yaml` 是候选或已确认业务模式的事实源。
- `discovery/` 保存共创输入、候选与问题，不是已确认模型事实。
- `validation/` 中的 Instance 与 Scenario 是独立测试输入，不是生产凭证或模型类型。
- `generated/model.json`、`traceability.json` 和 `simulation.json` 是确定性派生产物。
- `02-business-patterns.md` 由 Business Pattern YAML 生成，不直接维护。
- REST、AsyncAPI、数据库和图形都是下游投影，不属于 FM 核心事实。

Schema v3 不兼容 v2 的 Contract Context 内履约、缺失 Request interval、自由放置 Place/Thing，以及更早版本的名称引用、通用 association、`partyAssignments`、`sourceEvidenceRefs` 或自定义计算 DSL。不要混用版本。
