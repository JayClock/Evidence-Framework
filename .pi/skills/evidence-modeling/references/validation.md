# FM Schema v3 校验清单

## 自动校验

```bash
python3 scripts/validate_fm_model.py <model-dir>
python3 scripts/build_fm_lineage.py <model-dir> --output <model-dir>/generated/traceability.json
python3 scripts/simulate_fm_model.py <model-dir> --output <model-dir>/generated/simulation.json  # 存在 validation/ 时
python3 scripts/build_fm_business_patterns.py <model-dir> --output <model-dir>/02-business-patterns.md  # 存在业务模式时
python3 scripts/compile_fm_model.py <model-dir> --output <model-dir>/generated/model.json
```

自动校验覆盖：

- Schema v3、文件位置、文件名、唯一 ID 与引用；纯领域／纯渠道允许没有 Fulfillment，已有履约的约束不放松；
- Contract、Fulfillment、Domain、Pre-contract／Channel Context 边界；
- Contract 恰好两个 Party Role，Role 可在没有玩家时独立成立；
- Fulfillment 必须位于父 Contract 的子 Fulfillment Context；
- 所有 Evidence 的类型级时间属性显式定义：RFP／Proposal／Request 的 start_at、expired_at，Contract 的 signed_at，Confirmation 的 confirmed_at，Other Evidence 的 created_at；全部 required/keyData timestamp；
- Request interval 固定引用 start_at／expired_at；拒绝 openEndedReason、缺失字段和无确定截止依据；
- Request、Confirmation、权利方、义务方和父 Contract Role 一致；
- completion policy、trigger、违约后果、共享确认和 Evidence Role；
- Place/Thing 必须属于 Domain Context；
- CEL、关键数据 lineage、派生环与确定性场景；
- Business Pattern 的业务脊梁、变化点、Domain／Contract 案例和复用状态门槛；
- `modelStatus`、机器状态、复用状态与 stakeholder review 分离；
- 确定性 JSON、追溯、模拟与业务模式 Markdown。

## 发现与事实检查

1. 是否明确本次问题、范围、来源与不展开部分，而不是按 CRM 等系统名称选固定模式？
2. 合同／渠道事实不足时是否做凭证发现与时间线回放；领域事实不足时是否做对象身份、关系、规则及反例核对？不强制所有范围完成四阶段。
3. 当前范围内的权责、时限、完成证明或领域规则是否有来源或明确待确认？不存在的上下文不要求补造。
4. KPI 与外部交易是否共用履约机制，目标协商／变更及不同管理方式下的权责是否按事实区分？
5. `modelStatus` 是否忠实反映当前范围的人工评审，而不是随机器校验升级？

## Context 检查

1. Contract Context 是否只作为两方交互聚合／服务边界，而没有被当作单一弹性边界？
2. 每个 Fulfillment 是否位于子 Fulfillment Context？
3. Request、Confirmation、Evidence Role 和履约 Rule 是否位于同一个 Fulfillment Context？
4. 它们的责任 Role 是否来自父 Contract 的两个 Role？
5. Place/Thing 是否位于 Domain Context？
6. RFP／Proposal 是否位于 Pre-contract／Channel Context，并与 Contract Context 分离？
7. `entryContextRefs` 是否指向真实 Context；纯领域／纯渠道是否没有为了校验虚构合同、履约或期限？

## Role、Evidence 与 Fulfillment 检查

1. 每个显式 Participant→Role 是否有来源依据？来源已明确玩家时是否遗漏关系？
2. 是否从收入、支出或目标—实际/KPI 找到业务脊梁？
3. 每个 Evidence 能否想象成可留存、签字、审计或追责的记录？
4. 每个 Fulfillment 是否回答“哪个 Role 有权要求哪个 Role 在什么时段完成什么”？
5. Confirmation 或 Evidence Role 是否足以证明完整／部分履约？
6. 增加支付／交付渠道时，核心 Evidence Role 是否无需修改？
7. 自动触发是否使用 `actsForRoleRef`，并避免把系统建成 Party？
8. 取消、退款、冲正、更正和补偿是否新增凭证，而非覆盖旧凭证？
9. 跨 Context 的 Evidence 协作是否只通过签约来源、时刻凭证或 Evidence Role？Participant／Context 的 Role 扮演及领域输入是否符合各自规则，而没有被误当完成证明？
10. FM 是否混入 API、数据库、页面、SDK、消息或部署对象？

## 领域检查

1. 领域问题是否用同一 FM 的 Entity／Relationship／Rule 表达，而不是只列 Thing 或转交另一种格式？
2. 是否区分稳定 Party 与档案等 Thing、局部属性与独立对象、上下文身份与玩家？
3. 对象关系的端点、方向与范围是否合法；需要但尚不支持的基数／操作／迁移语义是否明确列为 gap？
4. 领域 invariant／eligibility／precondition／derivation 是否在 Domain Context，引用真实属性，派生目标与 Rule 一致？
5. 领域专家是否核对正常、边界和反例？CEL 能编译不等于规则符合实际，也不等于自动执行操作或状态迁移。
6. 是否没有用假 Evidence 绕过只支持单据实例的模拟器？纯领域结构和 lineage 通过不宣称领域运行时模拟通过。

## Request interval 与数据检查

1. 每个 Evidence 源 YAML 的 attributes 是否唯一、显式包含其 kind 的必备时间属性，并为 required、`keyData: true` 的 timestamp？不能只存在于说明或编译结果。
2. RFP／Proposal／Request 是否有确定的截止时间或有来源的确定性推导？是否已经去掉 openEndedReason？缺依据保持发现阻塞，不以 null、占位日期、无期限或编译默认值规避。
3. 逾期、金额、数量、KPI、资格和赔偿是否可追溯到 Evidence 或 CEL？
4. 是否至少用一个正常和一个异常／追责场景检查凭证链？
5. 角色演练是否只暴露当时可见单据，而没有提前泄露答案？

## Business Pattern 检查

1. 是否引用真实 Fulfillment 作为业务脊梁？
2. 运营不变量和领域中立主张是否区别于产品功能？
3. 变化点是否来自 Evidence／Domain／Context Role 或业务 Context，而不是技术组件？
4. 单一 Domain 是否保持 `candidate`？
5. `supported`／`confirmed` 是否满足两个 Contract 和两个 Domain 案例？
6. `confirmed` 是否有具名审核人与时间？

## 完成标准

按实际存在的结构验收，不新增范围 profile 来跳过已有对象的规则：

- 所有模型：结构、边界、引用、CEL、属性追溯与编译通过。
- 有履约：双方 Role、Request interval、确认、完成策略和违约引用完整；空集合不能掩盖孤立 Request 或缺失 Confirmation。
- 纯渠道：RFP／Proposal、责任 Role、start_at／expired_at 时间属性和回应关系合法；合同未纳入范围可不生成。
- 纯领域：领域检查通过，明确实例／状态机模拟等尚未覆盖部分；允许省略 `fulfillments/`。
- 有单据场景：实际执行的场景全部通过；有 Business Pattern：派生 Markdown 与 YAML 一致。
- 简单集成：确无独立领域语义时，范围说明即可正常结束，不要求补合同。

正式金额、KPI、赔偿、审计或复用模型还需适用的人工演练与具名评审；领域部分由具名领域专家确认。无法确认的事实保持 draft，不能把局部模型验证当作整个系统已完整。
