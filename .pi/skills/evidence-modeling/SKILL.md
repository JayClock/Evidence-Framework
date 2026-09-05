---
name: evidence-modeling
description: 将合同、服务协议、业务流程、收入/支出、KPI、异常与追责材料建模为机器可读的 Fulfillment Modeling（FM / 8X Flow）Schema v2。凡用户要求创建、更新、审查或校验合同上下文、合约前/渠道上下文、履约请求与确认、凭证链、Role、可选 Party/Place/Thing、跨上下文 Evidence Role、系统触发履约、违约补偿、业务脊梁、关键数据追溯或业务单据模拟时使用。本 skill 生成稳定 ID、显式权利方/义务方、CEL 规则和完成策略的 YAML，构建属性级 lineage，运行追加式 Evidence 场景，并编译确定性 JSON；数据库设计留给后续架构阶段。
---

# Fulfillment Modeling · Schema v2

## 权威规则

先读取 `references/README.md`，再按索引加载任务所需 reference。Schema v2 只接受稳定 `id`、第一等 `fulfillment`、明确关系类型与 CEL；不兼容旧版名称引用、通用 association 或自定义计算 DSL。

## 不可混淆的三个层次

- **Role**：合同或事件上下文中的参与身份，是发现权责的起点。
- **Participant（party/place/thing）**：可能扮演 Role 的稳定领域对象；仅在依据明确或跨上下文身份确有价值时建立。
- **Trigger mechanism**：系统、调度器、API、队列等实现机制；不是业务 Role 或 Participant。

`Role` 不以显式 Participant 为完整性前提。依据明确给出稳定对象扮演某个 Role 时，应建模 `plays_role`；只给出上下文 Role 而没有玩家证据时，必须停在 Role，不得补造 Participant。

## 建模原则

1. 纯领域算法、页面、工具集成或技术流程不强行做 FM；先确认是否存在合同、权责、支付、KPI、验收、异常或审计凭证。
2. 一个 Contract Context 聚合两个 Role 之间的业务交互。Contract 必须且只能引用两个不同的 Party Role，但这些 Role 不要求显式绑定 Participant Party。
3. 先识别合同参与 Role，再从现金收入、现金支出或目标—实际/KPI/SLA 找业务脊梁和凭证链；不要先枚举 Party。
4. 每个履约项明确 Contract、权利方 Role、义务方 Role、Request、一个或多个 Confirmation 目标、完成策略、触发方式、标的物和违约后果。
5. Role 的实际扮演者只按依据证据建立。不得从角色标签自动推导、归并或虚构 Party，也不得因为多个上下文中的标签相似就断言它们由同一对象扮演。
6. 保留 `party`、`domain`、`third_party`、`context`、`evidence` 五种 Role 子类型。Third-party Role 可以作为未展开的外部协作者独立存在。
7. 履约确认可以是具体 Fulfillment Confirmation，也可以是 Evidence Role。外部时刻 Evidence 通过入向 `plays_role` 注册；核心 Role 不枚举实现者。
8. 系统和调度器不是业务参与方。自动动作在 trigger 中记录机制，并用 `actsForRoleRef` 指明它代表哪个合同 Role。
9. 运行时 Evidence 只追加。取消、退款、冲正、更正、补偿和赔偿必须成为新 Evidence 或新 Fulfillment，不覆盖旧凭证。
10. 金额、数量、时间、KPI 与审计结论等关键属性用 `keyData: true` 标识；派生依据只从 CEL AST 提取，不另写重复依赖 DSL。
11. 单据模拟使用独立 `validation/` 测试数据和固定 `asOf`；机器通过不能代替具名业务方确认。
12. FM 保持实现无关；REST、消息、数据库、页面和部署设计不得成为 FM 实体。

## Evidence 工件输入与审核

读取 `artifacts/00-input/requirements.md`、已批准需求、统一语言和限界上下文，直接判断 FM 适用性并生成当前工件，不设置独立问答或单独的基线确认步骤。

按范围 → 双方 Role 与权责 → 请求与触发 → 完成凭证 → 金额/期限/KPI → 异常后果 → 正常与异常案例核对已有材料。区分输入事实、分析假设和待决策项，在领域工件及模型说明中记录来源、影响和待人工处理事项，由 Domain Gate 审核。

缺少材料不等于不适用，不得为了通过校验而编造合同、金额公式或完成凭证。关键依据不足以建立有效模型时，应明确指出阻塞原因，由人工通过修订反馈补充或缩小范围，不提交虚假的成功结果。

Domain Gate 批准不等于模型内具名 `stakeholderReview`；不得自动填写审核人或改变业务演练结论。机器校验、场景模拟和具名业务审核仍是独立证据。

## 默认工作流

1. **确定范围**：Evidence 工作流中使用任务指定的 `artifacts/02-domain/fm-model/`；独立使用且未指定目录时才使用当前工作目录下的 `fm-model/`。
2. **找合同与 Role**：为每个 Contract Context 找到恰好两个上下文 Role；不要求先找到 Party。
3. **找主履约**：沿收入、支出、KPI/SLA 识别权利方、义务方、Request、Confirmation 和业务时限。
4. **找违约履约**：把取消、退款、赔偿、补偿或终止建成新凭证/履约，直到外部争议边界。
5. **找变化点**：按需要引入 Domain Role、Third-party Role、Context Role 和 Evidence Role；跨合同优先通过确定性时刻凭证协作。
6. **按需找 Participant**：最后检查依据是否明确某个稳定 Party/Place/Thing 扮演 Role。明确则建立 `plays_role`；不明确则保留 Role 独立。
7. **写第一等 Fulfillment**：每条责任写入一个 `fulfillments/*.yaml`，不要靠图关系猜测权责与完成条件。
8. **写 CEL 与关键数据**：所有可执行规则放入 `rules/*.yaml`；表达式是纯 CEL，派生目标放在 `target`，重要属性标记 `keyData: true`。
9. **写验证场景**：对金额、KPI、赔偿、审计或复杂完成策略，至少建立一个正常场景和一个异常／追责场景；实例只放在 `validation/`，不混入模型类型。
10. **提交并验证**：语义删除时同步删除过时对象和引用。Evidence 工作流中不要直接写目录或运行以下命令，而应将全部定义交给 `evidence_submit_fm_model`，由扩展执行：

```bash
python3 -m pip install -r <skill-dir>/requirements.txt
python3 <skill-dir>/scripts/validate_fm_model.py <model-dir>
python3 <skill-dir>/scripts/build_fm_lineage.py <model-dir> --output <model-dir>/generated/traceability.json
python3 <skill-dir>/scripts/simulate_fm_model.py <model-dir> --output <model-dir>/generated/simulation.json  # 存在 validation/ 时
python3 <skill-dir>/scripts/compile_fm_model.py <model-dir> --output <model-dir>/generated/model.json
```

1. **人工检查**：执行 `references/validation.md`。正式高风险模型用 `generate_role_play_pack.py` 生成角色演练包；只有真实审核者明确记录后才能把 stakeholder review 标为 confirmed。

## 输出目录

```text
fm-model/
├── model.yaml
├── README.md                    # 完整交付时提供
├── 00-overview.md               # 完整交付时提供
├── 01-glossary.md               # 完整交付时提供
├── 02-business-patterns.md      # 涉及复用/平台化时提供
├── entities/
├── fulfillments/
├── relationships/
├── rules/
├── validation/                  # 可选；测试单据和确定性场景
│   ├── instances/
│   └── scenarios/
└── generated/
    ├── model.json               # 派生产物
    ├── traceability.json        # 派生产物
    └── simulation.json          # 派生产物
```

最小模型包含 `model.yaml`、`entities/`、`fulfillments/`、`relationships/` 和 `rules/`；后两者可为空目录。一个 YAML 文件只放一个文档。文件名使用小写 ASCII kebab-case，引用一律使用稳定 ID。`validation/` 是测试输入而非生产事实；`generated/` 可随时删除重建。

## 输出边界

- 物理表、SQL、Outbox/Inbox 或不可变账本留给 Evidence 的架构阶段。
- API、HATEOAS、OpenAPI、AsyncAPI 或微服务路由是完成 FM 后的独立投影，不写回 FM。
- 材料不足时列明待决策项及影响，通过阶段审核或人工修订反馈补充、缩小范围；不要用技术常识补造合同事实、Party 或金额公式。

## 回复要求

简要说明：

- 识别出的合同上下文、双方 Role 与业务脊梁；
- 明确建立了哪些 Participant→Role 关系，以及证据依据；
- 新增或修改的路径；
- 校验、属性追溯、场景模拟和编译结果；
- `machineValidated`、`simulationPassed` 与 stakeholder review 的实际状态；
- 仍需业务确认的事实。
