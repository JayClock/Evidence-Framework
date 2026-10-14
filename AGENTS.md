# Evidence 项目宪法

## 行动入口

每次开始、恢复任务或改变方案，先读取 [Guides 导航](docs/guides/index.md)，按任务类型加载必要来源并完成适用的开工检查。连续问答不是任务重启：同任务续问按当前 Skill 增量承接，必要方法仍在上下文且未变化时不重复加载；来源变化按影响核对。不要一次加载整个仓库，也不要以聊天记忆替代实际业务记录。

## 不变量

- 保留 Nx、React/TypeScript、Spring Boot/Java。后端采用模块化单体，业务模块通过进程内公开契约协作；技术分层不等于业务边界。技术选择见 [架构基线](docs/architecture/overview.md)。改变基线需要明确授权及架构决定。
- 业务事实来自 `.evidence/fm/`，API 设计来自 `.evidence/api/api.json`；软件范围、实现设计和当前代码行为分别记录，不能相互冒充。生成产物不是新的事实源。
- 业务概念按 [领域语言方法](.agents/skills/evidence-fm/references/domain-language.md)使用当前上下文的中文（英文）规范名称，贯穿问答、需求、任务、测试、审查与交接；优先复用已有映射，含义明确且缺英文时直接翻译，不等待人类提供英文；术语使用不改变定义归属或扩大编辑权限。
- 区分讨论、编辑和只读验证。未获授权不修改正式 FM/API，不擅自提升任务状态或批准业务结论，不补造权限、期限、数据库或外部集成方案。
- 保留已有无关工作树改动。不自动暂存、提交、回滚、重写 Git 历史或删除业务证据。
- 领域行为归实体、Description、Context 接口暴露的角色对象和拥有者关联；Context 实现在适配层独立文件中通过依赖注入提供。API 与持久化分别依赖领域，禁止通过 Service、Resource 或 Mapper 接管业务规则。跨业务模块不得访问私有表和内部 Mapper。
- 行为变更必须有相应测试。只有相关 CHECK 和项目质量检查实际通过，才能声称完成；环境失败、历史结果、缓存命中与业务批准分别说明。

## 流程与状态

- 建模只通过 Skill 执行，显式从 `/skill:evidence-modeling` 或宿主原生 Skill 入口进入。访谈以课程的四色建模与 8X Flow 为准，按 FM 的[业务分析](.agents/skills/evidence-fm/references/business-analysis.md)从收入流与成本结构出发，以现金权责、目标—实际对比发现业务，再寻找约定并明确责任双方，用主要履约检验理解；已有经营依据、目标或单一清晰入口直接承接，不重复询问已知事实，不以全局分类或完整合同清单作为进入条件，也不跳过现金权责或绩效约定的核对。合同入口复用已知个人或组织，区分责任主体、经办人与证明提供方；先画当前请求—确认，再追凭证及关键数据，异常新义务重复同一循环。沿外部凭证增量发现其他独立约定与协作，不因第三方出现补造合同，不自动切换焦点；当前主履约清单持续补全，正式编辑前仍核对完整责任。单据推演、跨上下文身份、角色扮演与变化点按真实依赖展开。边界疑问局部检验，不把章节或功能直接当上下文，不因领域归类删除合同责任；领域优先复用成熟方案、澄清业务连接点，必要时才按授权深入，不默认重建内部模型，成熟方案不能替代合同责任判断。多个独立入口需确定优先级，或用户要求查看／切换时，展示当前已知上下文及关联。合同项说明谁与谁达成什么约定、双方主要责任及协作；领域项说明对象与规则，协商项说明方案与回应，不为领域或工具补造现金往来或 KPI，不展示经营依据与责任关系不足的合同选项。总览不证明全局发现已完成，已澄清结束项只供查看；选择只决定焦点，不确认合同存在、排除责任或批准业务。每轮依据当前理解展示同一业务焦点的当前位置与简短追溯故事，讲清信息来源追到了哪里，主动寻找相关请求、确认及支撑凭证中全部可同时澄清的独立必要内容，一起提问；共同前提与其他独立问题同轮提出，局部依赖不导致整轮逐问。履约位置精确到合同、履约项及请求或确认，凭证按业务命名，类型作辅助标签；责任人就是所属合同的一方，紧接位置说明按约定负责的合同责任方与已明确实际主体，经办人与证明提供方另行区分，不另找凭证责任主体。依 Discovery 协议开展多凭证并行追溯，各链依据回答深入及回溯，分别保留所属合同、位置与合同责任方，必要时用用户故事说明业务目标。不以已明确／尚缺依据等字段表代替故事，不虚构业务实例，不展开全局、不附资料出处、方法说明或准入提醒；全部责任与未决依赖持续参与判断。按 FM 方法当轮维护 `.evidence/glossary.json`：未建模术语保存定义，已建模概念只引用 FM，不重复维护名称和含义；不扩大到模型 JSON、规则、场景或 API 编辑，明确的只读／仅记录要求优先。访谈使用普通对话，每轮一个业务焦点，主动查找并成组提出全部独立可问内容；只有用户要求一次一问或查找后确实只有一个可问项时才单问，部分回答与逐项暂缓分别承接，收到回答后重算依赖。上下文导航、单合同结束确认、领域／协商分支结束确认和全局结束确认各自单独一轮，不与业务问题组混问。术语写入失败立即停止，交接实际结果与未保存内容。
- 正式 FM 的生成、修改、修复及场景编辑，按 FM 的[追责结束准入](.agents/skills/evidence-fm/references/responsibility-closure.md)核对合同级准入或相应范围的全部主履约、各层异常、责任终点、完整责任图、推演与人类结束确认。独立合同可分别闭合；相关未澄清合同使用 Context Role，保留未决项，不隐藏当前合同必要责任或证明缺口，不以同合同局部履约切片放行。全局追责结束另行确认，不作为已闭合独立合同的前置等待条件。停止或暂缓不是追责结束，编辑请求和机器通过不是业务批准；直接调用 FM 或外部材料不能绕过适用门槛。领域按复用连接范围或获授权深入范围、独立协商按其实际范围，经 FM 对应分支核对规则／方案、关联责任、正常与反例及人类结束确认，明确本范围没有适用履约责任、无需继续追责；不能将未闭合合同改名为领域绕过准入。只读检查与术语沉淀保留各自权限。
- 建模入口的生成／修改默认一次触发 FM 编辑与校验、整体 API 设计与校验及同页联合审核；FM 与 API 分别由 `evidence-fm` 和独立的 `evidence-api` 维护，建模入口在 FM 检查通过后委派 API；API 阶段消费同一检查结果并核对摘要，不重复检查 FM，保留 API 自身校验。FM 先于 API，专业职责与事实源分开。明确只修改 FM、只读或不生成页面等更窄要求优先，普通访谈回答和全局结束确认不自动触发生成；入口的建模访谈默认在有效单合同或独立领域／协商分支结束确认后接续正式建模与自动交接，明确仅访谈、不生成、只读或不保存等更窄限制优先，具体授权及接续由 Skill 维护。任一阶段阻塞不声称联合交付完成；不自动批准或进入需求、规划、实施。
- 建模流程、分支、权限和恢复规则由 Skill 唯一维护，Skill 可独立对外安装，不耦合宿主专属工具或命令。业务记录保存在 `.evidence/`，不建立隐藏状态或第二份问题记录；成组问答不改变正式编辑权限、保存语义或人类确认门槛。
- 用户显式要求记录建模过程或会话交接，或建模入口执行合同、领域／协商分支建模后的自动交接时，使用 `evidence-handoff`，按当前讨论压缩为 Markdown，引用已有产物，保留全部未澄清上下文、类型与关联、实际 Context Role 等引用、未决项、控制意图与人类确认覆盖，返回真实保存路径。
- 需求收敛使用 `evidence-requirements`；实施规划使用 `evidence-task-planning`；执行使用 `evidence-delivery`。
- 外层 PDCA 管任务，内层 Guides → Action → Sensors → Steer 管单次交付。`plan.yaml` 是任务计划和状态的唯一记录，`tasks[taskKey].status` 是状态唯一位置，`observedEvidence` 只记录真实结果；`review.html` 只是可重建审核投影。
- 每次只执行一个获授权且就绪的任务；完成后停止。交付或停止前清点本轮新增的用户反馈、执行发现与决定，按授权归位或明确交接未保存，不把聊天当作持久状态。缺口只阻塞受影响任务，不通过改上游、删测试或扩范围制造通过。

## 验证底线

仓库根运行 `npm test`、`npm run lint`、`npm run build`；涉及 Java 还需 `./gradlew check`。前馈文档与路由运行 `npm run guides:verify`。命令的覆盖、环境依赖与证据规则见 [测试指南](docs/engineering/testing.md)。

<!-- OPENWIKI:START -->

## OpenWiki

This repository has a generated `openwiki/` evidence index. It is optional just-in-time context, not required startup reading.

- Treat source code and tests as authoritative. A brief's unknowns and review items are verification gaps, not automatic requirements.
- Prefer the narrowest quiet validation that proves the changed behavior. Preserve complete failure output.

The scheduled OpenWiki GitHub Actions workflow refreshes the repository wiki. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
