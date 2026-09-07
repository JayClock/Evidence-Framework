---
name: evidence-modeling
description: Evidence 唯一建模入口。Init 后直接通过交互式发现，用 8X Flow 权责框架、四色凭证与关键数据追溯、领域规则和案例回放理解业务，再定稿统一 FM Schema v3 并收敛软件范围与验收。适用于领域、渠道、合同履约和混合范围；不要求前置需求文档，不强制没有合同的领域产生合同。
---

# 统一 FM / 8X Flow · Schema v3

## 权威规则与本地适配

先读 `references/README.md`，范围发现读 `references/discovery-workshop.md`；按需加载语义、格式、领域、CEL、追溯与验证 reference。上游及本地差异见 `UPSTREAM.md`。

只有统一 FM v3 一种格式，不新增四色实体类型、不套另一份 DSL。独立使用 references 中的 CLI 不替代本地专用工具与 Gate。所有发现记录、模型和派生产物由扩展受控保存，Agent 不直接写盘。

## Init 后直接开始发现

不设置前置 Requirements 阶段或独立业务基线 Gate。原始输入只需说明问题、目标、初步范围及已有材料。第一轮定位“这次解释什么”，不要求用户预先列完整合同、履约、页面或验收清单。

当前任务为 `discovering` 时：

1. 读取原始输入、当前发现快照和所引用材料；文件是跨 Session 的交接依据。
2. 按实际语义选择入口：纯领域从身份、关系、不变条件开始；纯渠道从协商凭证开始；合同/内部绩效从收入、支出、目标—实际开始。局部范围不补齐整个企业。
3. 使用 8X Flow 识别双方 Role、合同/协议、权利义务、请求、期限、确认和异常。内部绩效须核对谁提目标、谁可同意或拒绝，不预设主管永远是权利方。
4. 在各履约内按四色法寻找凭证，向前追溯依据、向后寻找完成证明；关键金额、数量、时间、比例来自哪里，由谁输入，如何计算，规则变化时引用哪个历史版本。补齐角色、参与者/地点/标的及描述，不机械地把四原型映射为四种 FM 实体。
5. 未履约、部分完成、拒绝、退款、更正与补偿继续展开；没有依据则提问，不用“行业惯例”编造罚金、期限或权限。签约前的 RFP/Proposal 不是履约。
6. 术语、对象、凭证与规则候选共同迭代。通过正常、边界、异常/追责案例回放检查是否只凭当时可见单据就能行动和说明结果；纯领域回放对象规则，不造假 Evidence。
7. 发现缺口就返回相应问题。无需按固定问卷顺序，也不要重复问材料已明确的信息。

## 交互工具与证据

- `evidence_ask_questions`：每次 1–4 个相关问题，带稳定 Q-ID、焦点、来源和影响；调用后停止，状态为 waiting_answer。
- 用户通过 `/evidence-answer` 保存原文及回答者声明；可部分回答、标注未知或有理由移出范围，也可按 Q-ID 更正。回答不是模型批准，姓名声明不是身份认证。
- `evidence_save_discovery`：保存完整范围、排除项、工作说明、来源、候选及案例。说明覆盖凭证清单、关键数据来源与公式、领域规则、异常、案例回放及 gap；不为不适用的范围编造内容。
- 来源引用为 `INPUT`、`SRC-*` 或最新的 `A-*`。SRC 提供项目内原始材料路径及定位，扩展捕获文件摘要。未知/已更正回答不能支持明确事实；材料明确也不等于专家确认。候选 `explicit/inferred/unknown` 和正式模型审核状态独立。
- `evidence_check_model_draft`：仅对完整 FM 候选执行隔离校验、lineage 和适用模拟。结果保存到发现快照，不覆盖正式 FM、不产生 Gate。不完整候选继续放发现记录。
- 每个工具传当前 `expectedRevision`；保存后使用返回的新版本。普通问答不消耗 maxRounds。不要伪造用户回答，也不要为通过模拟而修改业务预期。
- 正常/边界/异常回放分别记录场景、预期、来源及 gap；不适用应说明具体理由。领域回放不代表操作或状态机已执行，后续 Q1/Q2 接续验证。
- `evidence_finalize_discovery`：声明的范围、来源新鲜度、阻塞问题及回放覆盖通过后进入定稿。没有业务依据时可停留、继续追问或缩小范围，不能用“不适用”逃避信息不足。

## 定稿与需求收敛

正式交付顺序，共用一个 Modeling Gate：

```text
统一语言 → 统一 FM → 用户/角色需求 → 问题与 MVP → 故事及验收目录 → Gate
```

统一语言与模型在发现中共同迭代，定稿才按顺序提交。统一语言先依据发现记录（INPUT/SRC/A/C 等 ID），不依赖后生成的 US/AC；FM 同样不读取未来需求或架构。不再独立生成限界上下文、实体/值对象、聚合或领域事件文档。

- 统一语言与需求文档通过 `evidence_submit_artifact` 提交当前指定工件。
- FM 通过 `evidence_submit_fm_model` 提交完整源文件；纯领域/渠道仍适用。只有无独立领域/业务语义的简单胶水才传不适用理由与空 files。
- FM 提交后进入软件需求收敛，不立即产生 Gate；业务模型中的线下、外部和人工活动不自动变成开发需求。
- 需求收敛按 `evidence-requirements` 的方法说明与当前模板，从模型、回放案例及真实痛点提取本次软件职责、MVP、稳定 US/AC 和预期结果。保留追溯，不按数量补造人物、Epic 或故事。
- 定稿中发现矛盾，用 `evidence_ask_questions` 或 `evidence_save_discovery` 重开发现；旧定稿结果失效，从统一语言重新提交，不私改其他工件。进入下游后须先人工回退 Modeling。

## FM 语义职责与边界

- Domain Context：身份、属性、关系、资格、前置条件、不变条件和计算，可独立建模。领域知识不是合同履约的派生物。
- Channel：签约前的 RFP、Proposal、协商及签约来源；没有合同也可独立存在。
- Contract：两个不同 Party Role 的交互聚合；内部绩效与对外交易共用权责机制。
- Fulfillment：父 Contract 的子上下文，包含当前 Request、Confirmation/Evidence Role 和 Rule。合同双方留在父上下文。
- Role 是上下文身份/能力插槽，不等于稳定玩家或系统组件。只有来源明确时建立 Participant→Role 的 plays_role。
- Participant 的 Party/Place/Thing 并列；Party 在 Context 外，Place/Thing 属于 Domain Context。字段通常是属性。
- Trigger 是自动动作机制，用 actsForRoleRef 指向所代表的合同 Role；系统、API、调度器不是业务 Party。
- Request interval 起止引用 required、keyData timestamp；openEndedReason 必须有已确认依据，不代表材料没写期限。
- 使用稳定 ID、CEL、keyData 与 AST lineage。v3 不完整表达操作、状态机、关系基数或复杂算法，README 明确来源、所需行为、未验证部分和下游责任，不补造 Command DSL 或假履约。
- FM Context 不等于 DDD Bounded Context、事务聚合或微服务。不变条件在模型定义，Architecture 决定如何保障。API、SQL、消息与部署不写回 FM。

## 输出与状态

发现快照位于 `artifacts/02-modeling/discovery/<runId>/revision-N.json`，包含用户回答原文、来源摘要和候选；仅由扩展追加。正式需求文档仍保存到 `artifacts/01-requirements/`，目录名不是独立阶段。

统一语言为 `artifacts/02-modeling/ubiquitous-language.md`，FM 根为 `artifacts/02-modeling/fm-model/`：

- 必需 `model.yaml`（schemaVersion: "3.0"）及有效入口 Context、entities/\*.yaml。
- 说明 `README.md`、`00-overview.md`、`01-glossary.md`，词义引用统一语言。
- 按需 `fulfillments/`、`relationships/`、`rules/`、`business-patterns/` 的源 YAML。
- 可选 `discovery/*.md|yaml` 是发现摘要而非第二份事实源；`validation/instances/`、`validation/scenarios/` 是测试数据。
- 禁止提交 `generated/`、`02-business-patterns.md`、`status.md`；扩展校验成功后原子替换并确定性生成。
- 每个 YAML 一个文档，文件名小写 ASCII kebab-case，分片名由 ID 中点替换为双连字符。无履约编译为 fulfillments: []，不能掩盖孤立 Request。

凭证只追加：取消、退款、冲正、更正、补偿新增凭证；不代表所有领域对象不可修改。模型默认 draft / stakeholderReview pending，只有真实具名审核才能改变。机器校验、实际模拟、业务专家审核和 Modeling Gate 四者独立。

模拟器只实例化 Evidence，不实例化 Thing/Party，不证明操作/状态机执行。无适用单据模拟时 simulationPassed 为 null，不是 true。编译、追溯和业务模式视图是派生结果；模式只在有真实复用主张时提取。

回复报告当前焦点、真实依据、待回答问题、实际机器结果和 gap。发现期间可停在提问或保存；定稿任务最后调用指定提交工具。不要把结构检查或模拟成功说成业务确认。
