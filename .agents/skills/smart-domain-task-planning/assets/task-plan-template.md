# {{任务名称：fileName 去掉 .md}}

> 文件保存于编译结果 path。taskKey 是与索引的唯一绑定身份，文件名描述交付结果，不承担排序职责。

## 1. 新会话入口

- 总索引：{{指向 ../index.md 的相对链接}}
- 当前任务：{{在 compiled.tasks 和 taskNotes 中按 taskKey 定位}}
- 项目根/阶段：{{实际定位方式与宿主约束}}
- 必读材料：{{FM/API/架构/测试源路径、稳定源 ID 与版本}}
- 前置产物：{{只读本任务需要的契约和就绪证据，不重做共享工作}}

先检查当前源、局部缺口、前置证据和合法执行状态。文件存在不代表已完成，不依赖聊天记忆。

## 2. 局部设计

- 行为拥有者：{{来自源或显式 designItems}}
- 业务模块：{{对应源 Context 与映射理由、公开接口、内部实现边界和允许依赖}}
- 技术库：{{在统一后端应用的组合根/domain/api/persistent 中的路径与构建依赖，不机械按 Context 建模块}}
- 数据归属：{{表、迁移、写入入口的唯一拥有者；跨模块通过公开契约消费}}
- 关联：{{基数、Ref/导航、窄/宽接口、XML resultMap/对象工厂与迁移}}
- HTTP：{{实际 Root/集合/实体子资源、Context 注入、表示与 URI 模板}}
- 角色与规则：{{真实角色、来源值、业务时间、失败结果；不补造权限}}
- 本地事务：{{业务入口、参与操作、数据源/事务管理器和失败回滚范围}}
- 外部集成：{{仅对已确认远程依赖说明协议、超时、重试与结果登记；无则不补造}}
- 非目标：{{由其他任务交付的共享内容，引用而不复制}}

## 3. 实施与检查

详情只含一个 YAML 块。taskKey/planRef 仅绑定索引，不再次定义身份计算、执行状态、完整依赖图或 API 覆盖。

```yaml
schemaVersion: '2.0'
kind: task-plan
taskKey: '{{compiled.tasks[].taskKey}}'
planRef: ../index.md
sourceRefs: [] # 源 ID 或有依据的 design.*
ruleRefs: []
scenarioRefs: []
storyRefs: [] # 只引用已有 US/AC/TP 等上游标识
acceptanceRefs: []
procedureRefs: []
dependencyUsage: [] # 只解释如何消费 compiled.dependsOn
# - taskRef: <前置 taskKey>
#   consumes: <产物/接口及定位>
#   readinessEvidence: <真实契约/检查依据，不预填通过>
files:
  create: [] # 项目根相对路径
  modify: []
  reuse: []
steps: [] # 根据索引 mode 写普通实现、TDD、复验或人工操作
checks: []
# - id: CHECK-<全计划唯一标识>
#   purpose: <规则/风险及判断目的>
#   quadrant: Q1
#   subject: <真实被测行为>
#   dependencies: <真实模块契约/数据库或 Fake 及其限制；仅在确需远程调用时列协议>
#   inputs: <固定事实、身份、业务时间、并发/故障操作>
#   expected: <结果及失败不变性>
#   testFiles: [<路径>]
#   cwd: <项目根相对工作目录>
#   command: null # 未定必须关联 gap
#   procedure: null
#   preparationTaskRefs: [<已在执行依赖中的 taskKey>]
#   gapRefs: [<缺口标识>]
#   evidenceRequired: <实际执行时需要保存的结果>
completionCriteria: []
observedEvidence: [] # 规划时为空，只记录真实观察
```

正式任务不能只留空步骤/检查就声称可执行。未知输入、命令和环境记为局部缺口，在索引将相应任务标为 blocked。

## 4. 执行与交接纪律

- 业务逻辑在实体/角色；MyBatis 负责映射、加载、写入与并发机制；Resource 不复制业务规则。
- 复用官方分页和超媒体组件，不增设无业务责任的集合包装、Page DTO 或公共表示基类。
- API 模块独立启动真实 HTTP，mock 领域边界而非受测资源、分页或序列化；不依赖 app/persistent/数据库。app 的真实 HTTP + SQL 与装配验证另行保留。
- 按本任务范围验证业务模块公开接口、禁止内部访问/依赖环、表/迁移归属与本地事务回滚，以及 XML/对象工厂、上下文注入、空集合、链接和可编辑 HAL-FORMS。Fake 与 Bean 存在不证明真实 SQL/HTTP、模块封装、并发或授权。
- 模块协作优先走进程内公开契约，不通过本应用 HTTP 接口绕行；只有确有远程依赖才执行远程故障检查，不自动加 RPC、消息或补偿任务。
- 从索引读取 mode：implementation 普通实现与回归，不强制 TDD Skill；tdd 使用完整工序；verify 定位并复跑已有行为。活动工作流要求优先，环境失败不算业务 Red。
- 不修改上游事实以满足代码，不扩大业务/协议范围；缺口只阻塞受影响工作。
- 改名按 taskKey 更新同一文件和索引链接，不复制任务；源或契约变化时审查重验范围。
- 实际结果保存在 observedEvidence 或宿主证据，状态只在索引 taskNotes 中更新。
- 活动流程使用规定工具与审批方式；规划阶段不执行这些实施步骤。
