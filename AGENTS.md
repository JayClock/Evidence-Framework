# Evidence 项目宪法

## 行动入口

每次开始、恢复任务或改变方案，先读取 [Guides 导航](docs/guides/index.md)，按任务类型加载必要来源并完成开工检查。不要一次加载整个仓库，也不要依赖聊天记忆。

## 不变量

- 保留 Nx、React/TypeScript、Spring Boot/Java。后端采用模块化单体，业务模块通过进程内公开契约协作；技术分层不等于业务边界。技术选择见 [架构基线](docs/architecture/overview.md)。改变基线需要明确授权及架构决定。
- 业务事实来自 `.evidence/fm/`，API 设计来自 `.evidence/api/api.json`；软件范围、实现设计和当前代码行为分别记录，不能相互冒充。生成产物不是新的事实源。
- 区分讨论、编辑和只读验证。未获授权不修改正式 FM/API，不擅自提升任务状态或批准业务结论，不补造权限、期限、数据库或外部集成方案。
- 保留已有无关工作树改动。不自动暂存、提交、回滚、重写 Git 历史或删除业务证据。
- 领域行为归实体、Description、Context 接口暴露的角色对象和拥有者关联；Context 实现在适配层独立文件中通过依赖注入提供。API 与持久化分别依赖领域，禁止通过 Service、Resource 或 Mapper 接管业务规则。跨业务模块不得访问私有表和内部 Mapper。
- 行为变更必须有相应测试。只有相关 CHECK 和项目质量检查实际通过，才能声称完成；环境失败、历史结果、缓存命中与业务批准分别说明。

## 流程与状态

- 显式建模从 `/evidence-model` 进入，交由 `evidence-modeling`。访谈按 FM 的[业务分析](.agents/skills/evidence-fm/references/business-analysis.md)从合同与全部主履约进入，先画当前请求—确认骨架，再追溯凭证及关键数据，异常新义务重复同一循环；单据推演、参与者与角色扮演和变化点按真实依赖展开，领域与工具走对应分支。首次识别合同候选及用户要求查看／切换时，从发现记录生成合同上下文总览并由用户选择；已澄清结束项只展示、不可切换，选择不确认边界或排除责任。单点澄清每轮从发现记录引用生成当前进度，履约位置精确到合同、履约项及请求或确认，只展示已明确内容和当前问题，不展开全局、不附方法文章信息或准入提醒；完整责任记录仍保留，不维护当前请求或责任图的副本。先保存原话与来源，再按 FM 方法当轮维护 `.evidence/glossary.json`：未建模术语保存定义，已建模概念只引用 FM，不重复维护名称和含义；不扩大到模型 JSON、规则、场景或 API 编辑，明确的只读／仅记录要求优先。问答工具每次只问一个业务问题，记录与术语任一保存失败就停止，分别交接保存结果。
- 正式 FM 的生成、修改、修复及场景编辑，先按 FM 的[全部追责结束](.agents/skills/evidence-fm/references/responsibility-closure.md)核对人类确认范围内所有主履约及各层异常的终点、完整责任图和人类全局结束原话；未闭合不以局部切片放行。停止或暂缓不是追责结束，编辑请求和机器通过不是业务批准；直接调用 FM 或外部材料不能绕过门槛。只读检查与术语沉淀保留各自权限。
- 建模入口的生成／修改默认一次触发 FM 编辑与校验、整体 API 设计与校验及同页联合审核；FM 先于 API，专业职责与事实源分开。明确只修改 FM、只读或不生成页面等更窄要求优先，访谈和追责结束确认不自动触发生成。任一阶段阻塞不声称联合交付完成；不自动批准或进入需求、规划、实施。
- 扩展只负责交互；业务记录保存在 `.evidence/`，不建立隐藏状态。
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
