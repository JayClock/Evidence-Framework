# Evidence Pi Extension

项目级 Pi 扩展，实现[本地 Evidence 工作流](../../../docs/evidence.md)。

## 单向使用 Skills

`.agents/skills/evidence-discovery/`、`.agents/skills/evidence-fm/`、`.agents/skills/evidence-requirements/` 是建模方法、FM 引擎／schemas 和需求方法的唯一维护源，统一本地维护。项目受信任后 Pi 原生发现 `.agents/skills/`，不再通过 `resources_discover` 额外注册。发现组合 Discovery 访谈机制和 FM 只读专业准则；统一语言与模型生成读取 FM 入口，软件需求读取 Requirements。Python 管线直接运行 `.agents/skills/evidence-fm/scripts/`，不保留旧建模 Skill 或同步脚本。

工具、日志、人工操作与提交路径差异只在 [执行适配](instructions/modeling-adapter.md) 和 [评估协议](instructions/incremental-assessment.md) 维护，不写回独立包。FM 回归与生成评测在 `.agents/skills/evidence-fm/` 内维护，各项业务行为评测随对应 Skill；跨 Skill 检查及 Pi 交互评测在 `tests/skills/`，升级不改运行状态、既有工件或 Gate。Architecture、Planning、TDD 与 Review 工序也统一由 `.agents/skills/` 提供。

## v6：上下文识别驱动的交互建模

```text
Init → Modeling（上下文识别 ↔ 合同履约/领域对象/渠道协商 ↔ 业务来源追溯 ↔ 回放）
       → 人工更新模型：统一语言 → FM → 停回发现（可重复）
       → 人工进入需求收敛：软件范围/故事/验收 → 共同 Gate
     → Architecture → Planning → Coding → Review → complete
```

Agent 先从业务叙述识别有依据的候选上下文。有约定依据时先展示“履约请求 → 确认凭证”候选：谁向谁提出什么要求、依据与期限、谁提供或形成什么凭证证明什么结果；保存新增理解后再问一个关键缺口。Confirmation 不默认是人工审批，独立验收须有业务依据；不从请求凭证责任角色推导确认人。领域身份与规则、渠道协商仍按各自主线发现，不为低信息输入补造合同。三条主线可组合，不增加关键词分类器，不要求人先选择模式或填写范围问卷。范围随发现整理，具体边界有歧义才提问。

没有前置 Requirements 阶段。需求收敛仍保存 personas/problem-statement/story-map，位于 Modeling 末尾，不让 FM 依赖未来故事。`01-requirements` 仅为存储目录。

当前状态 v6、发现日志 **v6**、FM Schema v3，配置/测试契约仍为 v1。评估和覆盖仅支持 Context／事实级 v1 协议，问题必须有稳定 gapKey。拒绝旧日志、缺 assessment、候选 complete/dependencyRefs、候选级 coverage 和旧 finalizing 自动收敛路径；不迁移、不转换、不自动重置。`/reload` 只加载代码，不能继续旧协议的运行；旧运行由人工决定归档或重新初始化，现有数据、工件和 Gate 不作修改，也不能手改版本号。

## 手动批次更新

问答只积累发现记录；在当前问题菜单选择「更新模型（纳入已积累的发现）」或运行 `/evidence-discovery update-model` 才授权更新。Agent 先消化新增输入，再通过 `evidence_finalize_discovery` 提交全历史 Context assessment：本批次职责、具体已知／未知 facts、requiredFactRefs、structure/provenance/decision 事实依赖、回放与 remainingScope；每道阻塞题定位 affectedFactRefs。Domain、Channel、Contract、Fulfillment 按自身语义判断，跨 Context 只依赖实际需要的事实，不能要求所有条款、签约渠道或责任链完整。输出 ready（本批次就绪）、support（只纳入已知支撑）、pending（未纳入）与事实级阻塞路径，不把 Context 视作不可拆分的完整包。没有可纳入职责也保存评估，保留全部缺口。完整协议见 [增量评估适配](instructions/incremental-assessment.md)。

依次更新统一语言与 FM；`discovery/formalization.md` 以唯一 discovery-coverage v1 JSON 绑定当前 revision、全部 Context 的 status/modelRefs/retainedFactRefs/remainingScope，以及全部纳入 factRef 的 modelRefs。发布前在暂存编译结果核对 ID、Context 类型和纳入／保留范围；不能将支撑投影宣称为整体完成。校验失败不替换上一版 FM。成功追加 model-applied（发现版本、依据和文件摘要、Context 状态及纳入事实），停回 discovering，不自动生成需求或 Gate。`/evidence-discovery converge` 检查已发布模型、发现与文件仍一致，再进入需求收敛。

`finish` 仅停止提问并整理，不授权更新；`resume` 恢复问答。新回答、追加发现只使当前就绪声明失效，不擦除上次已发布模型及机器证据。新事实需要再次手动更新，不能直接进入需求收敛。人工更新不是批准模型，也不是范围排除。无旧协议兼容分支；重载不迁移或修改旧数据。

## 职责与边界

- 状态由扩展持有；按阶段和发现/定稿状态选择工具与模型。
- 候选短名称 label 与完整说明 description 分开：新保存时 label 必填、1–40字符、单行且无首尾空白，不放职责、依据、缺口或候选标记。标题、角色箭头与问题菜单只显示短名称，不从长文本猜名称。名称更正同样追加记录并引用前次 D-ID；新旧记录都保留完整分析，不提供缺 label 的旧快照兼容。
- 不再提供底部固定面板或 Evidence 状态栏；状态通过对话消息展示，`/reload` 清除旧版残留显示，不改动运行数据。TUI 以问答卡片展示请求—确认凭证视图：业务主线／上下文／当前对象、上下文角色、参与人、标的物、相关凭证、当前履约的结构化请求／确认凭证及其责任角色、事实覆盖和当前问题。TUI 提问工具结果只提示问题已保存及重开／查看命令，不再重复问题正文与履约结构；完整履约树、其他履约与异常责任仅通过 `/evidence-status` 按需查看。RPC 及无界面的文本模式保留原有问题与上下文输出，不依赖 TUI 卡片。移除工程阶段、版本、Gate、焦点与答题统计；工程状态和详细来源仅按需 `/evidence-status` 查看。只读 `content.businessView` 由 context、fulfillment、position 记录派生，用已有候选 C-ID 表达有来源的 channel／contract／domain 上下文、履约、凭证、参与者和标的物，问题 `target` 明确指向讨论项；未知为 null，不为领域／签约前讨论补造合同。不推测业务已履约，不提升候选批准状态。
- TUI 问答使用临时分区卡片：业务位置、当前履约切片、事实覆盖、完整问题与操作独立展示，不再把整段状态塞进菜单／编辑器标题。F2 仅展开／收起当前候选详细说明、来源及前序触发依据，并提示 `/evidence-status` 查看完整结构，不再复述整棵履约树；Ctrl+↑↓ 滚动上下文；窄屏自动换行，空间不足时优先定位当前问题，操作／输入区保持可见。无合同时只展示业务范围，不堆叠合同空字段。复用 Pi 原生编辑器，保留中文 IME、换行和外部编辑器；RPC 保留普通 select/editor 对话。仅改变展示，不写工作流状态或证据。
- 所有主线共用事实覆盖检查：先复用已有事实，再保存确定性推导，仅问影响业务结果的真实知识缺口／冲突。技术映射交 Architecture，FM 表达缺口由 Agent 整理，不把清单变为问卷；确认凭证、金额、身份、渠道、异常终点和合成回放均适用。
- 已识别凭证直接展开类型时间：RFP／Proposal／Request 的 started_at／expired_at、Contract 的 signed_at、Confirmation 的 confirmed_at、Other Evidence 的 created_at 都不要求先有实例日期、生成公式或字段记录人。时刻凭证不套请求区间，各 kind 的必备时间不互换；不默认签约等于生效、确认等于回调、凭证形成等于原事件发生。类型含义记在候选说明／notes，deadline 保留已知语义并标明未明的确定依据。实例仍须确定时间值，不放松 Schema／实例校验，也不自动给任何人设定期限的权限。
- 所有关键数据都按发现指南的同一过程追溯业务来源，不等待疑似派生。直接记录、引用已有值、规则派生、来源待明确只是发现说明中的区分，不新增 Schema。先复用，再记录依据与缺口，必要时逐问；不能用非派生标签、类型展开或机器 lineage 通过关闭真实来源问题。resolution 仍须已有业务事实充分覆盖原题，不能只引用“规定时间”就解除期限问题。升级不自动改历史题、撤回旧关联或恢复停止／暂缓。
- 新问题用对象与事实维度组成稳定 gapKey；同一缺口沿用原 Q-ID，不因措辞、焦点或暂缓换标识。程序拦截同 gapKey 和部分文本重复，不保证任意改写的语义去重；实际提问质量仍须人工评测。
- 每次仅允许提出一个核心问题，禁止批量问卷；回答／未知／排除／跳过后自动启动一次消化，先保存更新后的候选、案例与导航再决定下一问或执行草稿／定稿校验。提问质量、是否捆绑子问题及真正吸收语义仍需人工评测，不能由次数约束证明。历史问题用于回访，不是必做队列；人工停止后补答不自动启动。
- 逐问控制 activeQuestionId／needsConsolidation 由问题、人工回答和控制事件重放到 interaction，不读取旧快照或猜测缺失字段；新运行的问题、回答、缺口与追加历史不删除。自动启动前重检运行、版本、阶段与暂停状态，不跨运行启动。
- 问题通过 `evidence_ask_questions` 持久化后进入 waiting_answer；Agent 完全空闲（agent_settled）时自动打开当前问题的“回答／更新模型／结束本轮问答，整理已有信息”菜单。选择回答直接进入编辑器，以“事实或决定”保存，仍自动记录 `gh` 当前认证的 github.com 账号；读取失败不保存。Esc 只关闭界面，不写回答或停止标记，也不重复弹出同一问题。`/evidence-answer` 可手动重开；带 Q-ID 保留未知、排除、跳过及历史更正操作。未知不能解除业务阻塞。
- 自动入口绑定当前运行及发现版本，打开及保存前重检阶段、暂停和空闲状态；自动与手动入口共享对话互斥，重载／Session 切换清除待弹出项并作废旧界面。重载不自动重开历史问题或清除人工停止标记，非交互模式只保留等待状态与命令提示。历史问题列表仍可通过带 Q-ID 的单题菜单“返回场景选择”访问，并保留结束本轮入口。`/evidence-discovery finish` 同样保存人工停止标记并启动整理；无论是否还有阻塞项，都只积累发现并停止，不自动定稿。`/evidence-discovery resume` 才恢复自动提问并重新排队暂缓问题；普通 run、暂停/恢复、重载均保留停止标记。
- 暂缓/结束不调用 GitHub、不生成业务回答、不排除范围、不解除定稿阻塞。控制决定作为独立事件追加并派生 `interaction`，不可充当 `A-*` 来源；新运行初始化为未停止且无暂缓项。非阻塞未答项可保留为缺口，不升级为明确事实。
- 请求／确认使用结构化凭证引用及简短业务说明，分析论证写 description／notes；不因局部未知抹去已明确事实。卡片的请求、期限、确认字段超过100字符时显式截短并提示查看原文，问题正文不截短；/evidence-status 保留当前合同各候选完整描述及请求／确认原文。
- `evidence_save_discovery` 只追加本轮记录（summary、sourceRefs、records），不接受完整 content。scope／position／note／source／candidate／case／context／fulfillment／resolution 逐项记录；新增 supersedes=null，更正引用当前 D-ID，withdraw 记录显式撤回。遗漏不是删除，撤回须处理悬空关系。扩展分配 D-ID，绑定 SRC 版本，校验来源、引用和 expectedRevision；临时文件写完后原子发布，拒绝覆盖历史及中断遗留条目。
- resolution 以 questionId 关联历史未答／未知问题，包含 conclusion、reasoning、sourceRefs、citations（sourceRef、逐字 quote）；每个来源须有摘录且为 `INPUT`、有效 `SRC-*` 或最新 answered `A-*`。仅连接已有事实／确定性推导，不生成 A-\*、替代人工事实、作范围排除或掩盖矛盾。有效关联解除该题待答／阻塞；历史菜单、TUI／RPC、/evidence-status 与上下文明细显示解释、来源及失效状态，不预填为人工回答。来源文件／版本、引用回答或该题后续人工回答变化使关联失效；更正／撤回以 resolution:Q-ID 当前 D-ID 追加，不改原问题，不自动恢复问答。摘录检查不证明结论蕴含成立；真实冲突仍交人工。
- 不增加独立查询工具。启动／续轮／恢复使用最多 14,000 字符的上下文包：待消化人工输入、当前讨论对象、相关缺口及明细行号。完整方法放在每次请求的固定系统上下文，不逐轮复制进任务历史。已消化回答不重复内嵌；超出预算的新输入明确提示补读，不能静默视为已消化。current.json 保留完整视图，context-details.md 提供逐对象明细和分页索引；两者都可丢弃重建，不纳入 Gate 或充当业务来源。
- `context` 钩子仅在发给模型时收束本运行已标记的旧发现轮次，保留最新轮次及其工具调用／结果；原始 Pi 会话和发现日志不删除。真实用户消息、其他扩展、其他运行及压缩摘要不裁剪，不拆开工具调用对；后续阶段不复活旧发现轮次。固定系统方法仍占输入 token；本轮大量工具输出、未标记历史及其他对话仍可能触发 Pi 压缩，不能承诺整个模型上下文永不溢出。内部仍完整读取、校验及重放日志，未做增量重放。
- `evidence_check_model_draft` 复用 FM 管线进行隔离检查，不替换正式产物；`evidence_finalize_discovery` 只在人工授权更新后评估本批次并启用语言／FM，不自动批准。assessment 始终必填，包括无候选的简单胶水；不适用须有来源理由且无未解决阻塞题。
- 纯领域/纯渠道仍采用 FM，不强制合同；来源追溯沿现有对象、凭证与规则展开，不增加实体 DSL。
- 统一语言、FM、软件需求共用 Gate。回答更正或重新发现使旧定稿失效；下游变更先人工回退。
- 来源明确、用户回答、模型专家审核、机器验证、实际单据模拟和 Gate 是不同结论。回答账号来自 GitHub API，但不证明操作者实名、业务角色或批准权限；不改变模型专家审核要求。
- 模拟器只实例化 Evidence；纯领域操作、状态机等 gap 留给架构及 Q1/Q2，未模拟为 null。
- 后续仍使用批准的 US/AC、TP、TASK/CHECK 契约及真实多循环 TDD、复用/验收验证。保留计划摘要、故事证据及质量命令保护。
- 机器不能证明业务发现完整、来源解释正确、候选与 YAML 的语义一致，或命令覆盖每个断言；人工 Gate 不可被自评替代。

## 执行归属与中断恢复

- 新启动任务在 v6 状态的 `execution` 字段记录执行 ID、Pi session ID、PID 和主机名；任务离开 `running` 时清除归属。字段缺失的旧 v6 状态按归属未知读取，不修改发现日志或 Gate。
- `session_start` 不再无条件重置 `running`。仅在当前会话空闲、工作流未暂停，且任务属于当前会话／进程，或原本地主机进程已确定不存在时恢复；`agent_settled` 只收尾当前会话／进程自己的空闲任务。恢复历史记录触发原因、会话及原执行归属。
- 其他仍存活的会话／进程、其他主机及权限不足等无法确认的进程不会被自动接管。PID 复用按仍存活保守处理；这不是跨主机租约或完整多写者事务协议，同一项目仍应只由一个会话主动执行工作流命令。
- 归属未知的旧 `running` 任务不会因重载而自动恢复。确认其他执行者均已停止后，交互执行 `/evidence-run` 并确认恢复；取消或无交互界面时不变更状态。已经是 `ready` 的旧任务可直接运行。暂停状态不因生命周期回调改变。

## 模块

R1 拆分 Pi 接入；R2 提取完整 Modeling 能力并隔离所需存储与环境操作。保留模块边界、注册方式与产物路径，本次采用无兼容的 Context 批次协议；尚未引入 ExecutionPlan、Plan 级 Session 或新的审批点。所有模块仍由一个扩展实例装配。

### Pi 接入

- `index.ts`：Pi 自动发现入口，仅导出 `adapters/pi/register.ts` 的装配函数。
- `adapters/pi/commands.ts` / `lifecycle.ts`：人工命令和生命周期事件注册；不在加载时启动任务。
- `adapters/pi/profile.ts` / `protection.ts`：模型／工具配置和受保护路径规则。
- `adapters/pi/runtime.ts` / `execution-owner.ts`：当前任务启动、归属与保守中断恢复。
- `adapters/pi/checks.ts`：现有检查与阶段收尾适配，保留审核和失败轮次语义。
- `adapters/pi/ui/gates.ts` / `ui/status.ts`：人工审核、可选 Git 检查点和状态展示。
- `adapters/pi/tools/documents.ts` / `fm.ts` / `story.ts`：原有文档、FM 和故事提交入口。
- `adapters/pi/tools/discovery.ts`：问答操作菜单、编辑器、发现保存、隔离草稿检查和定稿入口。
- `adapters/pi/ui/discovery-answer-view.ts` / `ui/discovery-answer.ts`：只读分区投影、可展开／滚动的临时回答卡片和 RPC 回退；关闭或 Session 中止时释放界面监听。
- `adapters/pi/discovery-interaction.ts`：人工暂缓、结束/恢复入口，串行化与版本保护，以及结束后的整理任务启动。
- `adapters/pi/session-context.ts`：标记扩展任务、构造请求级消息投影；保持原始会话、真实用户消息及完整工具调用对。

### Modeling 核心

- `modeling/index.ts`：无 Pi 的工厂和结果契约入口；不导出生产存储绑定。
- `modeling/discovery/service.ts`：讨论控制、问题与人工回答、追加发现、消化检查、来源新鲜度、回放覆盖与定稿就绪规则。通过 `DiscoveryRepository` 注入读取及持久化能力，不直接访问文件、Pi、Gate 或阶段调度器。
- `modeling/discovery/schema.ts` / `replay.ts`：v6 记录结构、确定性重放、更正／撤回链、来源版本绑定及当前视图投影。缓存不是业务来源。
- `modeling/discovery/formalization.ts`：全历史 Context 评估、具体事实依赖闭包和真实阻塞路径计算；依据摘要区分问答积累与已发布模型，不自动解释业务公式。
- `modeling/fm/coverage.ts`：发布前校验本批次 discovery-coverage 及编译后的模型 ID；不声称机器验证了候选与模型的语义一致性。
- `modeling/discovery/questions.ts` / `rules.ts` / `progress.ts`：稳定缺口身份、待答／解决／阻塞判定、来源引用、业务上下文／凭证／参与者／标的物与履约结构及发现失效规则。
- `modeling/discovery/resolutions.ts`：注入原文读取能力，核对逐字摘录与新鲜度；不把摘录验证当作语义蕴含，不创造人工回答。
- `modeling/discovery/view.ts`：业务位置、上下文角色、参与者／代表／标的物、履约请求 → 确认凭证、事实覆盖、异常分支和当前问题的只读投影。保留未知及失效提示，不推断审批人，不写状态。
- `modeling/draft.ts`：隔离草稿校验和结果记录，不替换正式 FM 或创建 Gate。
- `modeling/fm/files.ts` / `pipeline.ts`：源文件规则及 Schema/CEL → lineage → 适用模拟 → 业务模式投影 → 编译。运行时、命令执行和文件操作通过接口注入。
- `modeling/fm/submission.ts` / `status.ts`：适用性约束、模型发布结果和状态页；返回机器证据，不推进后续工件或提升业务评审状态。

`readFinalizedDiscovery` 返回当前 runId、revision、日志摘要及含 sourceHashes 的发现投影，并重新核对定稿就绪及材料新鲜度。这是已校验 Context 批次及发布记录的只读交接，不等于业务批准。未来 Planning 仍须绑定正式工件摘要及人工 Gate，不能只凭该返回值推进。

### 状态、环境与指令

- `state/discovery/repository.ts` / `sources.ts`：日志摘要链、仅追加写入、派生缓存和源文件边界；`index.ts` 提供唯一生产服务绑定，`view.ts` 负责加载展示所需投影。
- `state/fm/repository.ts`：暂存、原子替换、回滚、草稿清理及状态页持久化；`index.ts` 装配真实 FM 服务。`state/modeling.ts` 装配跨发现与 FM 的草稿服务。
- `environment/python.ts` / `commands.ts` / `fm-files.ts`：隔离 Python 环境、超时／取消和实际文件操作。保留现有 Skill 脚本、Python 缓存与执行参数。
- `contracts/paths.ts`：共享路径常量，无 I/O；`storage.ts` 仍负责现有配置、状态解码和原子持久化，生产仓储复用其文件变更队列。
- `instructions/discovery-prompt.ts` / `discovery-context.ts`：固定方法与有界轮次任务、未消化输入、摘要及 context-details.md 精确读取范围。方法仍单一来源于 Skill／发现指南；此处不新增问卷或重写指令体系。
- `phases.ts` / `prompts.ts`：确定性的阶段／工件定义、输入加载及发现／定稿检查点约束。

调用方仍须用同一 `withModelingLock` 覆盖版本核对、加载、检查和追加；它是当前进程的工作区串行锁，不承诺跨进程互斥。建模定稿、FM 提交与人工批准保持不同事实。

### 其他现有能力

- `validation.ts` / `checks.ts`：文档、模型和真实命令检查。
- `gates.ts`：来源、工件和报告摘要及人工决策。
- `test-plan.ts` / `testing-*.ts` / `adapters/pi/tools/tdd.ts`：测试契约、多循环执行、恢复与故事证据。
- `workflow.ts` / `git.ts`：阶段/故事转换、决定失效、工作区基线及真实文件变更。

发现日志位于 `artifacts/02-modeling/discovery/<runId>/revision-N.json`，每个文件只含本次事件、时间、版本和前序摘要，不重复全部候选或历史问答。人工回答更正显式引用前次 A-ID，Agent 解释通过 D-版本号-序号引用前次记录；两者不等于业务批准。状态只保存链尾指针。当前视图缓存为 `.evidence/cache/discovery/<runId>/current.json`，可丢弃重建，读时核对 revision；缓存损坏不能绕过日志校验。日志和缓存都可能含用户原文，只用获授权的脱敏材料。FM 自带 discovery 目录可保存引用这些依据的摘要，不另造正式事实。

Python 3.10+ 可通过 EVIDENCE_PYTHON 指定；依赖在 node_modules/.cache/evidence-fm-runtime。草稿只保存文件摘要和结果，不持久保存全部 YAML；当前未增加人工角色扮演包的 TUI 界面或旧版本迁移工具。

## 验证

```bash
npm run evidence:verify
```

测试文件与对应实现同目录；跨模块回归也放在主要被测入口旁，例如 `adapters/pi/tools/fm.spec.ts`。`tests/support/` 仅保存共享夹具和替身，不集中存放测试。TypeScript、Vitest 和格式检查均递归覆盖子目录。

`index.spec.ts` 检查 Modeling 的传递依赖边界；发现服务、草稿、FM 管线与发布服务有内存替身测试，不加载 Pi 或访问工作区。另保留真实 Python Schema v3、lineage、模拟与编译回归，以及真实临时目录中的日志、防篡改、来源失效和发布回滚测试。

自动测试不调用语言模型；覆盖固定系统指南、首轮/恢复提示、1000轮历史投影、长输入遗漏提示与无损分页、提问与回答依据展示、发现等待/更正、并发版本、来源失效、草稿隔离、共同 Gate、FM v3 和下游测试契约。Skill 的 `evals/discovery/` 另提供多类交互输入及人工多轮评测方法，含无默认验收的交稿和外部回执确认；提示词契约测试不是 Agent 行为评测。合成回归不是实际业务验收，也不是人工 TUI 端到端质量评测。
