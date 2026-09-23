---
name: evidence-fm
description: 维护 FM 建模与领域语言方法，支持访谈中增量沉淀统一术语，并根据充分材料生成、更新和校验 FM Schema v3 模型及验证场景。需要澄清领域语言、维护词汇表或生成／校验模型时使用；缺少依据返回具体缺口，不接管访谈，不把术语写入授权扩大为模型 JSON 编辑。
compatibility: 对话、文件读写及命令执行能力；校验需要 Python 3.10+ 和本包 requirements.txt。
---

# Evidence 正式 FM 建模

负责业务建模知识、统一领域语言与模型产物，不维护访谈机制。访谈任务按本包方法当轮沉淀术语；本包也可独立消费充分的外部说明、已有 JSON 或访谈记录，材料不足则输出具体缺口，不强制安装其他 Skill。

业务访谈先按 [业务判断准则](references/business-analysis.md) 沿经营目标与材料、合约权责、凭证追溯、单据推演、参与者与角色扮演、变化点与边界分析，再按 [来源追溯](references/provenance.md) 和 [场景校验](references/scenario-validation.md) 的适用分支检验依据。术语随业务视图按 [领域语言沉淀](references/domain-language.md) 当轮维护；独立术语任务只读取术语方法。上述分析不执行模型 JSON 生成步骤。`evidence-discovery` 复用这些方法，不复制术语或建模知识。

## 执行边界与输入

仅沉淀术语或维护说明文档时，只处理获授权产物并保留来源与未决项，不因此创建整套 JSON 或运行单据模拟；完整模型生成／更新再执行相应步骤。未建模术语可先于 model.json 存在；落实为模型后，同一 term 条目改为引用，名称与含义归 FM 目标唯一维护。

- 遵守项目的任务范围、文件权限与审核要求；没有写入授权时只做分析或只读校验。只修改本次授权的文件；`.evidence/` 只是默认产物根，不因此获得其他文件或业务确认记录的修改权限。
- 区分“访谈并沉淀领域语言”“生成／修改模型 JSON”和“只校验”。访谈授权限于发现记录和已明确术语，普通回答与停止不扩大到模型 JSON、关系、规则或验证场景。用户明确要求生成或修改模型，即授权在本次范围内直接编辑当前 FM。只聊不落盘或仅记录等更窄要求优先；只校验不写词汇表、模型、场景、发现记录或报告文件。编辑授权不是业务批准。
- 读取当前来源、术语、相关发现／问题／案例及现有 FM。默认直接编辑项目根的 `.evidence/fm/`，词汇表使用 FM 根之外的 `.evidence/glossary.json`，说明和 validation 与模型源 JSON 同目录；可重建输出放在其中的 generated。获授权的检查记录统一放在 `.evidence/checks/fm/`。沿用已有文件与用户指定位置，不自动迁移；命令用绝对路径，不向安装目录写项目输出。
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

- 采用唯一 FM v3；纯领域／合同前仍适用，不补造合同。仅无独立业务语义的简单胶水可说明不适用，信息不足不是理由。
- 正式类型源是 `model.json` 及各类 JSON 分片；`.evidence/glossary.json` 是词汇入口：standalone 维护未建模术语，model 只引用已建模对象／属性，不复制名称和含义。Entity／Relationship 的 `label/notes`、Rule 的 `label/description`、属性的 `label/meaning` 是各自定义的唯一来源。模型落实术语时保留 term ID，将原条目替换为引用并移除独立定义；删除或改名后核对悬空引用。说明写 README、overview，验证场景写 validation。发现记录保存来源、更正和未决理解，不维护同步副本。具体要求见领域语言与格式方法。
- 所有关键数据及六类 Evidence 时间按 [来源追溯](references/provenance.md) 核对；字段齐全或 asserted 标签不等于来源充分。
- 先识别 Context、双方 Role 与责任边界；按业务分析方法沿凭证主动寻找 Party，核对跨上下文同一性和代表依据，再建立或复用 Participant 与 `plays_role`。经办人、岗位和部门不自动成为新的业务 Role，未知玩家保留缺口，不得据此扩展其操作权限。不为补齐节点种类制造角色或业务能力。再建立 RFP → Proposal → Contract → Request → Confirmation 的 Evidence 主线。Fulfillment 只表达 Context 边界；Request、Evidence Role 和 Rule 通过 `contextRef` 归属它；Confirmation 保留唯一形成 Context，并可由同一合同下一个或多个 Request 通过 `precedes` 关联。
- 属于同一合同责任范围的所有 Evidence 只使用该 Contract 的 `roleRefs` 绑定角色；包括合同前的 RFP／Proposal 及 Other Evidence。Proposal 已连接 Contract 时，合同前 Context 必须通过 `parentContextRef` 关联该 Contract Context；不接受阶段角色或未被根合同绑定的 Party Role。Contract 用双方 `roleRefs`，其余凭证用其中一个 `responsibleRoleRef`。无合同责任关联的独立合同前／领域不补造合同。
- 区分具体凭证与 Evidence Role：后者是 `category: role / kind: evidence` 的证明插槽，没有责任人、自己的凭证时间或可签发实例，不设置 `responsibleRoleRef`／`roleRefs`。消费方以 `uses_role` 使用角色，外部具体时刻凭证以 `plays_role` 扮演；玩家保留其所属上下文的责任归属，不强加消费合同的双方角色。规则可绑定角色，场景必须提供显式玩家的真实实例；不得复制成消费合同内的新单据。
- 六类 Evidence 必须展开各自业务时间及来源。Request 区间只由其 `started_at`／`expired_at` 属性表达；不得用文件名、ID、创建顺序或回调到达时间推断业务先后。
- 每个 Thing 由实际涉及它的 Evidence 通过 `references` 指向。`other_evidence` 归属形成并管理它的非履约 Context，不得以 `contextRef` 直接属于 Fulfillment；合同履行期间由本合同形成的补充凭证属于父 Contract Context，并可通过 `evidences` 证明直接子 Fulfillment 的 Request／Confirmation。父合同与直接子履约之间涉及该补充凭证的 `evidences`／`precedes` 是同一合同责任边界内的受限关联；同一合同下多个 Request 可通过 `precedes` 关联共同 Confirmation，跨独立上下文的确定结果仍使用 Evidence Role，不以直接关系穿透边界。必需补充证据先存在，目标凭证才能形成，以 `precedes`、实例 `basedOn` 和场景可见性落实依赖。先核对证据，再形成结果，不把补充证据当固定流程阶段。Fulfillment 不得成为 Evidence 关系端点或时间线节点。
- Completion 与 Breach 使用有来源的 Evidence 属性、明确 bindings 和 CEL；any、all、count、amount 及具名人工确认都不使用 Fulfillment 内嵌策略。
- 每个 Rule 源文件都填写 `description`，用业务语言解释该规则读取什么事实、如何判断或派生、结果表示什么；涉及模型统一术语时使用“中文名称（具体 Entity ID）”，例如“付款请求（request.payment）”“订阅合同（contract.subscription）”“合格付款证明（role.payment-proof）”，不得用 Request、Confirmation 等泛型名称代替具体对象；不能只复述 `label`、照抄 CEL，或把技术实现说明当作规则解释。具体结构见 [CEL 规则](references/cel-rules.md)。
- label、属性含义和关系说明使用真实业务用语；category、kind 仅作建模分类，不用类型名替代业务名称。有来源的关系基数用 Relationship 两端的 `sourceCardinality`／`targetCardinality` 声明；逐层核对每份协议可有几份申请、每份申请可有几份结果，不把后一层的一对一推定为前一层。说明数量约束的实例范围、存在阶段及确定依据；省略表示未声明，不能默认为多份，也不为简化 API 补造或修改基数。静态通过不代表当前模拟器已验证运行实例数量，也不能替代履约 completion Rule。
- 有履约用“请求 → 确认凭证”，不默认人工审批，不从责任 Role 推断实际证明提供方。
- 业务未知、FM 表达缺口和技术实现事项分开。不能用假凭证／履约表达状态机，API、数据库与部署不写入 FM。
- 按项目要求的交接记录记录实际模型 ID、变更与来源／案例指针；已有评估和事实引用原记录，仅补充尚未保存的依据。
- 模型文件不保存审核或生命周期状态。变更由项目 PDCA 触发；业务确认依据随发现记录与计划索引／任务记录维护，机器通过不构成确认，Agent 不提升也不推断状态。

## 3. 校验、修正并展示差异

读取 [校验指南](references/validation.md)。设置 `SKILL_DIR` 为本 SKILL.md 所在目录的绝对路径；使用满足 requirements.txt 的 Python，环境缺失时说明限制，不自动全局安装。

模型及对应词汇引用更新后，运行只读 `check_glossary.py <词汇表> --fm <模型根>` 和 `check_fm.py`，分别核对定义拥有者／引用及 FM 行为。FM 检查结果包含 `modelDigest` 与 `inputChanged`，绑定本次检查的文件内容；检查期间变化使结果无效。校验失败时修正获授权的表达错误后重跑，不倒改业务预期。无法解决或无法执行时明确当前模型未通过／未校验，保留真实错误及已修改文件，不自动回滚。

按 [场景校验](references/scenario-validation.md) 执行适用场景，没有实际执行时 `simulationPassed` 为 null。展示实际增改删、来源、完整差异、Schema／CEL／lineage／simulation／timeline 结果、时间线及未决顺序。已有改动与本轮变更分别说明，Git diff 之外的新文件也须展示。

按 [最小验证记录](references/validation.md#最小验证记录) 将获授权留存的紧凑运行清单保存到 `.evidence/checks/fm/`，只校验请求仍不落盘。模型、来源、场景或校验器变化后旧检查不能证明当前版本有效；下游消费前重新校验。

生成的 JSON、lineage、模拟及业务模式文档是可重建派生结果，不手改。Git 用于差异查看和用户明确要求的版本恢复，不自动暂存、提交或回滚。写入、校验与具名业务批准相互独立。

## 4. 完成后停止

交接给出当前模型、本次变更、评估与检查记录的路径、未决项及下一步选择；事实、案例和报告正文留在各自记录中。未保存的报告或未通过的校验照实说明。此次更新不自动恢复访谈、生成需求、进入架构或提交 Git。

如用户另行要求软件需求，可从已更新模型或充分材料开始，不强制使用其他 Skill。
