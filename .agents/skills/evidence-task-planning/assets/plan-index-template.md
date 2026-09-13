# {{项目名}} smart-domain 任务总索引

> 固定模块化单体与 MyBatis。索引维护来源、切片、计算投影、状态和缺口；实施步骤、测试命令与证据在独立任务文件中维护。

## 1. 输入与范围

- 项目根：{{实际定位方式}}
- FM 根及审核状态：{{路径、modelStatus、stakeholderReview，不提升状态}}
- API：{{源文件或明确未提供}}
- 软件范围与验收：{{实际需求路径、已有故事/验收 ID、确认状态与非目标；不从完整 FM 推导已批准 MVP}}
- 项目前馈入口：{{项目指令指向的 Guides 导航或等价来源；只维护引用，不复制知识库}}
- 工程基线：{{相关架构、质量属性、术语、规范、howto 与真实范例的路径/章节/版本；缺项及影响}}
- 业务目标：{{真实源场景、软件范围与可验收结果}}
- 约束依据：{{模块化单体、统一后端应用、进程内模块契约、MyBatis 与完整 smart-domain 集成}}
- 技术实况：{{构建、版本、已有实现与测试，不从模板猜测}}
- 业务模块映射：{{FM Context 到业务模块的来源与设计依据，不要求一一对应}}
- 技术库映射：{{业务模块在组合根/domain/api/persistent 中的实际代码、构建依赖、XML 与子资源落点}}
- 工序：{{用户与任务计划约定的执行模式及检查}}
- 未决事实/设计：{{数据库、模块公开契约、数据所有权、本地事务、认证等局部缺口}}
- 外部集成：{{仅列已确认的外部系统/独立部署需求；没有则不要求远程协议或拓扑}}

## 2. 业务模块与行为映射

模块决定登记在 designItems 的来源和 reason 中；下表是同一设计的可读展示，不由 Context 数量自动生成模块。

| 业务模块及源 Context | 公开契约与允许依赖        | 内部实现、表/迁移拥有者    | 本地事务边界                       | 来源/设计条目      |
| -------------------- | ------------------------- | -------------------------- | ---------------------------------- | ------------------ |
| {{模块与映射理由}}   | {{公开包/接口、调用方向}} | {{内部包及数据唯一拥有者}} | {{入口、参与者、事务管理器和回滚}} | {{源 ID/design.*}} |

按实际来源补充对象与行为：

| 源 ID     | 拥有者           | 根集合或关联契约               | 行为/角色/证明         | 依据与缺口     |
| --------- | ---------------- | ------------------------------ | ---------------------- | -------------- |
| {{源 ID}} | {{源或显式设计}} | {{基数、引用/导航、窄/宽接口}} | {{真实行为及执行位置}} | {{来源与缺口}} |

只列实际模型对象，不复制参考产品。共享契约不扩大为独立 CRUD 产品；技术库不等于业务模块，共享数据库不允许直接访问他模块内部表。

## 3. 计划输入与计算投影

索引只含一个 YAML 块；编译器读取 slicing，不读取 compiled 作为事实。

```yaml
schemaVersion: '2.0'
kind: task-index
inputRoots:
  fm: .evidence/fm
  api: null
sourceManifest: [] # 业务与工程来源的路径、实际源 ID（如有）、摘要/版本和适用章节；工程文件路径不虚构成 FM ID
slicing:
  designItems: [] # id、sourceRefs、reason
  groups: [] # concern、ownerRef、operationRef、fileName、unitKeys、dependsOn(taskKey)
  dispositions: [] # unitKey、kind、sourceRefs、reason

# 原样嵌入 compile 结果，不手填计算字段。
# 包含 policyVersion/profile/inputDigest/modelId/modelStatus/stakeholderReview、
# tasks、executionOrder、apiCoverage、dispositions、unassignedUnitKeys、diagnostics、coverageComplete。
compiled: null

taskNotes: [] # 每个 taskKey 恰好一条，状态只在这里维护
# - taskRef: <taskKey>
#   mode: implementation # design | setup | implementation | verify | manual
#   status: planned      # planned | blocked | in-progress | done
#   sourceRefs: [<源 ID 或设计条目>]
#   sliceRefs: [<已有场景/切片 ID>]
#   outcome: <实际交付结果说明>
#   gapRefs: [<缺口标识>]

gaps: []
# - id: GAP-<稳定缺口标识>
#   sourceRefs: [<源 ID>]
#   statement: <具体缺少的事实或设计>
#   affectedTaskRefs: [<taskKey>]
#   impact: <只影响哪些工作>
#   nextAction: <需要什么依据>
```

每组显式填写可读 fileName；taskKey、完整 path 与 API 覆盖由编译器计算。sourceManifest 定位原始来源，设计决定在 designItems，不能引用 Agent 判断代替业务事实。

## 4. 可读任务导航

| 任务文件                    | taskKey      | 执行模式/状态      | 前置任务                          |
| --------------------------- | ------------ | ------------------ | --------------------------------- |
| {{fileName 对应的相对链接}} | {{稳定 key}} | {{来自 taskNotes}} | {{将依赖 key 映射为可读文件链接}} |

显示名称来自 fileName 去掉后缀；依赖与 API 覆盖都是 compiled 的展示，不再维护第二份数组。

- 首个可验收结果：{{源场景与所需任务链}}
- 最小共享基础：{{所需 taskKey 与文件链接}}
- 执行顺序：{{按 executionOrder 展示；编号仅用于本次阅读}}
- 可并行工作：{{依据已满足依赖与文件边界}}
- 局部阻塞：{{缺口与受影响任务}}

## 5. 前馈与交接检查

- 项目宪法、基线、工程指南与每个任务的 Guides 可定位；软件范围/授权与源审核状态分别核对，不冒充批准。
- 规范、howto、范例与 CHECK 的真实环境对应；指南/架构/代码变化需要重验，不仅比较 FM/API 摘要。
- 必要来源或命令缺失关联局部 gap；任务不设第二份前馈状态，结构检查不能替代语义就绪。
- 输入摘要对应当前 FM/API；计算字段未手改。
- 每个 taskKey 恰好对应一个可读文件和一条 taskNotes，所有任务引用均可解析。
- fileName 唯一、安全、准确描述交付结果，位于 tasks/；任务文件 taskKey/planRef 与索引一致。
- 改名按 taskKey 移动详情并刷新链接，无重复或孤立文件；顺序调整不改身份。
- CHECK 全计划唯一，定义在所属任务；业务规则、角色变体和场景有验收去向。
- 任务详情不复制状态/依赖图/API 数组；索引不复制步骤、命令或证据。
- 共享单元仅实现一次，缺口没有通过无依据的排除隐藏。
- 统一应用与业务模块平台工作有去向，不机械按 Context 划分构建模块或服务；公开接口、禁止依赖及表归属有检查。
- API 独立测试与 app 的真实模块协作/HTTP + SQL/本地回滚测试分别规划。
- 数据库、事务与安全的具体选择有依据；只为确有远程依赖的任务记录协议或故障缺口，不阻塞无关进程内工作。
- coverageComplete 不证明业务模块封装、运行通过或批准。

## 6. 本次实际检查与下一步

{{实际 inventory/compile 命令、退出码、已检查范围和未执行项；没有执行证据不标 done/passed。}}

生成或更新计划后停止，不自动实施任务，不修改 FM、API、业务代码、依赖或业务审核记录。
