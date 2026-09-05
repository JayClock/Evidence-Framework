# Evidence 工程工作流

本项目包含一个仅面向本地 Pi TUI 的工程流程。宏观阶段由扩展中的确定性状态机控制，Agent 只负责当前工件或当前用户故事。该流程不依赖 CI、GitHub Actions、自动 Push 或 CI Secret；可选 Git 检查点也只发生在本地。

## 1. 准备

安装依赖后，在仓库根目录启动 Pi：

```bash
npm install
pi
```

项目内 `.pi/extensions` 和 `.pi/skills` 需要项目信任。首次启动时选择信任；如果之前跳过，可执行：

```text
/trust
```

保存决定后重启 Pi。启动页应显示 `evidence` Extension 和七个 `evidence-*` Skills。履约建模适用时还需要 Python 3.10 或更高版本；可用 `EVIDENCE_PYTHON` 指定解释器。

## 2. 初始化

```text
/evidence-init
```

在编辑器中填写产品目标、使用者、期望结果、边界和已知约束。扩展会：

1. 写入 `artifacts/00-input/requirements.md`；
2. 创建 `.evidence/state.json`；
3. 将阶段设为 `requirements`；
4. 直接开始生成用户画像与需求工件，再依次生成问题陈述/MVP 和用户故事地图。

也可以直接传入简短需求：

```text
/evidence-init 为调查人员提供证据上传、校验、检索和审计能力
```

### 2.1 工件驱动与阶段审核

Agent 根据原始需求和对应方法论直接生成草稿，不再进行分批问答或单独确认业务基线。已知事实、分析假设和待决策项写入工件，由你在阶段 Gate 集中审核；需要修订时使用“要求修改”或 `/evidence-revise <反馈>`，而不是在聊天中回复“确认”。

缺少业务信息不意味着可以编造事实。金额、期限、权责、权限及异常后果等关键不确定性必须标明影响，交由人工补充或缩小范围；没有依据的规则不应进入编码。当前机器检查仍主要验证结构，不能证明业务完整性或自动识别所有业务阻塞项。

### 2.2 破坏性升级

工作流状态版本为 **2**，不兼容旧版状态，不提供迁移或自动确认。更新扩展后运行 `/reload`；若已有版本 1 的运行，先执行 `/evidence-reset`，再 `/evidence-init`。重置可选择保留工件或删除生成工件，请按实际需要选择。配置文件 `.pi/evidence.json` 仍使用版本 1，FM 仍使用 Schema v2。

独立访谈工具、回答命令及等待回答状态已删除，不再生成或依赖访谈快照。不要手工改写状态版本来绕过重新初始化。

## 3. 执行阶段

需要继续一个就绪的工件/故事时提交：

```text
/evidence-run
```

文档阶段的 Agent 只能读取项目，并通过 `evidence_submit_artifact` 提交当前目标文件。默认 `autoContinueArtifacts=true`，同一阶段内的多个工件会连续生成，阶段检查通过后按 Gate 配置决定是否等待人工审核；当前所有阶段默认 `review`。

默认阶段顺序：

```text
requirements → domain → architecture → planning
             → coding（每个 US-xxx）→ review → complete
```

阶段间通过 `artifacts/` 文件交接，而不是依赖长对话历史。

### 3.1 条件化履约建模

Domain 阶段在通用语言和限界上下文之后判断 Fulfillment Modeling（FM）是否适用。只有范围涉及合同、双方权责、支付、KPI/SLA、验收、异常补偿或审计凭证链时才建模；普通 CRUD 或纯技术工具应通过 `evidence_submit_fm_model` 明确提交“不适用”理由，不得虚构合同关系。

Agent 依据原始需求和上游工件直接提交适用性决策，不再设置独立问答前置条件。适用性、业务假设和模型内容交由 Domain Gate 审核；信息不足不能冒充“不适用”，也不能虚构合同规则。Requirements 或 Domain 修订、回退到这些阶段时，旧的 FM 适用性及机器校验结果会失效，需要重新提交和验证，已有模型文件保留供比对。

适用时，Agent 读取 `evidence-modeling` Skill，按 Role-first 顺序提交 FM Schema v2 YAML：

```text
artifacts/02-domain/fm-model/
├── model.yaml
├── entities/*.yaml
├── fulfillments/*.yaml
├── relationships/*.yaml
├── rules/*.yaml
└── validation/
    ├── instances/*.yaml
    └── scenarios/*.yaml
```

提交必须通过 `evidence_submit_fm_model`；路径受白名单、文件数量和大小限制，不能提交 `generated/`。扩展在临时目录中执行 Schema/语义校验、CEL 校验、属性追溯、场景模拟和确定性编译，全部成功后才原子替换模型目录，并生成：

- `generated/model.json`：确定性编译结果；
- `generated/traceability.json`：属性和规则追溯；
- `generated/simulation.json`：场景模拟结果（提交场景时）。

Python 依赖按 `requirements.txt` 哈希安装到 `node_modules/.cache/evidence-fm-runtime`，不污染系统 Python。扩展优先探测 Python 3.13 至 3.10，也可通过 `EVIDENCE_PYTHON` 指定路径。校验脚本使用 `-B` 禁止向 Skill 目录写入字节码；当前本机集成验证使用 Python 3.12。

三个结论保持独立：`machineValidated` 表示机器结构与语义校验，`simulationPassed` 表示场景模拟，模型内的 `stakeholderReview` 表示具名业务方确认。扩展通过 `validate_fm_model.py --model-only` 校验模型，再独立执行模拟；合法模型可以得到“结构通过、场景失败”，但整体检查仍失败。前两者通过不能替代业务确认。Domain Gate 和最终 Review 都会重新校验适用模型；未作适用性决策会失败，不适用会以带理由的 warning 记录。每次重新校验都会刷新模型文件清单；FM YAML、状态文件和 `generated/*.json` 都进入 Domain 与最终 Review 的 Gate 摘要，变化后必须重新审核。零退出码不足以证明校验成功：结果 JSON 无效、缺少明确通过标记、命令异常或后续步骤失败，都会阻止 Gate 放行。后续 DDD、架构、计划、编码与审查 Prompt 均可读取该模型目录，并通过 Fulfillment/Scenario、Trigger/Evidence 等字段维持追溯。

### 3.2 测试策略与测试工序

测试不是编码后的独立阶段，而是贯穿现有六个阶段的交接契约：

| 阶段         | 职责                                                                                           |
| :----------- | :--------------------------------------------------------------------------------------------- |
| Requirements | 给出稳定的验收场景 ID（如 US-001 下的 AC-001-01）、Given/When/Then、示例数据及有依据的质量约束 |
| Domain       | 提供领域不变条件、异常规则及适用的 FM Scenario，不在此选择测试替身                             |
| Architecture | 定义 Q1–Q4 策略、功能测试边界、真实依赖/替身与可复用 TP-\* 工序                                |
| Planning     | 按“故事 → 场景 → 适用工序 → 任务”实例化，关联 Q1/Q2 测试；提前安排 Q3/Q4 评价及 DoD            |
| Coding       | 按策略和适用工序编写真实代码/测试，在实现摘要中关联场景、任务、工序和验证结果                  |
| Review       | 独立核对实际边界、替身、场景覆盖、工序符合性及 Q3/Q4 证据，报告缺口而不静默修复                |

Architecture 在 data-model.md 之后依次新增：

- `artifacts/03-architecture/test-strategy.md`：风险、四象限、功能上下文、替身、追溯规则、环境、通过标准与风险接受。
- `artifacts/03-architecture/test-procedures.md`：工序目录、适用性、输入、准备/清理、操作、验证、退出条件与场景实例化规则。

两份文件通过现有 `evidence_submit_artifact` 提交，由现有结构校验检查必需章节，并纳入 Architecture Gate 的证据摘要。Planning、Coding 和 Review 的提示词显式要求读取它们；文件缺失时拒绝生成当前提示词，要求回退上游。复杂技术细节放在工序自己的小节，编码只读取当前适用部分，不新增 Slash Command 或 Skill。

Q1/Q2 按目的和受众区分，不等同于单元/集成测试；Q3/Q4 是产品评价，应提前规划，不要求全部自动化。功能上下文不等于 DDD 限界上下文，允许有依据地合并测试边界。Q2 与 Q1 要有关联，但不保证同时失败；真实装配和跨组件契约仍需集成验证。

**当前能力边界（第一批）**：本次只打通工件、Skills、提示词和结构校验，未改变宏观阶段、工具协议、TDD 状态机、状态版本、Gate 决策或质量命令。扩展仍仅记录每故事每修订轮的一组故事级 Red/Green/Refactor，不支持逐工序状态和多循环证据校验。场景/任务/工序 ID 的语义及跨工件关联仍由 Agent 与人工审查，文档表格或命令通过不能证明逐工序 TDD、完整验收覆盖、性能达标或 UAT 完成。

### 3.3 使用新版测试契约

- 更新后执行 `/reload`。没有活动运行时，使用 `/evidence-init` 开始，扩展会在架构阶段生成两份新工件，不需手工创建。
- 已有版本 2 的运行不需改状态版本。若已到架构或下游阶段但缺少测试契约，使用 `/evidence-back` 回到 Architecture；在该阶段使用 `/evidence-revise <补充测试契约的反馈>` 后执行 `/evidence-run`，重新生成并人工审核，再核对下游计划与验收证据。
- 如果旧故事地图缺少稳定场景 ID 或可执行验收数据，应先回退 Requirements 修订，经后续阶段 Gate 重新审核；不要让 Coding 自行编造 ID 或需求。
- 旧 Gate 不等于批准了新增工件。不要为了继续而直接写入 artifacts/reports、修改 `.evidence/state.json` 或伪造检查结果；原有修订轮次限制仍然生效。

## 4. 人工 Gate

阶段检查通过后运行：

```text
/evidence-review
```

可以选择：

- 批准并继续；
- 要求修改并填写反馈；
- 重新运行质量检查；
- 编辑文档工件；
- 稍后决定。

批准后，默认创建一个新的 Pi Session，并预填 `/evidence-run`。每个工程阶段一个 Session，每个编码故事一个 Session。Gate 决策同时记录在 `artifacts/gates/`，包含工件和质量报告的 SHA-256 摘要；任一证据在审核前被修改时都必须重新检查。

## 5. 编码与真实 TDD

Planning 阶段会从 `sprint-1-backlog.md` 提取去重后的 `US-xxx`。Coding Agent 每次只处理一个故事，并必须：

1. Red：先写真实测试，调用 `evidence_tdd_red` 并预先描述期望失败；扩展只接受单条直接调用 npm/Nx/Vitest/Jest/Gradle/Maven 的测试命令（禁止管道、重定向和命令连接），执行后只接受真实非零退出，并保存、返回实际输出供核对；
2. Green：写最小实现，调用 `evidence_tdd_green`；扩展重新执行与 Red **完全相同**的命令，只接受零退出；
3. Refactor：改善设计并保持行为不变；
4. 调用 `evidence_complete_story` 提交实现、Refactor 摘要和变更文件。扩展确认至少包含一个测试文件、一个生产源码文件；在 Git 仓库中还会以故事开始时的脏工作区哈希为基线，确认每个声明文件确实在本故事中变化，并拒绝遗漏的额外故事变更。

最后扩展再次执行聚焦测试，并独立执行 `.pi/evidence.json` 中的命令。默认是：

```bash
npm test
npm run lint
npm run build
```

任何最终质量命令失败都会产生 `reports/coding-*.md`，工作流保留在当前故事和 Refactor 检查点，等待下一轮修复。人工在 Coding Gate 要求修改时，新一轮会从 Red 重新开始；最终 Review 阶段还会确认 Sprint 1 每个 `US-xxx` 都有扩展生成的 Coding 记录并出现在审查报告中，然后重新执行相同的质量命令，而不是只相信审查文本。

## 6. 常用命令

| 命令                      | 功能                                     |
| :------------------------ | :--------------------------------------- |
| `/evidence-init`          | 初始化或重新初始化工作流                 |
| `/evidence-run`           | 执行就绪的工件或故事                     |
| `/evidence-status`        | 输出当前状态、进度、报告和 Gate          |
| `/evidence-check`         | 重新运行当前质量检查                     |
| `/evidence-review`        | 打开人工 Gate                            |
| `/evidence-next`          | 根据状态执行 `/evidence-run` 或打开 Gate |
| `/evidence-revise [反馈]` | 记录反馈并开始新一轮                     |
| `/evidence-back`          | 回退一个工程阶段，保留工件               |
| `/evidence-pause`         | 暂停阶段约束并恢复 Pi 默认工具           |
| `/evidence-resume`        | 恢复阶段模型和工具约束                   |
| `/evidence-reset`         | 仅删状态，或同时删除生成工件             |

如果 Agent 没有调用要求的 `evidence_*` 工具就结束，扩展会把状态恢复为 `ready`，可再次执行 `/evidence-run`。等待人工审核的 `waiting_review` 不受此恢复逻辑影响。

## 7. 模型配置

默认所有阶段继承当前 Pi 模型，只设置 thinking level。要按阶段使用不同模型，编辑 `.pi/evidence.json`：

```json
{
  "models": {
    "requirements": {
      "model": "google/<实际模型 ID>",
      "thinkingLevel": "high"
    },
    "coding": {
      "model": "openai/<实际模型 ID>",
      "thinkingLevel": "high"
    }
  }
}
```

先查询本机可用 ID：

```bash
pi --list-models
```

模型格式必须是 `provider/model-id`。配置为 `null` 表示继承当前选择。

## 8. Gate 与轮次配置

`.pi/evidence.json` 支持：

- `review`：必须运行 `/evidence-review`；
- `auto`：检查通过后自动推进状态；
- `review_if`：存在警告时要求审核，否则自动推进；
- `maxRounds`：质量失败或人工要求修改的最大轮次；
- `autoContinueArtifacts`：同阶段是否连续生成工件，不跳过阶段 Gate；
- `newSessionPerPhase`：批准后是否新建 Session；
- `gitCheckpointOnApproval`：批准后是否创建本地 Git commit；
- `qualityCommands`：编码完成后的确定性检查命令；
- `commandTimeoutMs`：单条质量命令超时。

本次调整不增加质量失败后的自动 PDCA 重试，也不增加结构化 Gate 决策清单；检查失败后仍按现有轮次规则等待 `/evidence-run` 或人工反馈。

启用 Git checkpoint 后，扩展只暂存状态、工件、报告和当前故事声明的变更文件，不执行 push。如果 Git index 已有人工暂存内容，扩展会跳过检查点，避免把无关内容混入提交；提交失败时会撤销本次暂存。

## 9. 文件职责

- `.evidence/state.json`：扩展拥有的权威状态，不应手工修改。
- `artifacts/00-input/requirements.md`：初始化时保存的原始需求，是各阶段的共同输入。
- `artifacts/`：阶段交付物与 Gate 审计记录；工程文档 Markdown 只能通过 `evidence_submit_artifact` 提交，FM 模型只能通过 `evidence_submit_fm_model` 提交，编码时均视为已批准只读输入。
- `reports/`：结构校验和真实命令输出。
- `.pi/skills/`：方法论及执行原则。
- `.pi/extensions/evidence/templates/`：扩展内部使用的工件结构模板，不注册为 Slash Command。
- `AGENTS.md`：所有本地 Pi Session 共享的项目约束。

需要进行与元工程无关的临时工作时，先运行 `/evidence-pause`，完成后再运行 `/evidence-resume`。

## 10. 扩展自身验证

```bash
npm run evidence:typecheck
npm run evidence:test
npm run evidence:format:check
npm run evidence:verify
```

这些命令不会调用语言模型。测试契约的回归测试覆盖工件顺序、模板加载、必需章节、下游输入缺失和 Architecture Gate 衔接；它们验证扩展的确定性接线，不是模型生成内容的质量评测。`evidence:test` 还会准备隔离的 FM Python 运行环境，执行真实 Schema v2 模型的校验、追溯、模拟、确定性编译，以及建模 Skill 的 Python 自测。首次运行可能需要下载 Python 依赖。
