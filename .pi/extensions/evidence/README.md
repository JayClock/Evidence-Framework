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

本次引导重构保持状态 v6、发现快照 v1 和 FM Schema v3，不改现有运行、工件或 Gate；已有 v6 只需 `/reload` 后按状态继续，无需 reset。v6 相对旧状态仍是破坏性升级，不提供迁移或复用旧 Gate：仅旧版本升级需删除配置中的 requirements 阶段键并核对 modeling，备份后 `/reload`、`/evidence-reset`、`/evidence-init`。配置/测试契约仍为 v1。不要手改状态版本号。

## 职责与边界

- 状态由扩展持有；按阶段和发现/定稿状态选择工具与模型。
- 问题通过 `evidence_ask_questions` 持久化后进入 waiting_answer；人类用 `/evidence-answer [Q-ID]` 回答或更正，自动记录 `gh` 当前认证的 github.com 账号，不再输入姓名；读取失败不保存。取消不记录，未知可继续发现但不能解除业务阻塞。
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
- `discovery-tools.ts`：问答编辑器、发现保存、隔离草稿检查和定稿入口。
- `phases.ts` / `prompts.ts`：确定性的阶段/工件定义、输入加载及发现/定稿检查点约束。
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
