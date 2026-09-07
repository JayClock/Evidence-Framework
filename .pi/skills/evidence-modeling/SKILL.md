---
name: evidence-modeling
description: Evidence 唯一建模入口。Init 后从业务叙述主动识别候选上下文：合同引导双方约定与履约项，纯领域引导对象身份与规则，渠道引导真实协商凭证；结合 8X Flow、四色追溯和案例回放迭代，再定稿统一 FM v3 与软件范围及验收。用于业务发现、合同履约、领域或混合建模，不要求用户先定义完整范围或选择建模模式。
---

# 统一 FM / 8X Flow · Schema v3

## 权威规则与本地适配

先读 `references/README.md`。发现交互统一按 `references/discovery-workshop.md`：本地 discovering 提示词已完整加载时不重复读取；独立使用 Skill 或定稿中重开发现时读取。按需加载语义、格式、领域、CEL、追溯与验证 reference。上游及本地差异见 `UPSTREAM.md`。

只有统一 FM v3 一种格式，不新增四色实体类型、不套另一份 DSL。独立使用 references 中的 CLI 不替代本地专用工具与 Gate。所有发现记录、模型和派生产物由扩展受控保存，Agent 不直接写盘。

## Init 后直接识别上下文并引导发现

不设置前置 Requirements 阶段或独立业务基线 Gate。用户先讲业务问题、实际发生的事并提供已有材料，Agent 主动识别有依据的候选上下文，解释依据与不确定点，再围绕具体缺口提问。不要求用户先列范围、合同、履约、页面或验收清单，也不让用户先选择建模模式。

当前任务为 `discovering` 时，读取原始输入、当前快照、最新人工回答和引用材料，按发现指南推进：

- 合同主线：候选合同上下文 → 双方角色与约定 → 履约项 → 请求、期限、完成与确认 → 异常；不把流程中的每个动作都当作履约。
- 领域主线：候选领域上下文与对象 → 身份、属性与关系 → 变化条件、资格、不变条件与计算 → 反例；不为纯领域补造合同。
- 渠道主线：真实邀请、报价或方案 → 请求与回应 → 协商规则 → 按需连接签约来源；RFP/Proposal 不伪装成履约。

这些是可组合的发现主线，不是互斥模式或固定阶段。范围与排除项由 Agent 随发现整理，有影响结果的边界歧义才向人核实，不自行扩大或缩小目标。四色凭证/数据追溯与正常、边界、异常回放贯穿过程；缺口回到相应对象或责任，不重新启动问卷。材料已明确不重复问，依据不足不编造。

## 交互工具与证据

- `evidence_ask_questions`：每次只提出一个核心业务问题，带稳定 Q-ID、焦点、来源、影响、是否阻塞及必填 target（合同／履约引用，尚未定位为 null）。根据最新理解选择缺口，不预排问卷、不在一题中捆绑多个子问题；已有材料或回答明确的事实不重复问。调用后停止，状态为 waiting_answer。历史未答且未暂缓的问题可原文重用同一 Q-ID，不修改历史题意。
- 提问保存且 Agent 完全空闲后，扩展自动显示当前问题的“回答／结束本轮”菜单；选择回答直接打开编辑器并以“事实或决定”保存原文。Esc 仅关闭界面，可用 `/evidence-answer` 重开；未知、排除、跳过或历史更正仍用 `/evidence-answer Q-ID`。扩展自动读取 `gh` 当前认证的 github.com 账号作为回答者，不再要求输入姓名；读取失败须修复 gh 登录或网络后重试，Agent 不代填身份。可标注未知或有理由移出范围，也可按 Q-ID 更正。问答开启时，回答或跳过后自动启动一次消化；必须先保存更新后的候选、案例、focus 和 contractView，再决定下一问或执行草稿／定稿校验。简述本次明确内容、模型变化与剩余缺口，并记入 notes；用户一次补充多项事实时全部吸收。停止标记优先，已结束本轮后补充答案不会自动恢复提问。回答不是模型批准，账号归属不证明操作者实名、业务角色或批准权限。
- `evidence_save_discovery`：保存完整范围、排除项、工作说明、来源、候选及案例。范围是发现成果，不是首轮准入问卷。说明按需覆盖上下文及其关系、双方与履约清单、对象与规则、凭证及数据来源、异常、回放及 gap；区分暂未展开和已确认排除，不编造不适用内容。可在保存后合法停止。
- 问答主界面只显示合同上下文、双方角色、履约权责、当前展开项和当前问题；每次保存必须提供 `contractView`（`contracts`、`current`）。用已有 C-ID 建立有来源的合同／角色／履约关系，权利方和义务方按每项履约确定，不能将某方永久固定为权利方。请求依据、期限、确认依据以及双方中未知的位置均为 null；无合同依据时 contracts 为空、current 为 null，不为纯领域或签约前讨论补造合同。异常引出新履约时记录同一合同内的前序项和触发条件，不编造责任。详见发现指南；不让用户填写技术字段、不生成另一份正式 FM。
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
