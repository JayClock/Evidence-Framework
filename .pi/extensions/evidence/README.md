# Evidence Pi Extension

项目级 Pi 扩展，实现[本地 Evidence 工作流](../../../docs/evidence.md)。

## v6：上下文识别驱动的交互建模

```text
Init → Modeling（上下文识别 ↔ 合同履约/领域对象/渠道协商 ↔ 四色追溯 ↔ 回放）
       → 统一语言 → FM → 软件范围/故事/验收 → 共同 Gate
     → Architecture → Planning → Coding → Review → complete
```

Agent 先从业务叙述识别有依据的候选上下文，再引导合同双方与履约项、领域身份与规则或渠道协商凭证。三条主线可组合，不增加关键词分类器，不要求人先选择模式或填写范围问卷。范围随发现整理，具体边界有歧义才提问。

没有前置 Requirements 阶段。需求收敛仍保存 personas/problem-statement/story-map，位于 Modeling 末尾，不让 FM 依赖未来故事。`01-requirements` 仅为存储目录。

当前状态 v6、发现快照 v3、FM Schema v3，配置/测试契约仍为 v1。发现快照不兼容 v1/v2，移除旧 position 导航及可选交互字段回退，不提供迁移；已有旧快照的运行须先备份，再由人工 `/reload`、`/evidence-reset`、`/evidence-init`。仅旧工作流版本还需删除配置中的 requirements 阶段键并核对 modeling。升级代码不改现有运行、工件或 Gate，不自动重置；不要手改版本号。

## 职责与边界

- 状态由扩展持有；按阶段和发现/定稿状态选择工具与模型。
- 不再提供底部固定面板或 Evidence 状态栏；状态通过对话消息展示，`/reload` 清除旧版残留显示，不改动运行数据。问题选择、回答编辑器及提问结果保留合同权责视图：合同上下文、双方角色、权利方 → 义务方、当前履约的请求依据／期限／确认依据／异常责任及当前问题。移除工程阶段、版本、Gate、焦点与答题统计；工程状态和详细来源仅按需 `/evidence-status` 查看。必填 `content.contractView` 用已有候选 C-ID 记录有来源的合同关系，问题 `target` 明确指向讨论项；未知为 null，不为领域／签约前讨论补造合同。不推测业务已履约，不提升候选批准状态。
- TUI 问答使用临时分区卡片：业务上下文、当前履约项、完整问题与操作独立展示，不再把整段状态塞进菜单／编辑器标题。F2 展开／收起权责树、异常责任和来源，Ctrl+↑↓ 滚动上下文；窄屏自动换行，空间不足时优先定位当前问题，操作／输入区保持可见。无合同时只展示业务范围，不堆叠合同空字段。复用 Pi 原生编辑器，保留中文 IME、换行和外部编辑器；RPC 保留普通 select/editor 对话。仅改变展示，不写工作流状态或证据。
- 每次仅允许提出一个核心问题，禁止批量问卷；回答／未知／排除／跳过后自动启动一次消化，先保存更新后的候选、案例与导航再决定下一问或执行草稿／定稿校验。提问质量、是否捆绑子问题及真正吸收语义仍需人工评测，不能由次数约束证明。历史问题用于回访，不是必做队列；人工停止后补答不自动启动。
- 逐问控制 activeQuestionId／needsConsolidation 在 v3 interaction 内必填，不读取旧批次或猜测缺失字段；新运行的问题、回答、缺口与追加历史不删除。自动启动前重检运行、版本、阶段与暂停状态，不跨运行启动。
- 问题通过 `evidence_ask_questions` 持久化后进入 waiting_answer；Agent 完全空闲（agent_settled）时自动打开当前问题的“回答／结束本轮问答，整理已有信息”菜单。选择回答直接进入编辑器，以“事实或决定”保存，仍自动记录 `gh` 当前认证的 github.com 账号；读取失败不保存。Esc 只关闭界面，不写回答或停止标记，也不重复弹出同一问题。`/evidence-answer` 可手动重开；带 Q-ID 保留未知、排除、跳过及历史更正操作。未知不能解除业务阻塞。
- 自动入口绑定当前运行及发现版本，打开及保存前重检阶段、暂停和空闲状态；自动与手动入口共享对话互斥，重载／Session 切换清除待弹出项并作废旧界面。重载不自动重开历史问题或清除人工停止标记，非交互模式只保留等待状态与命令提示。历史问题列表仍可通过带 Q-ID 的单题菜单“返回场景选择”访问，并保留结束本轮入口。`/evidence-discovery finish` 同样保存人工停止标记并启动整理；有阻塞项时保存草稿、列出 Q-ID 后停止，不强制定稿。`/evidence-discovery resume` 才恢复自动提问并重新排队暂缓问题；普通 run、暂停/恢复、重载均保留停止标记。
- 暂缓/结束不调用 GitHub、不生成业务回答、不排除范围、不解除定稿阻塞。控制记录位于快照的必填 `interaction` 字段及追加历史中，不可充当 `A-*` 来源；新运行初始化为未停止且无暂缓项，字段缺失直接拒绝加载。非阻塞未答项可保留为缺口，不升级为明确事实。
- `evidence_save_discovery` 保存范围、原始来源摘要、候选和三类回放；所有写入绑定 expectedRevision 并串行化，历史快照不覆盖。
- `evidence_check_model_draft` 复用 FM 管线进行隔离检查，不替换正式产物；`evidence_finalize_discovery` 检查声明就绪后启用正式提交，不自动批准。
- 纯领域/纯渠道仍采用 FM，不强制合同；四色是凭证与数据发现方法，不是新的实体 DSL。
- 统一语言、FM、软件需求共用 Gate。回答更正或重新发现使旧定稿失效；下游变更先人工回退。
- 来源明确、用户回答、模型专家审核、机器验证、实际单据模拟和 Gate 是不同结论。回答账号来自 GitHub API，但不证明操作者实名、业务角色或批准权限；不改变模型专家审核要求。
- 模拟器只实例化 Evidence；纯领域操作、状态机等 gap 留给架构及 Q1/Q2，未模拟为 null。
- 后续仍使用批准的 US/AC、TP、TASK/CHECK 契约及真实多循环 TDD、复用/验收验证。保留计划摘要、故事证据及质量命令保护。
- 机器不能证明业务发现完整、来源解释正确、候选与 YAML 的语义一致，或命令覆盖每个断言；人工 Gate 不可被自评替代。

## 模块

- `index.ts`：注册、命令、工具白名单、事件、Session 和 Gate UI。
- `discovery-schema.ts`：问题、人工回答、来源、候选、回放及快照结构。
- `discovery.ts`：发现版本、来源检查、追加快照、恢复和定稿就绪检查。
- `discovery-tools.ts`：问答操作菜单、编辑器、发现保存、隔离草稿检查和定稿入口。
- `discovery-answer-view.ts` / `discovery-answer-ui.ts`：只读分区投影、可展开／滚动的临时回答卡片和 RPC 回退；关闭或 Session 中止时释放界面监听。
- `discovery-interaction.ts`：人工暂缓、结束/恢复入口，串行化与版本保护，以及结束后的整理任务启动。
- `phases.ts` / `prompts.ts`：确定性的阶段/工件定义、输入加载及发现/定稿检查点约束。
- `discovery-contract-view.ts`：合同双方、履约权责、异常分支和当前问题的只读投影；不显示工程进度。未明确信息留空，引用／来源失效不展示旧关系，不写状态或创建 Gate。展示于对话和问答操作中，原始证据不变；不渲染常驻 TUI 面板。
- `discovery-prompt.ts`：只读组装发现焦点、未回答/仍未知问题与接续提示；完整注入 Skill 的 `references/discovery-workshop.md` 作为统一发现指南，不另维护业务问卷。指南缺失或为空时拒绝运行。
- `storage.ts`：配置、状态解码和原子持久化。
- `modeling.ts`：FM 路径保护、隔离 Python、Schema/CEL、lineage、适用模拟、业务模式派生、编译与正式原子替换。
- `validation.ts` / `checks.ts`：文档、模型和真实命令检查。
- `gates.ts`：来源、工件和报告摘要及人工决策。
- `test-plan.ts` / `testing-*.ts` / `tdd-tools.ts`：测试契约、多循环执行、恢复与故事证据。
- `workflow.ts` / `git.ts`：阶段/故事转换、决定失效、工作区基线及真实文件变更。

发现快照位于 `artifacts/02-modeling/discovery/<runId>/revision-N.json`，不是正式 FM；其中包含原始回答，需用脱敏材料。状态只保存快照指针。FM 自带 discovery 目录可保存引用这些依据的摘要，不另造正式事实。

Python 3.10+ 可通过 EVIDENCE_PYTHON 指定；依赖在 node_modules/.cache/evidence-fm-runtime。草稿只保存文件摘要和结果，不持久保存全部 YAML；当前未增加人工角色扮演包的 TUI 界面或旧版本迁移工具。

## 验证

```bash
npm run evidence:verify
```

自动测试不调用语言模型；覆盖指南注入、首轮/恢复提示、提问与回答依据展示、发现等待/更正、并发版本、来源失效、草稿隔离、共同 Gate、FM v3 和下游测试契约。Skill 的 `evals/discovery/` 另提供八类交互输入及人工多轮评测方法；提示词契约测试不是 Agent 行为评测。合成回归不是实际业务验收，也不是人工 TUI 端到端质量评测。
