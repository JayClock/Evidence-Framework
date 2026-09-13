---
name: evidence-task-planning
description: 基于任意 FM Schema v3 规划 smart-domain 实施任务，固定采用模块化单体、业务模块边界与组合根/实现库分离、MyBatis XML 领域映射和 Jersey 子资源。用户要求从 .evidence/fm/ 划分任务、共享工作去重、确定性 taskKey、API 覆盖或总索引加可读任务文件时使用。程序提取工作单元和编译显式切片，Agent 补充有来源的设计与验收；不生成产品代码或改写 FM。
compatibility: Python 3.10+，PyYAML；消费 FM Schema v3，可选 API Schema 4.0。
---

# Evidence 实施任务规划

**业务事实来自 FM，可读文件名面向人，稳定 taskKey 面向机器。** 显式声明切片，程序计算身份、依赖和覆盖；不内置特定行业、实体、金额、时限或流程。

## 固定范围

- 架构固定为模块化单体 `modular-monolith`：后端统一构建、发布，每个应用实例内的模块通过进程内公开契约协作。业务模块有明确行为、数据所有权和依赖方向，不默认拆服务或增加模块间 RPC。
- 业务模块与技术分层分别设计：domain/api/persistent 是技术职责划分，不等于已建立业务边界；FM Context 不机械对应一个 Gradle 模块。根据业务内聚性和变更原因记录合并、拆分或不映射的依据。
- 外部系统作为本应用的外部依赖处理；若需求要求拆开本后端业务模块独立发布，先记录架构决策缺口并澄清受影响的部署方案，不在固定 profile 下暗中生成多个部署单元。
- 生产持久化固定 MyBatis；数据库引擎、方言、数据源和隔离级别仍需依据。
- 完整采用 smart-domain BOM、Core、官方 MyBatis Starter 和 Jersey/HATEOAS/HAL-FORMS 集成，Boot 目标 3.5.x。固定上游源码版本并核对实际依赖，不把安装成功当作兼容验证。
- `apps/<应用>` 为组合根，`libs/<后端>/{domain,api,persistent}` 为真实构建模块；业务边界在这些库中按包/接口表达，必要时有依据地细化构建模块，名称沿用项目。用可见性、依赖约束与架构测试验证封装，不靠目录命名宣称隔离。
- 领域行为归实体、Description、ContextRole 和拥有者关联，不增加业务 Service 编排贫血实体。MyBatis XML 直接映射领域对象，不无故增加 Row/PO 转换层。
- Jersey 从 Root API 导航到根集合和绑定实体的子资源。复用 smart-domain `Pagination`，默认直接返回其结果；不另造分页算法、独立集合模型、Page DTO 或仅包装链接方法的公共表示基类。
- API 模块有自己的真实 HTTP + mock 领域测试；app 的真实持久化与装配测试另行保留。执行模式以当前任务计划为准，实施需保留回归检查。

## 输入、权限与输出

默认读取 `.evidence/fm/`，可接受其他 FM 根；可选读取 `.evidence/api/api.yaml`、业务说明、架构、测试契约与现有代码。纯领域模型同样适用，不补造合同、履约或 API。

只在用户要求生成或更新计划时写计划文件。讨论只解释，维护 Skill 不等于生成实际业务任务。FM、API、产品代码、依赖和审核记录只读；只维护本次授权的计划文件。

```text
docs/plans/smart-domain/
├── index.md
└── tasks/
    └── <具体交付结果>.md
```

目录沿用用户指定位置。文件名描述本任务交付结果，必要时增加上下文或技术责任前缀；它不表示任务身份或执行顺序。

## 必读资源

- [任务前馈装配协议](references/guides.md)
- [固定架构与设计规则](references/design-rules.md)
- [工作单元、切片与文件命名规则](references/slicing-policy.md)
- [后端组织与分层测试](references/backend-layout.md)
- [固定上游依据](references/upstream.md)
- [总索引模板](assets/plan-index-template.md)与[任务详情模板](assets/task-plan-template.md)

资源路径相对 Skill 目录；命令使用实际绝对路径，不假设安装目录。

## 工作流

### 1. 读取真实来源与项目前馈

从项目指令定位 Guides 导航，按前馈协议读取软件范围/验收、架构与模块设计、质量属性、相关术语、规范、howto 和真实范例；消费项目没有导航时定位等价的实际来源，不要求创建空文件。区分项目宪法、项目基线、工程指南与任务 Guides，Skill 不复制项目知识库。

核对当前工作树和合法阶段；读取全部 FM 源 Context、实体、关系、规则、场景及引用实例，保留审核状态与未决事实；生成目录仅作参考。业务活动不自动等于已批准软件范围，已有 API 的覆盖与范围冲突需要澄清，不以排除能力绕过编译。

读取实际模块、构建、测试、数据库与运行配置，区分技术层和业务模块；记录 FM 到业务模块的映射、公开契约、内部实现、表/迁移归属及本地事务边界。有 API 时读取资源和稳定能力 ID、角色变体及非接口活动。路由和 OpenAPI operationId 不等于任务身份。无法确认已有行为时，不标为已实现或已复用。

### 2. 提取工作单元

```bash
python3 "$SKILL_DIR/scripts/task_compiler.py" inventory --fm "$PROJECT_ROOT/.evidence/fm"
```

有 API 时增加 `--api "$PROJECT_ROOT/.evidence/api/api.yaml"`。程序只向 stdout 输出 JSON，不写业务文件。

提取上下文设计、根集合、实体、凭证、主体/证明/领域角色、关联、规则、场景、API 资源/能力和固定平台工作。具体实例作为场景输入，不逐单创建任务，不按每个字段生成 CRUD。

`sourceEdges` 是来源之间的业务引用，不是开发执行依赖。源图可以有业务上合理的环，任务依赖图必须无环。

### 3. 明确切片、归属与文件名

先选可验收业务结果，再识别最小共享基础与实现工作。每组明确：

```yaml
concern: domain
ownerRef: <拥有者的源 ID>
operationRef: <操作的源 ID>
fileName: <具体交付结果>.md
unitKeys: [<本任务唯一拥有的工作单元 key>]
dependsOn: [<前置 taskKey>]
```

- 工作单元只实现一次，其他任务通过依赖消费；相关规则可合入同一操作，不机械按技术层或每条规则拆任务。
- 没有可用源操作 ID 时，在 `slicing.designItems` 中登记稳定 `design.*`、源引用及设计理由；不能以任意标题代替业务依据。
- `fileName` 必填、可读且全计划唯一，由 Agent 根据真实交付结果命名。不要用序号表达执行顺序；名称变化不改变 taskKey。
- 未决定的工作留在未分配项；只有有来源的外部责任或不适用事项才登记 disposition。固定平台与已有 API 能力不能被排除。
- 模块依赖公共契约，不直接访问其他模块的 Mapper、内部实体实现或私有表；引用/导航、落表与权限需实际依据。共享数据库不授予跨模块任意读写权限。
- 按业务不变条件明确本地事务入口、参与者、数据源/事务管理器和失败回滚范围；同进程不自动形成一个大事务。只有明确的外部系统调用或独立部署需求，才局部规划协议、重试、幂等或补偿；外部 Context/证明来源本身不意味着网络调用。

### 4. 编译身份、依赖和覆盖

把映射保存在索引唯一 YAML 块的 `slicing` 中：

```bash
python3 "$SKILL_DIR/scripts/task_compiler.py" compile \
  --fm "$PROJECT_ROOT/.evidence/fm" --mapping "$PLAN_DIR/index.md"
```

有 API 时增加 `--api`。要求结构覆盖完整时增加 `--require-complete`；诊断或未分配项会使其失败，不手改输出绕过检查。

```text
taskKey = encode(concern) :: encode(ownerRef) :: encode(operationRef)
path    = tasks/ + fileName
```

使用程序的百分号编码函数。任务只有 taskKey 一个稳定身份；依赖、执行顺序、API 主交付/支持任务、状态记录、缺口及任务详情均以它关联。文件名、标题、成员顺序、路由及展示顺序不参与身份计算。

程序校验任务去重、工作单元归属、引用、依赖环、文件名安全与唯一性，计算 API 主交付任务及支持任务闭包。相同 FM/API 与显式映射产生相同结果；程序不替 Agent 判断最佳切片或业务合理性。

### 5. 生成总索引与可读任务文件

- 索引 `slicing` 是设计输入；`compiled` 是不可手改的计算投影；`taskNotes` 只保存执行模式、状态、结果说明与局部缺口。
- 每个任务在 `tasks/<fileName>` 有一个详情文件，通过唯一 YAML 块中的 `taskKey` 和 `planRef` 绑定索引。
- 详情是当前任务的 Guides：必读材料区分业务与工程基线，procedureRefs 引用真实规范/howto/范例，局部设计写清适用边界；保留依赖用法、文件范围、步骤、CHECK、完成条件及停止路径。身份仅作绑定，不复制依赖图、状态或 API 覆盖数组，不新增前馈状态文件。
- 索引按 fileName 显示可读链接，执行顺序来自 `compiled.executionOrder`；必要时对 Markdown 链接中的空格编码。
- 改名时按 taskKey 定位同一任务，将详情移动到新路径、更新链接，不留下第二份文件。修改源事实或设计后重算并审查重验范围，身份不变不代表证据仍有效。
- 新会话从项目宪法与阅读路由进入，再读索引、本任务及直接依赖。相关架构、规范、howto、代码或 CHECK 环境变化需评估证据失效；FM/API 摘要不覆盖全部工程来源。保留已有 US/AC/TP/Rule/Scenario/API 标识，不制造不存在的上游编号。

### 6. 检查与停止

模式按用户授权和任务目标选择：`implementation` 普通实现与回归、`verify` 定位并复跑已有行为、`design` 设计、`setup` 环境准备、`manual` 人工任务。规划阶段不执行产品任务，不伪造结果。

检查列出目的/Q1–Q4、被测行为、真实依赖或 Fake、固定事实和业务时间、正常/边界/反例、失败不变性、测试文件、cwd、命令、准备依赖及证据要求。未知命令填 null 并关联缺口。

领域规则归 domain 测试；API 模块独立验证真实 HTTP 与 mock 领域边界；persistent 验证真实 SQL/XML/迁移/回滚；app 验证真实 HTTP + SQL、模块协作、运行配置与装配。增加业务模块公开接口、禁止依赖、数据所有权和本地事务回滚的检查；按实际需要验证身份隔离、幂等/并发、子资源注入、分页链接及可编辑 HAL-FORMS。远程故障检查只适用于已确认的远程依赖，不为缺少节点拓扑阻塞纯进程内工作。

最终按前馈协议核对来源、授权、前置新鲜度、局部设计、工程做法/环境、CHECK 与停止条件；未知必需项登记局部 gap，不将任务包装成可执行。核对 taskKey、文件、taskNotes 一一对应，所有任务引用均可解析；共享工作不重复，未决事实不隐藏。`coverageComplete` 仅表示已登记单元的结构覆盖，不表示业务批准、实现完成或测试通过；命名含义、详情语义和实际证据仍需审查。

输出计划后停止，不自动实现或审批。用户另行要求按计划实施、恢复进度或检查下一任务时，交给 `evidence-delivery`；它读取本 Skill 生成的 index/task files，不在扩展中建立私有状态。复用同一任务索引和详情，不重复维护计划。
