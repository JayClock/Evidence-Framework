# Evidence 项目宪法

## 行动入口

每次开始、恢复任务或改变方案，先读取 [Guides 导航](docs/guides/index.md)，按任务类型加载必要来源并完成适用的开工检查。连续问答不是任务重启：同任务续问按当前 Skill 增量承接，必要方法仍在上下文且未变化时不重复加载；来源变化按影响核对。不要一次加载整个仓库，也不要以聊天记忆替代实际业务记录。

## 不变量

- 保留 Nx、React/TypeScript、Spring Boot/Java。后端采用模块化单体，业务模块通过进程内公开契约协作；技术分层不等于业务边界。技术选择见 [架构基线](docs/architecture/overview.md)。改变基线需要明确授权及架构决定。
- 业务事实来自 `.evidence/fm/`，API 设计来自 `.evidence/api/api.json`；软件范围、实现设计和当前代码行为分别记录，不能相互冒充。生成产物不是新的事实源。
- 业务概念按 [领域语言方法](.agents/skills/evidence-fm/references/domain-language.md)使用当前上下文的中文（英文）规范名称，贯穿问答、需求、任务、测试、审查与交接；术语使用不改变定义归属或扩大编辑权限。
- 区分讨论、编辑和只读验证。未获授权不修改正式 FM/API，不擅自提升任务状态或批准业务结论，不补造权限、期限、数据库或外部集成方案。
- 保留已有无关工作树改动。不自动暂存、提交、回滚、重写 Git 历史或删除业务证据。
- 领域行为归实体、Description、Context 接口暴露的角色对象和拥有者关联；Context 实现在适配层独立文件中通过依赖注入提供。API 与持久化分别依赖领域，禁止通过 Service、Resource 或 Mapper 接管业务规则。跨业务模块不得访问私有表和内部 Mapper。
- 行为变更必须有相应测试。只有相关 CHECK 和项目质量检查实际通过，才能声称完成；环境失败、历史结果、缓存命中与业务批准分别说明。

## 流程与状态

- 建模只通过 Skill 执行，显式从 `/skill:evidence-modeling` 或宿主原生 Skill 入口进入。访谈按 FM 的[业务分析](.agents/skills/evidence-fm/references/business-analysis.md)从合同与全部主履约进入，先画当前请求—确认骨架，再追溯凭证及关键数据，异常新义务重复同一循环；单据推演、参与者与角色扮演和变化点按真实依赖展开，领域与工具走对应分支。依据材料直接识别合同上下文，再让用户选择分析哪一个；首次识别及用户要求查看／切换时，从当前业务理解生成仅含经营依据与独立边界充分合同的总览，每项标注现金权责或目标与实际主线，并以谁与谁签订什么合同、实现什么经营目的表达；现金方向注明观察主体。展示专注于经营依据与责任边界。不展示候选／已确认分类，依据不足的线索不作为合同选项。已澄清结束项只展示、不可切换；选择只决定分析焦点，承接已知双方和主履约，不重新确认合同存在或排除责任。单点追溯每轮依据当前理解生成当前位置与简短追溯故事，讲清凭证中的信息来源追到了哪里，再按 Discovery 的依赖前沿成组提出同一业务焦点下各相关凭证前置依据充分、彼此独立的必要问题；履约位置精确到合同、履约项及请求或确认，凭证按业务命名，类型作辅助标签，紧接位置说明凭证责任角色与已明确实际主体；依 Discovery 协议围绕一个业务焦点开展多凭证并行追溯，各来源链深度优先深入及回溯，先追共同依据，分别保留各凭证位置与责任人，必要时用用户故事说明业务目标。不以已明确／尚缺依据等字段表代替故事，不虚构业务实例，不展开全局、不附方法文章信息或准入提醒；全部责任与未决依赖持续参与判断。按 FM 方法当轮维护 `.evidence/glossary.json`：未建模术语保存定义，已建模概念只引用 FM，不重复维护名称和含义；不扩大到模型 JSON、规则、场景或 API 编辑，明确的只读／仅记录要求优先。访谈使用普通对话，每轮一个业务焦点、多个独立问题；依赖不明或用户要求一次一问时逐问，部分回答与逐项暂缓分别承接，收到回答后重算依赖。合同导航、单合同结束确认和全局结束确认各自单独一轮，不与业务问题组混问。术语写入失败立即停止，交接实际结果与未保存内容。
- 正式 FM 的生成、修改、修复及场景编辑，按 FM 的[追责结束准入](.agents/skills/evidence-fm/references/responsibility-closure.md)核对合同级准入或相应范围的全部主履约、各层异常、责任终点、完整责任图、推演与人类结束确认。独立合同可分别闭合；相关未澄清合同使用 Context Role，保留未决项，不隐藏当前合同必要责任或证明缺口，不以同合同局部履约切片放行。全局追责结束另行确认，不作为已闭合独立合同的前置等待条件。停止或暂缓不是追责结束，编辑请求和机器通过不是业务批准；直接调用 FM 或外部材料不能绕过适用门槛。只读检查与术语沉淀保留各自权限。
- 建模入口的生成／修改默认一次触发 FM 编辑与校验、整体 API 设计与校验及同页联合审核；FM 与 API 由同一 FM Skill 维护，FM 检查通过后自动接续 API；API 阶段消费同一检查结果并核对摘要，不重复检查 FM，保留 API 自身校验。FM 先于 API，专业职责与事实源分开。明确只修改 FM、只读或不生成页面等更窄要求优先，普通访谈回答和全局结束确认不自动触发生成；入口的建模访谈默认在有效单合同结束确认后接续正式建模与自动交接，明确仅访谈、不生成、只读或不保存等更窄限制优先，具体授权及接续由 Skill 维护。任一阶段阻塞不声称联合交付完成；不自动批准或进入需求、规划、实施。
- 建模流程、分支、权限和恢复规则由 Skill 唯一维护，Skill 可独立对外安装，不耦合宿主专属工具或命令。业务记录保存在 `.evidence/`，不建立隐藏状态或第二份问题记录；成组问答不改变正式编辑权限、保存语义或人类确认门槛。
- 用户显式要求记录建模过程或会话交接，或建模入口执行单合同建模后的自动交接时，使用 `evidence-handoff`，按当前讨论压缩为 Markdown，引用已有产物，保留未澄清合同、Context Role 引用、未决项、控制意图与人类确认覆盖，返回真实保存路径。
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
