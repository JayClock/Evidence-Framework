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

保存决定后重启 Pi。启动页应显示 `evidence` Extension 和七个 `evidence-*` Skills。统一 FM 建模适用时还需要 Python 3.10 或更高版本；可用 `EVIDENCE_PYTHON` 指定解释器。

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

工作流状态版本为 **4**。统一 FM v3 工件已移到 DDD 限界上下文之前，适用性也从合同履约扩展为领域/渠道/履约语义，因此旧索引、旧“不适用”结论及 Gate 不能复用。不兼容状态版本 1/2/3，不自动迁移或伪造旧证据。更新后运行 `/reload`；旧运行先备份，再 `/evidence-reset`、`/evidence-init`。加载旧状态只报错，不重写文件；重置可保留工件供参考，但不是新运行的通过证据。不要手改版本号。配置版本仍为 1，测试契约 JSON 版本仍为 1；FM 模型格式升级为 Schema v3。

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

### 3.1 统一 FM 建模与 DDD 设计投影

Domain 阶段保持一个 Gate，按以下顺序生成工件：

```text
统一语言 → 统一 FM v3 模型 → DDD 限界上下文映射
         → 实体/值对象 → 聚合与一致性边界 → 领域事件
```

`evidence-domain` 编排阶段及设计投影，`evidence-modeling` 负责同一 FM 格式中的领域、签约前渠道、合同履约或混合范围。纯领域和纯渠道允许没有 Contract/Fulfillment，不再按“没有合同”或“普通 CRUD”跳过建模。只有简单胶水且无独立业务/领域语义时，才通过 `evidence_submit_fm_model` 提交不适用理由和空文件集。

FM YAML 是可表达业务/领域语义的事实源；DDD 文档引用 Context/Entity/Rule ID，解释设计取舍、规则执行位置与表达 gap，不重复改写规则。FM Context 不等于 DDD Bounded Context、聚合或微服务；子 Fulfillment Context 不自动对应独立软件模块。Domain 工件不规定术语、上下文、实体、聚合或事件数量，极小范围可说明某项设计不适用及替代方案。

Agent 从原始需求、批准需求和统一语言直接判断范围，不设置独立问答前置步骤。discovery 方法用于整理事实、候选、假设、来源及问题，通过 Domain Gate 或修订反馈处理。信息不足不是不适用：不能形成有效范围时明确阻塞，请人工补充或缩小范围，不编造身份、公式、时限或权责。

适用时只提交 Schema v3 源文件：

```text
artifacts/02-domain/fm-model/
├── model.yaml                       # 必需
├── README.md                        # 范围、来源、待决策项、gap
├── 00-overview.md / 01-glossary.md   # 说明，词义引用统一语言
├── entities/*.yaml                  # 必需，至少一个实体及有效入口 Context
├── fulfillments/*.yaml              # 有履约时需要，可省略
├── relationships/*.yaml             # 可省略
├── rules/*.yaml                     # 可省略
├── business-patterns/*.yaml         # 可选权责复用模式源文件
├── discovery/*.md 或 *.yaml         # 单层，候选/问题而非正式事实
└── validation/
    ├── instances/*.yaml             # 可选 Evidence 单据数据
    └── scenarios/*.yaml             # 可选确定性单据场景
```

每个 YAML 一个文档，文件名小写 ASCII kebab-case，稳定 ID 引用。无履约编译为 `fulfillments: []`；已有 Request、Fulfillment、Role、Context 仍严格检查，空集合不能掩盖孤立请求。

v3 履约位于父 Contract 的子 Fulfillment Context；Request interval 起止引用 required、keyData timestamp，无固定期限须有已确认依据。合同双方 Party Role 留在父上下文，Place/Thing 属于 Domain Context，Party 在 Context 外；不能只改 v2 版本号完成迁移。具体步骤见 Skill 的 `references/migration-v3.md`。

提交必须通过 `evidence_submit_fm_model`，白名单、文件数量和大小限制保持不变。Agent 不能提交 `generated/`、`02-business-patterns.md` 或 `status.md`。扩展在临时目录中校验 Schema/语义、CEL、lineage、适用单据模拟、业务模式文档与编译，全部成功才原子替换，并生成：

- `generated/model.json`：确定性编译结果；
- `generated/traceability.json`：属性/规则追溯；
- `generated/simulation.json`：实际单据模拟结果，仅有验证输入时执行；孤立 instances 等无效套件不能跳过；
- `02-business-patterns.md`：由 business-patterns YAML 派生，不手工维护；
- `status.md`：扩展状态说明，人工状态指向 model.yaml，不复制或提升。

Python 依赖按 requirements.txt 哈希装入 `node_modules/.cache/evidence-fm-runtime`，不污染系统 Python；可用 `EVIDENCE_PYTHON` 指定 Python 3.10+。脚本使用 `-B`，当前集成测试使用 Python 3.12。上游固定版本和本地适配见 `.pi/skills/evidence-modeling/UPSTREAM.md`。

**证据边界**：`machineValidated`、实际 `simulationPassed`、模型 `modelStatus/stakeholderReview` 和 Domain Gate 相互独立。模型校验使用本地 `--model-only`，再独立模拟；合法模型可“结构通过、场景失败”，整体仍失败。无适用单据场景时模拟为 null/未执行，不是 true；有履约却缺场景则报告覆盖 warning。纯领域模拟器不实例化 Thing/Party，也不证明操作或状态机已执行；领域规则及 v3 尚不能完整表达的操作、状态迁移、关系基数和复杂算法，需 DDD 明确 gap，Architecture/Planning 安排正常、边界和反例 Q1/Q2 测试。

Domain Gate 与最终 Review 重新校验并刷新文件清单；模型源文件、discovery、状态及派生产物都进入摘要，变化需重新审核。零退出码但校验 JSON 缺明确通过标记、命令异常或后续步骤失败，均阻止放行。Requirements/Domain 修订和回退会使旧决策/机器结果失效，已有文件仅供比对。后续工件追溯 Context/Entity/Rule，以及实际存在的 Fulfillment/Evidence/Scenario；API、数据模型、Repository、并发和消息重试等实现机制留给 Architecture，不写回 FM。

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

第二批在同一 Markdown 工件中增加机器可读契约（均为 schema version 1，不另设阶段或 Slash Command）：

| 工件                | 唯一 JSON 块的 kind  | 机器契约                                       |
| :------------------ | :------------------- | :--------------------------------------------- |
| story-map.md        | `acceptance-catalog` | 全部 US 与稳定 AC 场景 ID                      |
| test-procedures.md  | `test-procedures`    | TP 工序 ID 与主要象限                          |
| sprint-1-backlog.md | `test-plan`          | 有序故事、TASK/依赖、模式、CHECK/命令/测试文件 |

具体格式见对应模板。提交和阶段检查拒绝缺失/重复 JSON 块、未知引用、场景集合不一致、依赖环及不安全的测试命令。每个故事至少一个 TDD 任务；每个场景关联可执行 Q2 和支撑 Q1 任务（Q1 可以批准理由声明不适用）。TASK/CHECK 全局唯一，依赖限于同一故事。自动执行只接受 Q1/Q2；Q3/Q4 留在计划、DoD 和人工审查中。

Planning Gate 绑定需求、DDD、架构、规划、FM 输入和配置的 SHA-256 摘要。Coding/Review 检查摘要，拒绝过期契约；Gate 包括结构化编码记录、计划测试文件、代码及命令报告的摘要，变化后必须重新检查。

**能力边界**：机器能核对声明的 ID、依赖、文件存在性、命令结果和循环顺序，不能证明叙述与 JSON 一致、命令实际选中了每个声明用例、断言覆盖全部业务语义、替身符合策略或 Q3/Q4/UAT 完成。测试失败识别是启发式过滤，不是通用测试报告解析；运行脚本仍是受信任项目代码，不是安全沙箱。人工 Gate 仍需审核这些内容。

### 3.3 使用新版测试契约

- 更新后执行 `/reload`，工具列表应出现 `evidence_complete_tdd_cycle` 和 `evidence_verify_task`；Red 增加必需的 `taskId`、`checkId` 参数。
- 版本 1/2/3 运行按 §2.2 重置并重新初始化，不能仅回退阶段或手改版本号。新运行会按模板生成三个 JSON 契约和测试策略工件。
- 版本 4 中缺少目录、场景数据、工序或需要修改测试命令时，使用 `/evidence-back` 回到对应上游，再 `/evidence-revise`、`/evidence-run` 并重新审核。回到 Planning 后的新 Gate 会重新绑定契约；下游证据必须重新取得。
- 保留的旧工件只供修订比对，不等于批准。不要直接改 artifacts/reports 或 `.evidence/state.json`，不要由 Coding 编造上游 ID、N/A 理由或通过结果。

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

故事及顺序只来自批准的 `test-plan`，不再从任意 Markdown 文本提取 US ID。Coding 一次处理一个故事：

1. 选择依赖已完成的 `tdd` 任务及 CHECK，先添加真实行为测试，再调用 `evidence_tdd_red({storyId, taskId, checkId, command, expectedFailure})`。command 必须与计划完全一致；非零退出、有效输出和非空测试文件才可能成为 Red，环境/语法/零测试不算行为失败。
2. 写最小实现，调用 `evidence_tdd_green({storyId, observation})`。重跑与 Red **完全相同**的命令，要求通过，且 Red 的测试文件哈希不变，不能删除或削弱测试取得 Green。
3. 重构后调用 `evidence_complete_tdd_cycle({storyId, refactorSummary})`。聚焦检查重新通过后追加完整循环，清空活动检查点并返回 Red；继续同一 CHECK 的下一行为或其他任务。循环数量不占 `maxRounds`，也不重置故事 Git 基线。
4. 对批准的 `verify` 任务调用 `evidence_verify_task({storyId, taskId})`，检查依赖后执行全部 CHECK。用于复用与业务验收，不制造虚假 Red。`not-applicable` 只能来自计划中的理由，不能在 Coding 临时豁免。
5. 每个 tdd CHECK 至少一个完整循环、所有适用任务完成、当前修订至少一个新循环且没有活动循环，才可最后调用 `evidence_complete_story`。提交实现/重构摘要和全部真实变更文件，至少一个生产文件及一个测试文件；Git 可用时核对故事开始时的脏工作区基线，拒绝遗漏或未在本故事中改变的文件。

工具串行化当前项目的 TDD 操作，状态跨 Session 恢复保留活动任务、命令、历史循环、验证结果和故事基线。每故事生成 `artifacts/05-coding/US-xxx.json` 与 `.md`，包括运行/契约摘要和逐项真实证据；不是由 Agent 手写的通过声明。

故事完成时重跑**所有适用计划 CHECK**（不仅最后一个循环），再执行 `.pi/evidence.json` 中的质量命令。默认是：

```bash
npm test
npm run lint
npm run build
```

聚焦 Red/Green/Refactor 或 verify 失败保留当前状态，修复后重试，不占人工修订轮次。最终计划检查或质量命令失败生成报告，保留已完成循环，按原有失败轮次规则等待修复；没有通过证据不能产生 Gate。

人工要求修改（含 Review 回退最后故事）保留完整循环和故事基线，设置修订边界并要求至少一个新循环；既有验收记录不是永久通过保证，故事提交时仍全部重跑。下一故事才重置基线及当前故事循环；前面故事的结构化记录仍保留。

Coding 重新检查与最终 Review 都验证结构化记录摘要、运行/计划归属、循环及任务覆盖，并重跑全部批准检查和质量命令。Review 报告必须列出每个承诺 US/AC ID；任一旧故事缺失、证据被篡改、测试文件不存在或契约过期都会阻塞。最终 Review 的 Gate 摘要涵盖全部故事，而不是只看最后一个。

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

这些命令不会调用语言模型。回归测试覆盖工件接线、JSON 契约、任务依赖、多循环/恢复、验收阻塞、文件/证据篡改、Gate 摘要、旧状态拒绝及质量命令。它们验证确定性流程，不是模型生成工件质量或真实 TUI 人工端到端评测。`evidence:test` 还会准备隔离的 FM Python 运行环境，执行 Schema v3 纯领域、纯渠道、混合与履约模型的校验、追溯、适用单据模拟、业务模式派生、确定性编译，以及建模 Skill 的 Python 自测。这些合成回归不是外部 Agent 生成质量对照基准或具名业务验收。首次运行可能需要下载 Python 依赖。
