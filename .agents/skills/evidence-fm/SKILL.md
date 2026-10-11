---
name: evidence-fm
description: 唯一维护合同约定、请求—确认骨架、凭证关键数据追溯、异常递归及领域语言方法。支持方法讨论与术语沉淀；人类确认全部责任终点和全部追责结束后，按授权表达 FM Schema v4 模型及场景，也支持只读校验。缺口只交接，不接管访谈或代替业务批准。
compatibility: 对话、文件读写及命令执行能力；校验需要 Python 3.10+ 和本包 requirements.txt。
---

# Evidence 正式 FM 建模

负责业务建模知识、统一领域语言与模型产物，不维护访谈机制。访谈任务按本包方法当轮沉淀术语；本包独立消费外部说明、已有 JSON 或访谈记录时，同样核对人类追责结束依据，缺少依据则输出具体缺口，不强制安装其他 Skill。

方法讨论与访谈读取 [业务分析](references/business-analysis.md)：从合同及全部主履约进入，先画当前请求—确认骨架，再按 [来源追溯](references/provenance.md) 展开凭证与关键数据；异常新义务重复同一循环。单据推演、参与者与角色扮演及变化点按真实依赖展开，领域和协商走各自分支。术语按 [领域语言沉淀](references/domain-language.md) 当轮维护，案例边界读 [场景校验](references/scenario-validation.md)，递归终点与正式编辑门槛读 [全部追责结束](references/responsibility-closure.md)。这些方法不执行模型 JSON 生成；`evidence-discovery` 只消费方法并管理交互。

发现记录的合同、履约骨架和追溯引用是工作理解，不是当前 FM。讨论仅解释，访谈仅按授权沉淀来源及术语；准入后的正式表达才消费全部依据并创建模型对象。不要将下面的 JSON 映射动作当成访谈问卷。

## 执行边界与输入

仅沉淀术语或维护说明文档时，只处理获授权产物并保留来源与未决项，不因此创建整套 JSON 或运行单据模拟；完整模型生成／更新再执行相应步骤。未建模术语可先于 model.json 存在；落实为模型后，同一 term 条目改为引用，名称与含义归 FM 目标唯一维护。

- 遵守项目的任务范围、文件权限与审核要求；没有写入授权时只做分析或只读校验。只修改本次授权的文件；`.evidence/` 只是默认产物根，不因此获得其他文件或业务确认记录的修改权限。
- 区分“访谈并沉淀领域语言”“生成／修改模型 JSON”和“只校验”。访谈授权限于发现记录和已明确术语，普通回答与停止不扩大到模型 JSON、关系、规则或验证场景。用户明确要求生成或修改模型，提供本次编辑授权；只有追责结束门槛满足后才可直接编辑当前 FM。只聊不落盘或仅记录等更窄要求优先；只校验不写词汇表、模型、场景、发现记录或报告文件。编辑授权不是业务批准。
- 读取当前来源、术语、相关发现／问题／案例及现有 FM。默认直接编辑项目根的 `.evidence/fm/`，词汇表使用 FM 根之外的 `.evidence/glossary.json`，说明和 validation 与模型源 JSON 同目录；可重建输出放在其中的 generated。获授权的检查记录统一放在 `.evidence/checks/fm/`。沿用已有文件与用户指定位置，不自动迁移；命令用绝对路径，不向安装目录写项目输出。
- 首次建模读 [语义](references/semantics.md)、[格式](references/format.md) 和 [本批次评估](references/batch-assessment.md)。其余按 [规则索引](references/README.md) 加载。
- 按 [输入复核](references/input-review.md) 消费材料、核对依赖，返回未决项。需要继续澄清时交给访谈任务，不自行选择问题、等待答案或维护问答状态；已有停止／暂缓状态不被模型任务解除。
- 业务任务只读取当前分支指向的方法与运行资源；tests/、evals/ 只在维护本 Skill 或明确运行评测时读取，不能作为项目业务来源。

## 核对追责结束门槛

在任何模型、规则或验证场景编辑前，按 [全部追责结束](references/responsibility-closure.md) 读取人类确认的业务范围、所有主履约及各层异常、分支终点、未决引用与全局结束原话，重新核对其覆盖的当前来源版本。未满足时不进入建模、不修改对应词汇引用，只交接缺口并保留已有模型；模型任务不自行开始问答。编辑授权不是业务批准，也不能替代人类明确确认全部追责结束。

只读校验与 standalone 术语沉淀走各自分支，不因此获得模型编辑权限。纯领域或独立合同前也按同一方法取得人类关于无适用履约责任的确认，不自动豁免。

## 1. 评估来源与表达

门槛满足后，消化新增输入，按 [本批次评估](references/batch-assessment.md) 建立当前完整责任图、业务依据与拟编辑 FM 对象之间的映射。核对身份、期限、完成证明、异常触发及终点，不以实现切片缩小已确认业务范围。

业务未知或新责任分支使结束确认不再覆盖当前输入时，返回追责结束门槛并停止编辑；仅缺 JSON、CEL 或技术验证表达时如实记录表达限制，不让业务方决定技术槽位。不为通过校验把未知改为无责任、自由输入或范围排除。

## 2. 直接编辑当前模型

先说明本次范围、来源、稳定 ID、拟增改／撤回与未决项，读取当前文件及已有 Git 差异后直接编辑 `.evidence/fm/`。保留未受影响事实和用户已有改动，必要支撑引用保持闭合；未知事实不通过模板默认值补齐。修改即落盘，不保证编辑中的目录始终有效。删除或撤回必须属于本次授权范围，并同步清理失效引用。

- 采用唯一 FM v4；纯领域／合同前仍适用，不补造合同。仅无独立业务语义的简单胶水可说明不适用，信息不足不是理由。
- 正式类型源是 `model.json` 及各类 JSON 分片；`.evidence/glossary.json` 是词汇入口：standalone 维护未建模术语，model 只引用已建模对象／属性，不复制名称和含义。Entity／Relationship 的 `label/notes`、Rule 的 `label/description`、属性的 `label/meaning` 是各自定义的唯一来源。模型落实术语时保留 term ID，将原条目替换为引用并移除独立定义；删除或改名后核对悬空引用。说明写 README、overview，验证场景写 validation。发现记录保存来源、更正和未决理解，不维护同步副本。具体要求见领域语言与格式方法。
- 所有关键数据及六类 Evidence 时间按 [来源追溯](references/provenance.md) 核对；字段齐全或 asserted 标签不等于来源充分。
- 按已确认的约定边界映射 Context、Contract 及双方 Role；合同参数、标的关联、履约结构与实际结果分别表达。再把全部主履约和异常义务的请求—确认骨架、依据凭证与关键数据关系映射为 Evidence、Relationship 和 Rule，保留来源，不把发现记录直接复制成模型。RFP → Proposal → Contract → Request → Confirmation 只表达实际存在的主线，不补齐不存在的阶段。稳定主体和代表依据已明确时建立或复用 Participant 与 `plays_role`；未知不制造玩家，经办人、岗位和部门不自动成为责任 Role，也不扩展其操作权限。Fulfillment 使用 `category: fulfillment`，是合约内的权责履约结构，不是 Context；`contextRef` 指向真实上下文，`fulfillmentRef` 表达履约归属。同一合同内不同履约直接引用具体凭证，不为分组建立证明角色。Confirmation 保留唯一形成上下文，通过 `references` 指向同合同各个对应 Request。Relationship 只使用 `references` 和 `plays_role`，不把时间先后、证明用途或属性派生另建关系种类。
- 属于同一合同责任范围的所有 Evidence 只使用该 Contract 的 `roleRefs` 绑定角色；包括合同前的 RFP／Proposal 及 Other Evidence。Proposal 已连接 Contract 时，合同前 Context 必须通过 `parentContextRef` 关联该 Contract Context；不接受阶段角色或未被根合同绑定的 Party Role。Contract 用双方 `roleRefs`，其余凭证用其中一个 `responsibleRoleRef`。无合同责任关联的独立合同前／领域不补造合同。
- 区分具体凭证与 Evidence Role：后者是 `category: role / kind: evidence` 的证明插槽，没有责任人、自己的凭证时间或可签发实例，不设置 `responsibleRoleRef`／`roleRefs`。消费方凭证以 `references` 引用同上下文的 Evidence-as-Role，外部具体时刻凭证以 `plays_role` 扮演；引用与扮演是两种关系，不为引用角色另设关系类型；玩家保留其所属上下文的责任归属，不强加消费合同的双方角色。规则可绑定角色，场景必须提供显式玩家的真实实例；不得复制成消费合同内的新单据。
- 六类 Evidence 必须展开各自业务时间及来源。Request 区间只由其 `started_at`／`expired_at` 属性表达；不得用文件名、ID、创建顺序或回调到达时间推断业务先后。
- 每个 Thing 由实际涉及它的 Evidence 通过 `references` 指向。具体凭证引用以消费方→形成依据定向；`other_evidence` 保留形成 Context，由消费凭证引用。跨独立上下文无需变化点时可直接引用 Confirmation／Other Evidence，需要替换证明约定时才使用 Evidence Role。必需补充证据先存在，目标凭证才能形成，使用实例 `basedOn`、规则及场景可见性验证；时间线从实际依赖与业务时间派生，不另维护先后关系。类型引用证明角色不表示玩家实例已存在。不把补充证据当固定流程阶段。Fulfillment 不得成为 Evidence 关系端点或时间线节点。
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
