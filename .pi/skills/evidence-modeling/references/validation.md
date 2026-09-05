# FM Schema v2 校验清单

## 自动校验

```bash
python3 scripts/validate_fm_model.py <model-dir>
python3 scripts/build_fm_lineage.py <model-dir> --output <model-dir>/generated/traceability.json
python3 scripts/simulate_fm_model.py <model-dir> --output <model-dir>/generated/simulation.json  # 存在 validation/ 时
python3 scripts/compile_fm_model.py <model-dir> --output <model-dir>/generated/model.json
```

`python3 -m unittest discover -s tests -v` 只在修改 Skill、Schema 或脚本时运行，不是每次业务建模的外部回归评测。

自动校验覆盖：

- JSON Schema、文件位置、文件名、唯一 ID 与引用；
- Context、Evidence、Role、Participant 类型约束；
- Contract 恰好两个同 Context Party Role；
- Role 在没有玩家时仍可独立成立；
- 每个 Request 恰好属于一个 Fulfillment；
- 权利方、义务方和具体 Evidence 责任 Role 一致；
- Confirmation 目标可以是具体 Confirmation 或 Evidence Role；
- completion policy、trigger、违约后果与共享确认理由；
- `plays_role` 的方向、端点与 Evidence Role 跨上下文约束；
- CEL 语法、bindings、属性访问、结果类型和派生目标；
- key data 依据、属性级追溯和派生环；
- 可选 Evidence Instance、acting Role、可见单据、规则求值和 Fulfillment 状态；
- `machineValidated`、`simulationPassed` 与人工 stakeholder review 分离；
- 确定性 JSON 编译及追溯／模拟报告。

## Role / Participant 语义检查

1. Contract 的两个参与方是否首先表示为 Role，而不是被误建成两个 Party？
2. 每个显式 Participant→Role 是否有依据依据？
3. 依据已经明确稳定玩家时，是否遗漏了对应的 `plays_role`？
4. 依据只给出上下文角色而没有玩家证据时，是否错误补造了 Party？
5. 同一 Participant 跨上下文扮演多个 Role 时，是否保持 Role 分离而没有把上下文逻辑塞回 Participant？
6. Third-party、Context、Domain 和 Evidence Role 是否被当成可独立变化点，而不是被强迫绑定 Party？

## Evidence / Fulfillment 语义检查

1. 是否从收入、支出或目标—实际/KPI 找到业务脊梁？
2. 每个 Evidence 能否想象成可留存、签字、盖章、审计或追责的记录？
3. 每个 Fulfillment 是否回答“哪个 Role 有权要求哪个 Role 在何时完成什么”？
4. Request 后什么具体 Confirmation 或 Evidence Role 足以证明完整/部分履约？
5. Roleized Confirmation 是否只由其它 Context 的时刻 Evidence 扮演？
6. 增加新的支付/交付渠道时，核心 Evidence Role 是否无需修改？
7. 系统触发是否用 `actsForRoleRef`，并避免把系统、调度器、服务或队列建成 Party？
8. 金额、时间、数量、KPI、资格和违约条件是否可追溯到 Evidence、输入或 CEL？
9. 取消、退款、冲正、更正和补偿是否新增凭证，而非覆盖旧凭证？
10. 跨上下文是否只通过签约依据、时刻凭证或 Evidence Role？
11. FM 是否混入 API、数据库、页面、SDK、消息或部署对象？
12. 是否至少用一个正常场景和一个异常/追责场景检查凭证链？
13. 每个关键数据项是 Evidence 自身断言，还是能通过 CEL 追溯到前序属性？
14. 角色演练时是否只暴露当时可用单据，而没有提前泄露 facilitator 预期值？
15. 是否把机器校验通过误写成了业务方已经确认？

## 禁止的旧结构

完成前搜索并清除：

- `partyAssignments`；
- `sourceEvidenceRefs`；
- “每个 Role 必须恰好由一个 Party 扮演”；
- 仅由角色名称推导出的占位 Party；
- Contract→Contract 和 Request→Evidence Role 的扮演关系。

## 完成标准

日常模型的结构校验、属性追溯和编译通过；存在 `validation/` 时，全部自动场景通过。正式金额、KPI、赔偿或审计模型还应完成人工单据演练，并由真实审核者记录 stakeholder review。`generated/` 下所有报告均可删除后无损重建。无法确认的玩家或事实记录为假设/待确认项，不用技术常识补齐。
