---
name: evidence-fm
description: 维护 FM 业务建模准则，并根据充分材料或访谈记录生成、更新和校验统一 FM Schema v3 模型、正式术语与验证场景。需要模型判断准则或明确要求正式模型时使用；缺少必要业务依据时返回具体缺口，不执行访谈，不把读取准则当作生成授权。
compatibility: 对话、文件读写及命令执行能力；校验需要 Python 3.10+ 和本包 requirements.txt。
---

# Evidence 正式 FM 建模

负责业务建模知识与正式产物，不维护访谈机制。可以独立消费充分的外部说明、已有 YAML 或访谈记录；材料不足则输出具体缺口，不强制安装其他 Skill。

仅需专业判断时，读取 [业务判断准则](references/business-analysis.md)、[来源追溯](references/provenance.md) 或 [场景校验](references/scenario-validation.md) 的相关分支后返回分析，不执行下列产物生成步骤。专业访谈可由 `evidence-discovery` 只读消费这些准则。

## 执行边界与输入

仅要求正式术语或说明文档时，只处理该产物并保留来源与未决项，不因此创建整套 YAML 或运行单据模拟；完整模型生成／更新再执行相应步骤。

- 遵守项目的任务范围、文件权限与审核要求；没有写入授权时只做分析或只读校验。`.evidence/` 只是默认产物根，不改宿主拥有的 `state.json`、审批或运行记录；项目文件权限与提交要求仍优先。
- 区分“讨论”“生成／修改”和“只校验”。用户明确要求生成或修改，即授权在本次范围内直接编辑当前 FM；讨论、普通回答与停止不是修改授权。只校验不写模型、场景、发现记录或报告文件。编辑授权不是业务批准。
- 读取当前来源、术语、相关发现／问题／案例及现有 FM。默认直接编辑项目根的 `.evidence/fm/`，术语、说明和 validation 与源 YAML 同目录；可重建输出放在其中的 generated。获授权的检查记录统一放在 `.evidence/checks/fm/`。沿用已有文件与用户指定位置，不自动迁移；命令用绝对路径，不向安装目录写项目输出。
- 首次建模读 [语义](references/semantics.md)、[格式](references/format.md) 和 [本批次评估](references/batch-assessment.md)。其余按 [规则索引](references/README.md) 加载。
- 按 [输入复核](references/input-review.md) 消费材料、核对依赖，返回未决项。需要继续澄清时交给访谈任务，不自行选择问题、等待答案或维护问答状态；已有停止／暂缓状态不被模型任务解除。
- 业务任务只读取当前分支指向的方法与运行资源；tests/、evals/ 只在维护本 Skill 或明确运行评测时读取，不能作为项目业务来源。

## 1. 评估能纳入什么

消化全部新增输入，检查本次相关历史成果和来源变更，按具体业务职责及事实依赖评估：

- ready：本批次职责所需事实、来源和判断规则足够明确。
- support：只提供被消费的已知身份、约定或其他支撑事实；不宣称整个上下文完成。
- pending：相关业务缺口仍影响判断，保留但不编成正式规则。

把每项阻塞定位到实际受影响的事实及职责。履约依赖父合同的相关双方与约定，不默认依赖全部条款、签约渠道或兄弟义务；未明的下游补偿不自动阻塞独立主履约。不得通过拆分略去本职责必需规则。

没有可纳入职责时保存评估与原因后停止；不为通过校验把未知改为无责任、自由输入或范围排除。

## 2. 直接编辑当前模型

先说明本次范围、来源、稳定 ID、拟增改／撤回与未决项，读取当前文件及已有 Git 差异后直接编辑 `.evidence/fm/`。保留未受影响事实和用户已有改动，必要支撑引用保持闭合；未知事实不通过模板默认值补齐。修改即落盘，不保证编辑中的目录始终有效。删除或撤回必须属于本次授权范围，并同步清理失效引用。

- 采用唯一 FM v3；纯领域／渠道仍适用，不补造合同。仅无独立业务语义的简单胶水可说明不适用，信息不足不是理由。
- 正式类型源是 `model.yaml` 及各类 YAML 分片；正式术语与说明写 README、overview、glossary，验证场景写 validation。它们由 FM 从有效来源生成，访谈中的工作术语、结构与案例只作为输入，不另维护同步的正式副本。具体要求见格式指南。
- 所有关键数据及六类 Evidence 时间按 [来源追溯](references/provenance.md) 核对；字段齐全或 asserted 标签不等于来源充分。
- 先识别 Context、双方 Role 与责任边界；经办人、岗位和部门不自动成为新的业务 Role，有明确主体依据时保留 Participant，有明确扮演依据才连接 `plays_role`，不得据此扩展其操作权限。不为补齐节点种类制造角色或业务能力。再建立 RFP → Proposal → Contract → Request → Confirmation 的 Evidence 主线。Fulfillment 只表达 Context 边界；Request、Confirmation、Evidence Role 和 Rule 通过 `contextRef` 归属它。
- 属于同一合同责任范围的所有 Evidence 只使用该 Contract 的 `roleRefs` 绑定角色；包括合同前的 RFP／Proposal 及 Other Evidence。Proposal 已连接 Contract 时，合同前 Context 必须通过 `parentContextRef` 关联该 Contract Context；不接受阶段角色或未被根合同绑定的 Party Role。Contract 用双方 `roleRefs`，其余凭证用其中一个 `responsibleRoleRef`。无合同责任关联的独立渠道／领域不补造合同。
- 区分具体凭证与 Evidence Role：后者是 `category: role / kind: evidence` 的证明插槽，没有责任人、自己的凭证时间或可签发实例，不设置 `responsibleRoleRef`／`roleRefs`。消费方以 `uses_role` 使用角色，外部具体时刻凭证以 `plays_role` 扮演；玩家保留其所属上下文的责任归属，不强加消费合同的双方角色。规则可绑定角色，场景必须提供显式玩家的真实实例；不得复制成消费合同内的新单据。
- 六类 Evidence 必须展开各自业务时间及来源。Request 区间只由其 `started_at`／`expired_at` 属性表达；不得用文件名、ID、创建顺序或回调到达时间推断业务先后。
- 每个 Thing 由实际涉及它的 Evidence 通过 `references` 指向。本上下文的 `other_evidence` 补充证明其他凭证：明确证明内容，以 `evidences` 指向被证明的具体 Evidence；跨上下文的确定结果使用 Evidence Role，不以直接 `evidences` 穿透边界；必需补充证据先存在，目标凭证才能形成，以 `precedes`、实例 `basedOn` 和场景可见性落实依赖。先核对证据，再形成结果，不把补充证据当固定流程阶段。Fulfillment 不得成为 Evidence 关系端点或时间线节点。
- Completion 与 Breach 使用有来源的 Evidence 属性、明确 bindings 和 CEL；any、all、count、amount 及具名人工确认都不使用 Fulfillment 内嵌策略。
- label、属性含义和关系说明使用真实业务用语；category、kind 仅作建模分类，不用类型名替代业务名称。有来源的关系基数用 Relationship 两端的 `sourceCardinality`／`targetCardinality` 声明；逐层核对每份协议可有几份申请、每份申请可有几份结果，不把后一层的一对一推定为前一层。说明数量约束的实例范围、存在阶段及确定依据；省略表示未声明，不能默认为多份，也不为简化 API 补造或修改基数。静态通过不代表当前模拟器已验证运行实例数量，也不能替代履约 completion Rule。
- 有履约用“请求 → 确认凭证”，不默认人工审批，不从责任 Role 推断实际证明提供方。
- 业务未知、FM 表达缺口和技术实现事项分开。不能用假凭证／履约表达状态机，API、数据库与部署不写入 FM。
- 用 [变更记录模板](assets/change-summary-template.md) 记录实际模型 ID、变更与来源／案例指针；已有评估和事实引用原记录，仅补充尚未保存的依据。
- 模型默认 `draft` / `stakeholderReview: pending`。仅有真实具名审核依据时才反映其他状态；机器通过不会提升状态。更改已审核语义时，当前修订回到 draft / pending，保留旧版批准依据的引用，说明受影响范围并等待重新审核。

## 3. 校验、修正并展示差异

读取 [校验指南](references/validation.md)。设置 `SKILL_DIR` 为本 SKILL.md 所在目录的绝对路径；使用满足 requirements.txt 的 Python，环境缺失时说明限制，不自动全局安装。

运行只读 `check_fm.py`。结果包含 `modelDigest` 与 `inputChanged`，绑定本次检查的文件内容；检查期间变化使结果无效。校验失败时修正获授权的表达错误后重跑，不倒改业务预期。无法解决或无法执行时明确当前模型未通过／未校验，保留真实错误及已修改文件，不自动回滚。

按 [场景校验](references/scenario-validation.md) 执行适用场景，没有实际执行时 `simulationPassed` 为 null。展示实际增改删、来源、完整差异、Schema／CEL／lineage／simulation／timeline 结果、时间线及未决顺序。已有改动与本轮变更分别说明，Git diff 之外的新文件也须展示。

按 [最小验证记录](references/validation.md#最小验证记录) 将获授权留存的真实输出保存到 `.evidence/checks/fm/`，只校验请求仍不落盘。模型、来源、场景或校验器变化后旧检查不能证明当前版本有效；下游消费前重新校验。

生成的 JSON、lineage、模拟及业务模式文档是可重建派生结果，不手改。Git 用于差异查看和用户明确要求的版本恢复，不自动暂存、提交或回滚。写入、校验与具名业务批准相互独立。

## 4. 完成后停止

交接给出当前模型、本次变更、评估与检查记录的路径、未决项及下一步选择；事实、案例和报告正文留在各自记录中。未保存的报告、未通过的校验或尚未审核的状态照实说明。此次更新不自动恢复访谈、生成需求、进入架构或提交 Git。

如用户另行要求软件需求，可从已更新模型或充分材料开始，不强制使用其他 Skill。
