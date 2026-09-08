---
name: evidence-modeling
description: Evidence 唯一建模入口。Init 后从业务叙述主动识别候选上下文：合同引导双方约定与履约项，纯领域引导对象身份与规则，渠道引导真实协商凭证；结合 8X Flow、四色追溯和案例回放迭代，再定稿统一 FM v3 与软件范围及验收。用于业务发现、合同履约、领域或混合建模，不要求用户先定义完整范围或选择建模模式。
---

# 统一 FM / 8X Flow · Schema v3

## 权威规则与本地适配

首次需要规则索引时读 `references/README.md`，不逐轮重读。发现交互统一按 `references/discovery-workshop.md`：本地 discovering 的固定系统上下文已完整加载方法时不重复读取；独立使用 Skill 或尚未加载指南的定稿重开发现时读取。按需加载语义、格式、领域、CEL、追溯与验证 reference。上游及本地差异见 `UPSTREAM.md`。

只有统一 FM v3 一种格式，不新增四色实体类型、不套另一份 DSL。独立使用 references 中的 CLI 不替代本地专用工具与 Gate。所有发现记录、模型和派生产物由扩展受控保存，Agent 不直接写盘。

## Init 后直接识别上下文并引导发现

不设置前置 Requirements 阶段或独立业务基线 Gate。用户先讲业务问题、实际发生的事并提供已有材料，Agent 主动识别有依据的候选上下文，解释依据与不确定点，再围绕具体缺口提问。不要求用户先列范围、合同、履约、页面或验收清单，也不让用户先选择建模模式。

当前任务为 `discovering` 时，优先使用扩展提供的本轮有界上下文包；首次或需核对时读取原始输入，其余按明细行号补读当前对象与引用材料。未内嵌的待消化人工输入须全部读完，不要求逐轮重读完整视图、已消化历史回答或方法文件。按发现指南推进：

- 合同主线：候选合同上下文 → 双方角色与约定 → 履约项 → 展示“履约请求 → 确认凭证”候选 → 核实关键缺口、期限与异常；不把流程中的每个动作都当作履约。候选先展示谁向谁提出什么要求、谁提供或形成什么凭证证明什么结果，再问一个关键缺口。Confirmation 不默认是人工审批，不从权责方推导确认人；独立验收须有业务依据。
- 违约责任发现贯穿合同主线：主动逐项检查主要履约及新增补偿履约的违约后果，展示有依据的前序、触发条件、新履约请求与确认凭证，递归核实直到明确法律边界或无后续义务的约定终点。缺少约定只提出具体情景与责任缺口，不编造罚金或默认诉讼；自动终止且无额外义务不另造履约。按发现指南在 notes 保留各项覆盖、终点依据和未知，不把暂缓或范围外当作责任闭合；仍逐轮只问一个问题并服从人工停止。
- 领域主线：候选领域上下文与对象 → 身份、属性与关系 → 变化条件、资格、不变条件与计算 → 反例；不为纯领域补造合同。
- 渠道主线：真实邀请、报价或方案 → 请求与回应 → 协商规则 → 按需连接签约来源；RFP/Proposal 不伪装成履约。

所有主线采用发现指南第1节的“四色追溯的统一循环”：识别对象／凭证并展开属性 → 复用已有事实 → 追溯关键数据的业务来源 → 区分直接记录、引用已有值、规则派生与来源待明确 → 保存依据／缺口 → 必要时逐问并回放。不以“觉得需要派生”作为追溯入口；金额、数量、比例、时间及领域结论均适用。公式可以没有，业务来源不能由字段存在、asserted 标签或机器校验通过代替。推断只作候选，不默认自由输入、不编造公式；人工已明确的来源和非派生约定直接保留。先保存新增理解，再只问影响当前判断的真实缺口；来源性质未知先问确定依据，不预设算法或要求人写 CEL。技术映射交 Architecture，FM 表达由 Agent 补模或记录，不将业务规则交下游自定，不把追溯清单变为问卷。

从首轮直接展开凭证类型时间：rfp／proposal／fulfillment_request 的 `start_at`、`expired_at`，contract 的 `signed_at`，fulfillment_confirmation 的 `confirmed_at`，other_evidence 的 `created_at`。类型属性定义不等待实例日期或生成公式，但展开后仍按同一个四色循环追溯来源。例如 deadline 可保留“以本次付款请求的截止时间（expired_at）为准”，确定依据未知则一并标明；不能据此宣称期限已查明或解除阻塞。时刻凭证不补请求区间，不默认签约等于生效、确认等于回调或凭证形成等于原事件发生。所有必备属性在 Entity YAML 显式定义为 required、keyData timestamp；实例仍须有各自确定时间值，不允许无期限或 `openEndedReason`。详见发现指南的类型示例及 `references/format.md`。

这些是可组合的发现主线，不是互斥模式或固定阶段。范围与排除项由 Agent 随发现整理，有影响结果的边界歧义才向人核实，不自行扩大或缩小目标。四色凭证/数据追溯与正常、边界、异常回放贯穿过程；缺口回到相应对象或责任，不重新启动问卷。材料已明确不重复问，依据不足不编造。

## 交互工具与证据

- `evidence_ask_questions`：提问前先展示有来源的候选结构、依据及不确定点，并保存新增理解；无约定依据时先问具体事实，不补造履约。每次只提出一个核心业务问题，带稳定 Q-ID、新题必填 gapKey（对象与事实维度，同一缺口不换标识）、焦点、来源、影响、是否阻塞及必填 target（合同／履约引用，尚未定位为 null）。根据最新理解选择缺口，不预排问卷、不在一题中捆绑多个子问题；已有材料或回答明确的事实不重复问。调用后停止，状态为 waiting_answer。历史未答、未关联有效解决依据且未暂缓的问题可原文重用同一 Q-ID，不修改历史题意。运行时拦截同 gapKey 和部分文本重题，不代表识别了所有语义改写。
- 提问保存且 Agent 完全空闲后，扩展自动显示当前问题的“回答／结束本轮”菜单；选择回答直接打开编辑器并以“事实或决定”保存原文。Esc 仅关闭界面，可用 `/evidence-answer` 重开；未知、排除、跳过或历史更正仍用 `/evidence-answer Q-ID`。扩展自动读取 `gh` 当前认证的 github.com 账号作为回答者，不再要求输入姓名；读取失败须修复 gh 登录或网络后重试，Agent 不代填身份。可标注未知或有理由移出范围，也可按 Q-ID 更正。问答开启时，回答或跳过后自动启动一次消化；必须先保存更新后的候选、案例、focus 和 contractView，再决定下一问或执行草稿／定稿校验。简述本次明确内容、模型变化与剩余缺口，并记入 notes；用户一次补充多项事实时全部吸收。停止标记优先，已结束本轮后补充答案不会自动恢复提问。回答不是模型批准，账号归属不证明操作者实名、业务角色或批准权限。
- `evidence_save_discovery`：只追加本轮发现记录，提交 `summary`、`sourceRefs`、`records`，不再提交完整 content 快照。记录类型为 scope、position、note、source、candidate、case、contract、fulfillment、resolution、withdraw。新对象 `supersedes=null`；更正或撤回必须引用当前 `recordHeads` 中该对象的 D-ID，扩展分配新 D-ID，历史不可修改或删除。未提及的对象保持不变；撤回不抹去历史，须说明依据并处理悬空关系。范围、排除项、工作说明、来源、候选及案例由记录链派生。每个候选必须提供短名称 label（1–40字符、单行、无首尾空白）与完整说明 description；名称只用于识别，不含职责、依据、缺口或候选标记。请求／确认各用简短业务说明，详细分析放 description／notes；保留已明确事实，仅将局部未知记为缺口。不兼容旧快照，不提供迁移。范围是发现成果，不是首轮准入问卷。说明按需覆盖上下文及其关系、双方与履约清单、对象与规则、凭证及数据来源、异常、回放及 gap；区分暂未展开和已确认排除，不编造不适用内容。可在保存后合法停止。
- `resolution` 是已有事实对历史未答／未知问题的解决关联，不是人工回答。记录 questionId、conclusion、reasoning、sourceRefs、citations（sourceRef、逐字 quote），每个来源须有摘录；仅引用 `INPUT`、有效 `SRC-*` 或最新 answered `A-*`，说明完整覆盖或确定性推导，不生成 A-\*、不代作决定、不替代已有人工事实／排除。有效关联解除该题待答及阻塞，题目和回答原文保留；来源版本／文件、引用回答或该题后续人工回答变化会使关联失效。修订／撤回引用 recordHeads 中 resolution:Q-ID 的 D-ID；失效、撤回不自动追问或恢复人工停止／暂缓，真实缺口仍须处理。摘录校验不证明结论成立，相关矛盾由人工解决。
- 问答主界面显示合同上下文、双方角色、当前候选履约的请求端／要求及依据／期限／确认凭证和当前问题；标题和箭头两端只显示 label；当前详细说明与来源按 F2 查看，完整结构和各候选描述通过 /evidence-status 查看，TUI 工具结果不重复输出。`contractView`（`contracts`、`current`）由扩展派生，不全量提交：contract 记录合同与双方，fulfillment 记录单个履约及 contractRef，position 记录 focus 与 current；只追加发生变化的记录。用已有 C-ID 建立有来源的合同／角色／履约关系，权利方和义务方按每项履约确定，不能将某方永久固定为权利方。request 记录请求要求及依据（代表／经办人须有来源），confirmation 记录谁提供或形成什么凭证、证明什么结果；部分已知保留已知内容并标明剩余待明确，全未知的请求、期限、确认以及双方中未知的位置均为 null；无合同依据时 contracts 为空、current 为 null，不为纯领域或签约前讨论补造合同。异常引出新履约时记录同一合同内的前序项和触发条件，不编造责任。详见发现指南；不让用户填写技术字段、不生成另一份正式 FM。
- 不增加独立查询工具。扩展启动／续轮／恢复的上下文包只内嵌待消化输入、当前对象和相关缺口，完整方法位于固定系统上下文。需要细节时按所给 read offset/limit 分页读取 `.evidence/cache/discovery/<runId>/context-details.md`：逐对象保留原文、当前 D-ID、失效标记及完整索引；current.json 仍保留完整视图，不作为每轮必读输入。核对 revision，写入后的新版本不复用旧行号。摘要遗漏不是无此事实、已解决或范围排除；未内嵌的新人工输入必须全部补读后再消化。完整就绪检查仍覆盖所有相关对象、来源、阻塞及回放。历史依据按 D-ID 对应的 revision 文件读取。两个缓存均可覆盖重建，不是凭证、独立业务来源或 Gate 输入；恢复与校验始终以不可变日志为准。单个 revision 文件不再是完整快照，不能只读链尾就当作全部理解。
- 来源引用为 `INPUT`、`SRC-*` 或最新的 `A-*`，D-ID 只用于解释的更正与追溯，不是独立业务来源。SRC 提供项目内原始材料路径及定位，扩展在追加该来源版本时捕获文件摘要，并将依赖解释绑定到该版本；来源更正后必须显式更正相关解释，不能静默刷新摘要。未知/已更正回答不能支持明确事实；材料明确也不等于专家确认。候选 `explicit/inferred/unknown` 和正式模型审核状态独立。
- `evidence_check_model_draft`：仅对完整 FM 候选执行隔离校验、lineage 和适用模拟。结果作为机器检查记录追加，不覆盖正式 FM、不产生 Gate。不完整候选继续放发现记录。
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
- Request interval 必须以 startAttribute／endAttribute 分别引用 `start_at`／`expired_at`；各凭证的类型级时间属性均为 required、keyData timestamp。废止 openEndedReason，源 YAML 缺字段、旧命名及实例缺确定时间值仍不合格；类型层允许非派生时间属性，不要求每个时间都派生；定稿仍须核对业务来源、影响当前判断的缺口及真实冲突。
- 使用稳定 ID、CEL、keyData 与 AST lineage。v3 不完整表达操作、状态机、关系基数或复杂算法，README 明确来源、所需行为、未验证部分和下游责任，不补造 Command DSL 或假履约。
- FM Context 不等于 DDD Bounded Context、事务聚合或微服务。不变条件在模型定义，Architecture 决定如何保障。API、SQL、消息与部署不写回 FM。

## 输出与状态

发现日志版本为 v4，每次交互追加一个 `artifacts/02-modeling/discovery/<runId>/revision-N.json`，只保存本轮事件及前序摘要，不重复完整现状。问题、人工回答（含前次 A-ID）、Agent 发现记录、人工控制和机器检查分别留痕。当前完整视图由扩展校验整条摘要链并重放生成，不作为另一份事实源。D-ID 格式为 D-版本号-记录序号（均至少三位），由扩展分配；当前视图由扩展自动提供，按需用 read 读取，不直接写盘。正式需求文档仍保存到 `artifacts/01-requirements/`，目录名不是独立阶段。

统一语言为 `artifacts/02-modeling/ubiquitous-language.md`，FM 根为 `artifacts/02-modeling/fm-model/`：

- 必需 `model.yaml`（schemaVersion: "3.0"）及有效入口 Context、entities/\*.yaml。
- 说明 `README.md`、`00-overview.md`、`01-glossary.md`，词义引用统一语言。
- 按需 `fulfillments/`、`relationships/`、`rules/`、`business-patterns/` 的源 YAML。
- 可选 `discovery/*.md|yaml` 是发现摘要而非第二份事实源；`validation/instances/`、`validation/scenarios/` 是测试数据。
- 禁止提交 `generated/`、`02-business-patterns.md`、`status.md`；扩展校验成功后原子替换并确定性生成。
- 每个 YAML 一个文档，两空格缩进、块式结构；文件名小写 ASCII kebab-case，分片名由 ID 中点替换为双连字符。无履约编译为 fulfillments: []，不能掩盖孤立 Request。
- 所有 Entity 业务属性名统一小写 `snake_case`，同步 CEL、派生 target、实例 values 和追溯路径；`contextRef`、`valueType` 等协议键保持 Schema 原名。属性定义顺序为 name、label、valueType、required、keyData、meaning、derivedByRuleRef、notes，可选键按需省略。命名／引用硬校验，排版不改变语义；不由编译器自动改名。详见 `references/format.md`。

凭证只追加：取消、退款、冲正、更正、补偿新增凭证；不代表所有领域对象不可修改。模型默认 draft / stakeholderReview pending，只有真实具名审核才能改变。机器校验、实际模拟、业务专家审核和 Modeling Gate 四者独立。

模拟器只实例化 Evidence，不实例化 Thing/Party，不证明操作/状态机执行。无适用单据模拟时 simulationPassed 为 null，不是 true。编译、追溯和业务模式视图是派生结果；模式只在有真实复用主张时提取。

回复报告当前焦点、真实依据、待回答问题、实际机器结果和 gap。发现期间可停在提问或保存；定稿任务最后调用指定提交工具。不要把结构检查或模拟成功说成业务确认。
