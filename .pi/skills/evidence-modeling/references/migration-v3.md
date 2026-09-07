# Schema v2 → v3 破坏性迁移

Schema v3 不提供兼容 profile，也不在加载时猜测旧模型语义。迁移必须修改分片 YAML，再重新生成所有派生产物。

## 迁移顺序

1. 将 `model.yaml.schemaVersion` 改为 `3.0`，补充诚实的 `modelStatus` 与 `stakeholderReview`。迁移和机器校验本身不能把状态设为 confirmed。
2. 为每个 Fulfillment 建立 `kind: fulfillment` 的 Context，以 `parentContextRef` 指向它的 Contract Context。
3. 将该 Fulfillment 的 Request、具体 Confirmation、Evidence Role 和 Rule 移入子 Fulfillment Context；Contract 的两个 Party Role 仍留在父 Contract Context。
4. 为每个 Fulfillment 补 `requestInterval`，固定引用 Request 的 `start_at` 和 `expired_at`；两者必须显式为 required、`keyData: true` 的 timestamp。不再支持 `openEndedReason`，缺确定的截止时间依据须回到发现。所有其它 Evidence 也按 `format.md` 的类型表补齐时间定义，不能只改 interval。
5. 将所有 Place／Thing 移入 Domain Context。Party 保持在 Context 外，不要为了迁移补造 Participant。
6. 删除 `elasticityBoundaryCandidate`。v3 的 Context kind 已直接表达边界语义。
7. 只有存在复用主张时才创建 `business-patterns/*.yaml`；单一领域从 `candidate` 开始。
8. `entities/` 必需；`fulfillments/`、`relationships/`、`rules/` 和 `business-patterns/` 无文档时可省略。纯领域／纯渠道允许没有合同与履约，不能为迁移补造它们；已有履约仍必须满足全部 v3 约束。
9. 删除旧 `generated/`，依次重新运行校验、lineage、适用场景模拟、Business Pattern 文档生成和编译。

## 本地 v3 时间约束收紧

即使已是 Schema v3，旧模型仍须经人工核对时间依据后更新源 YAML：`startedAt`／`expiresAt`／`confirmedAt`／`signedAt` 分别改为 `start_at`／`expired_at`／`confirmed_at`／`signed_at`，RFP／Proposal 补全两个起止属性，Other Evidence 补 `created_at`。同步调整 CEL 属性访问、派生 target、interval、实例 values 和预期引用。只有已确认的事实才可迁移；旧无期限约定不能自动转换成截止日期。缺字段的源文件直接拒绝，编译器不会补默认值。

Evidence 工作流中的既有工件仍须通过发现／提交或人工 Gate 编辑器修订；本次工具升级不改运行状态、已批准工件、审核记录或生成报告。

## 本地 v3 业务属性命名收紧

所有 Entity（含纯领域对象、Context、Role）的业务属性统一 snake_case，例如 `requestedMinorUnits → requested_minor_units`、`profileId → profile_id`。源定义、Rule target、CEL 点访问／静态索引和实例 values 必须一起调整，再重建 lineage 与编译输出。原材料字段名保留在词汇表或 notes 的映射说明中；改名冲突需人工确认，不把两个业务概念自动合并。

`contextRef`、`valueType`、`keyData`、`asOf` 等协议键、CEL binding 别名和内置函数保持原名。此变更仍是本地 Schema 3.0 的不兼容收紧，不提供自动迁移或编译时别名回退。既有工件走受控修订；两空格缩进和属性键顺序按 `format.md` 整理，不影响 YAML 的映射语义。

## 迁移验证

```bash
python3 scripts/validate_fm_model.py <model-dir>
python3 scripts/build_fm_lineage.py <model-dir> --output <model-dir>/generated/traceability.json
python3 scripts/simulate_fm_model.py <model-dir> --output <model-dir>/generated/simulation.json  # 有 validation/ 时
python3 scripts/build_fm_business_patterns.py <model-dir> --output <model-dir>/02-business-patterns.md  # 有模式时
python3 scripts/compile_fm_model.py <model-dir> --output <model-dir>/generated/model.json
```

不要直接编辑编译 JSON 或 `02-business-patterns.md` 来伪装迁移完成；它们不是事实源。
