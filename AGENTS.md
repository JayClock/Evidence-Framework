# Evidence 项目宪法

## 行动入口

每次开始、恢复任务或改变方案，先读取 [Guides 导航](docs/guides/index.md)，按任务类型加载必要来源并完成开工检查。不要一次加载整个仓库，也不要依赖聊天记忆。

## 不变量

- 保留 Nx、React/TypeScript、Spring Boot/Java。后端采用模块化单体，业务模块通过进程内公开契约协作；技术分层不等于业务边界。技术选择见 [架构基线](docs/architecture/overview.md)。改变基线需要明确授权及架构决定。
- 业务事实来自 `.evidence/fm/`，API 设计来自 `.evidence/api/api.yaml`；软件范围、实现设计和当前代码行为分别记录，不能相互冒充。生成产物不是新的事实源。
- 区分讨论、编辑和只读验证。未获授权不修改正式 FM/API，不提升审核状态，不补造权限、期限、数据库或外部集成方案。
- 保留已有无关工作树改动。不自动暂存、提交、回滚、重写 Git 历史或删除业务证据。
- 领域行为归实体、Description、ContextRole 和拥有者关联；API 与持久化分别依赖领域，禁止通过 Service、Resource 或 Mapper 接管业务规则。跨业务模块不得访问私有表和内部 Mapper。
- 行为变更必须有相应测试。只有相关 CHECK 和项目质量检查实际通过，才能声称完成；环境失败、历史结果、缓存命中与业务批准分别说明。

## 流程与状态

- 显式建模从 `/evidence-model` 进入，交由 `evidence-modeling`。问答工具每次只问一个业务问题，保存回答或控制状态后再继续。
- 扩展只负责交互；业务记录保存在 `.evidence/`，不建立隐藏状态。
- 需求收敛使用 `evidence-requirements`；实施规划使用 `evidence-task-planning`；执行使用 `evidence-delivery`。
- 外层 PDCA 管任务，内层 Guides → Action → Sensors → Steer 管单次交付。索引 `taskNotes` 是任务状态唯一位置，详情 `observedEvidence` 只记录真实结果。
- 每次只执行一个获授权且就绪的任务；完成后停止。缺口只阻塞受影响任务，不通过改上游、删测试或扩范围制造通过。

## 验证底线

仓库根运行 `npm test`、`npm run lint`、`npm run build`；涉及 Java 还需 `./gradlew check`。前馈文档与路由运行 `npm run guides:verify`。命令的覆盖、环境依赖与证据规则见 [测试指南](docs/engineering/testing.md)。
