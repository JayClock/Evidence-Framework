# Schema v2 → v3 破坏性迁移

Schema v3 不提供兼容 profile，也不在加载时猜测旧模型语义。迁移必须修改分片 YAML，再重新生成所有派生产物。

## 迁移顺序

1. 将 `model.yaml.schemaVersion` 改为 `3.0`，补充诚实的 `modelStatus` 与 `stakeholderReview`。迁移和机器校验本身不能把状态设为 confirmed。
2. 为每个 Fulfillment 建立 `kind: fulfillment` 的 Context，以 `parentContextRef` 指向它的 Contract Context。
3. 将该 Fulfillment 的 Request、具体 Confirmation、Evidence Role 和 Rule 移入子 Fulfillment Context；Contract 的两个 Party Role 仍留在父 Contract Context。
4. 为每个 Fulfillment 补 `requestInterval`。开始属性及 fixed 模式的截止属性必须存在于 Request，且为 required、`keyData: true` 的 timestamp。材料确认没有固定终点时使用 `openEndedReason`；不能用它掩盖缺失时限。
5. 将所有 Place／Thing 移入 Domain Context。Party 保持在 Context 外，不要为了迁移补造 Participant。
6. 删除 `elasticityBoundaryCandidate`。v3 的 Context kind 已直接表达边界语义。
7. 只有存在复用主张时才创建 `business-patterns/*.yaml`；单一领域从 `candidate` 开始。
8. `entities/` 必需；`fulfillments/`、`relationships/`、`rules/` 和 `business-patterns/` 无文档时可省略。纯领域／纯渠道允许没有合同与履约，不能为迁移补造它们；已有履约仍必须满足全部 v3 约束。
9. 删除旧 `generated/`，依次重新运行校验、lineage、适用场景模拟、Business Pattern 文档生成和编译。

## 迁移验证

```bash
python3 scripts/validate_fm_model.py <model-dir>
python3 scripts/build_fm_lineage.py <model-dir> --output <model-dir>/generated/traceability.json
python3 scripts/simulate_fm_model.py <model-dir> --output <model-dir>/generated/simulation.json  # 有 validation/ 时
python3 scripts/build_fm_business_patterns.py <model-dir> --output <model-dir>/02-business-patterns.md  # 有模式时
python3 scripts/compile_fm_model.py <model-dir> --output <model-dir>/generated/model.json
```

不要直接编辑编译 JSON 或 `02-business-patterns.md` 来伪装迁移完成；它们不是事实源。
