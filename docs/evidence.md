# Evidence 工程工作流

本项目的 Evidence 是本地 Pi TUI 工作流：扩展持有状态，Agent 发现业务、提交工件或执行当前故事，人类回答业务问题并审核 Gate。不依赖 CI、自动 Push 或 CI Secret。

## 1. 准备

在项目根安装依赖并启动 Pi，信任项目扩展和 Skills：

```bash
npm install
npx pi
```

需要时通过 `/trust` 信任后重启。FM 校验需要 Python 3.10+，可用 `EVIDENCE_PYTHON` 指定解释器；依赖按 requirements.txt 哈希安装到 `node_modules/.cache/evidence-fm-runtime`，不污染系统 Python。

## 2. 初始化与破坏性升级

### 2.1 Init 直接进入交互建模

```text
/evidence-init 我们希望解决作者结算争议，目前财务用表格处理，有脱敏协议与结算表
```

也可不带参数，在编辑器中输入。只需描述业务问题、目标、初步范围和材料位置，不必先提供完整合同、履约项、人物画像或用户故事。

扩展保存 `artifacts/00-input/requirements.md`，创建新运行并进入 Modeling 的发现活动。第一轮定位本次问题和探索范围，不设置独立 Requirements 阶段、访谈基线 Gate 或前置完整需求批准。

### 2.2 破坏性升级

工作流状态版本为 **6**，不兼容旧版本，不提供迁移，不复用旧索引、发现记录、测试证据或 Gate。FM 仍为 **Schema v3**，测试契约 JSON 和配置版本仍为 1。

升级前备份旧运行；移除 `.pi/evidence.json` 中的 `models.requirements` / `gates.requirements`，核对 `modeling` 的模型与 Gate 设置。旧 `domain` 配置同样拒绝加载。随后：

```text
/reload
/evidence-reset
/evidence-init
```

`/evidence-reset` 可在旧状态无法加载时运行。选择保留工件时只删状态，旧文件仅供参考，不是新运行的批准证据；明确选择删除才清理生成目录。不要手改状态版本号。升级代码本身不会改写已有运行、工件或报告。

## 3. 五阶段流程

```text
Init
  ↓
Modeling：交互发现 ↔ 局部模型 ↔ 四色追溯 ↔ 案例回放
          → 统一语言 → FM → 软件需求收敛 → Modeling Gate
  ↓
Architecture → Planning → Coding（逐 US）→ Review → complete
```

阶段间通过文件交接。默认每个阶段/编码故事一个 Session；发现问答保持当前阶段，不为每一题开新 Session。

### 3.1 发现不是固定问卷

根据实际范围选择入口，不按系统名称强制分类：

| 范围              | 发现主线                                                                                   |
| :---------------- | :----------------------------------------------------------------------------------------- |
| 对外交易/内部绩效 | 收入、支出、目标—实际 → 双方 Role 与合同/协议 → 履约请求、期限、确认与异常                 |
| 四色凭证追溯      | 在履约内寻找凭证，追溯金额、数量、比例、时间的输入及公式来源，补齐角色、参与者、标的与描述 |
| 签约前渠道        | 真实 RFP、Proposal、协商和签约来源；不把它们伪装成履约                                     |
| 纯领域            | 对象身份、属性、关系、资格、不变条件和计算，不要求合同                                     |
| 简单工具胶水      | 核对是否存在独立语义；仅确实没有时可不建模                                                 |

这些活动可往返。发现一张凭证可能揭示新的合同、角色或错误边界。局部业务不必展开整个企业；没有合同不等于 FM 不适用，材料不足也不等于不适用。

关键未知项由 Agent 调用 `evidence_ask_questions` 保存，每次 1–4 个相关问题，包含 Q-ID、焦点、来源、影响和是否阻塞。扩展进入 `waiting_answer`，不把提问结束误报为提交失败。

### 3.2 回答与更正

```text
/evidence-answer
/evidence-answer Q-001
```

选择问题后，扩展通过 `gh api --hostname github.com user` 读取当前认证账号，在回答编辑器中显示，并自动将 `github.com/<login>` 记录为回答者，不再手动输入姓名或业务角色。然后填写回答，选择“事实或决定”“未知，仍需澄清”或“移出本次范围”。取消或空输入不会保存假回答。

- 需要已安装 GitHub CLI 并运行 `gh auth login --hostname github.com`；读取失败（含网络失败或 10 秒超时）时不打开回答编辑器、不保存回答，修复后重试。
- “当前账号”指本机 `gh` 对 github.com 生效的认证账号，包括 `GH_TOKEN` / `GITHUB_TOKEN` 的覆盖；不是 Git 提交者、仓库所有者或 Pi 模型登录账号。可用 `gh api --hostname github.com user --jq .login` 核对，已存储账号可用 `gh auth switch --hostname github.com --user <login>` 切换。
- 每次回答或更正重新读取账号，历史回答者保持原样。仅保存账号标识，不保存 Token 或完整用户资料；账号归属不证明操作者实名、业务角色或批准权限，回答仍不等于模型批准。

- 可部分回答，剩余问题继续等待；所有问题已有回答后回到 ready，运行 `/evidence-run` 消化回答。
- “未知”是有效回答，但阻塞问题仍不能定稿；可继续核实或明确缩小范围。
- 已回答问题可通过 Q-ID 更正，旧原文保留。更正会使旧草稿检查、正式定稿和待审 Gate 失效，不消耗修订轮次。
- 进入架构等下游后必须先 `/evidence-back` 回到 Modeling 再更正，不允许旁路改写已批准业务事实。
- 问题等待与回答持久化，可跨 Session、暂停和重载恢复。`/evidence-next` 在等待回答时打开回答流程。

普通问答不是失败轮次，不消耗 `maxRounds`。Agent 不能代用户填写回答；缺少依据时停下来，不通过预设价格、时限、权限或赔偿制造完整模型。

### 3.3 发现记录、来源和草稿

`evidence_save_discovery` 保存完整工作快照：范围、排除项、当前焦点、说明、来源、候选及案例回放。工具带 `expectedRevision`，拒绝过期/并发覆盖。

```text
artifacts/02-modeling/discovery/<runId>/revision-N.json
```

记录由扩展追加，`.evidence/state.json` 仅保存当前版本、路径、摘要和发现/定稿状态。新运行有新 runId，不读取旧运行作为已确认发现。快照含用户原文和材料位置，需按项目敏感数据要求保存，只使用获授权的脱敏材料。

- `INPUT` 指原始输入；`SRC-*` 指项目内原始材料及定位；`A-*` 指最新人工回答。
- 原始文本材料保存 SHA-256；模型或报告不能冒充独立业务来源。二进制材料应先提供可核对的脱敏文本及原始定位。
- `explicit/inferred/unknown` 表示候选依据，不是模型批准状态；未知/已被更正的回答不能支撑明确事实。
- 候选和发现记录不是第二份正式模型，未确认候选不能声明绑定正式模型 ID。
- 原始材料变化必须重新发现；相关摘要纳入 Gate 和下游测试契约。

完整 FM 候选可以用 `evidence_check_model_draft` 在临时目录运行既有 Schema/CEL、lineage、适用单据模拟与编译。无论成功失败都不替换正式 FM、不创建 Gate；只保留候选文件摘要和实际检查结果。草稿文件内容由 Agent 随当前候选重新提交，发现快照本身不保存整套草稿 YAML。后续修改发现记录会清除当前草稿结果，历史结果仍在旧快照中。

### 3.4 案例回放与定稿

正常、边界、异常/追责案例分别记录输入情节、预期、来源与 gap。不适用也要提供具体理由。预期须来自业务材料或回答，不能从实现倒推，更不能为了让模拟通过而削弱预期。

单据回放检查：在当时可见的凭证下，Role 能否发起请求、确认结果、解释争议。验证场景固定 `asOf`。纯领域则回放对象规则，并把操作/状态机验证交给后续 Q1/Q2；现有模拟器只实例化 Evidence，不实例化 Thing/Party。

`evidence_finalize_discovery` 检查声明的范围、来源新鲜度、问题状态、候选来源和三类回放覆盖后进入定稿。这不是人工批准，也不能证明所有问题都已被发现。关键问题未解决时继续发现或有依据地移出范围。

正式工件顺序：

1. `artifacts/02-modeling/ubiquitous-language.md`：从发现中形成术语、示例、非例及歧义。
2. `artifacts/02-modeling/fm-model/`：统一 FM v3。
3. `artifacts/01-requirements/personas.md`：实际用户/角色与软件需求。
4. `artifacts/01-requirements/problem-statement.md`：问题、软件职责、MVP 与排除项。
5. `artifacts/01-requirements/story-map.md`：稳定 US/AC、Given/When/Then、示例及 acceptance-catalog JSON。

`01-requirements` 是需求投影的存储目录，不代表前置阶段。画像、Epic、故事不再按固定数量补造。业务模型包含的线下、第三方和人工活动不自动成为本系统待开发功能。

Markdown 用 `evidence_submit_artifact`，FM 用 `evidence_submit_fm_model`。FM 后继续需求收敛，不立即创建 Gate。全部完成后重新检查，统一进入 Modeling Gate。`autoContinueArtifacts` 只控制定稿工件之间的衔接，不自动回答业务问题或跳过审核。

定稿途中发现冲突，可用发现工具重开循环，旧定稿失效，从统一语言重新提交。术语和模型在发现中共同迭代；正式 FM 不依赖后生成的用户故事，不产生循环依赖。

### 3.5 FM 格式和证据边界

FM 源文件包括 model.yaml、说明、entities、按需 fulfillments/relationships/rules/business-patterns，以及可选 discovery 摘要与 validation 实例/场景。只接受白名单路径、单文档 YAML、稳定 ID；Agent 不提交 generated、02-business-patterns.md 或 status.md。工具校验成功后原子替换并派生结果。

- Domain Context 可独立建模；Party 在 Context 外，Place/Thing 属于 Domain Context。
- 履约位于父 Contract 的子 Fulfillment Context；合同双方 Role 留在父上下文。
- Request interval 使用 required、keyData timestamp；无固定期限须有明确依据，不用 openEndedReason 掩盖材料缺失。
- 关键数据派生用 CEL/AST lineage，不另写第二份依赖 DSL。
- v3 对操作、状态迁移、关系基数、复杂算法的表达缺口在 README 明确来源、未验证部分和下游责任。
- FM Context 不直接等于 DDD 限界上下文、事务聚合或微服务；Architecture 决定软件保障机制。
- modelStatus/stakeholderReview、machineValidated、实际 simulationPassed 和 Modeling Gate 相互独立；默认 draft/pending，不因机器成功自动提升。
- 没有适用单据场景时 simulationPassed 为 null/未执行，不是 true。有履约但缺场景会报告覆盖 warning，人工仍要核对覆盖。

## 4. Gate 与配置

```text
/evidence-review
```

可批准、要求修改、重新检查、编辑正式 Markdown 或稍后决定。发现记录和派生产物不能通过普通 Gate 编辑器改写。审批绑定工件、发现记录、原始材料和报告的 SHA-256；变化后必须重新检查或重开发现。

配置 `.pi/evidence.json`：

- `models.modeling/architecture/planning/coding/review`：null 继承当前模型，或指定 provider/model-id；thinkingLevel 独立配置。
- `gates` 同名五阶段：review 必审，auto 检查通过后推进，review_if 有警告时必审。当前全部 review。
- `maxRounds` 限制质量失败与人工修订，不限制正常问答或故事内 TDD 循环。
- `newSessionPerPhase`、`gitCheckpointOnApproval`、`qualityCommands`、`commandTimeoutMs` 沿用原语义。

批准后默认创建新 Session 并预填 `/evidence-run`。可选 Git checkpoint 只在本地；有人工暂存时跳过，不 push。Agent 不自行 stage/commit。

## 5. 架构、计划、编码与审查

架构从共同批准的模型及软件范围开始，在 context-map/module-structure 中按需作 DDD 映射；依次生成架构风格、技术栈、API、数据模型、test-strategy.md 和 test-procedures.md。没有独立 DDD 阶段或四篇强制文档。

三个机器契约 JSON 块保持 version 1：

| 工件                | kind               | 职责                                              |
| :------------------ | :----------------- | :------------------------------------------------ |
| story-map.md        | acceptance-catalog | 稳定 US/AC 场景目录                               |
| test-procedures.md  | test-procedures    | TP 工序与主要象限                                 |
| sprint-1-backlog.md | test-plan          | 有序故事、TASK、依赖、模式、CHECK、命令和测试文件 |

Planning 按“故事 → 场景 → 工序 → 任务”实例化，并绑定上游摘要。Q1/Q2 按目的而非单元/集成区分；Q3/Q4 提前规划，人工评价不能由自动命令冒充。

Coding 仍保留批准计划的真实多循环 TDD：

1. `evidence_tdd_red`：增加行为测试后执行精确批准命令，绑定 TASK/CHECK；环境/语法/零测试不是 Red。
2. `evidence_tdd_green`：重跑原命令，Red 测试文件哈希不得改变。
3. `evidence_complete_tdd_cycle`：重构复验并追加循环，不消耗修订轮次。
4. `evidence_verify_task`：对批准的复用/验收任务执行检查，不制造假 Red。
5. `evidence_complete_story`：全部适用任务有证据、真实源码/测试变更完整后，重跑全部 CHECK 和质量命令，再创建故事 Gate。

每故事保存 `artifacts/05-coding/US-xxx.json` 与 `.md`。任务依赖、测试文件、命令、循环、源码及报告摘要都要一致。正常失败保持检查点；最终质量失败按轮次规则处理。人工修订要求新循环，不能复用旧完成声明。

Review 只读核对全部故事/场景、设计、源码、测试边界、替身和 Q3/Q4，重跑计划检查与质量命令。命令通过只证明实际执行结果，不证明断言覆盖全部业务含义或 UAT 已完成。

## 6. 命令与保护

| 命令                             | 用途                                     |
| :------------------------------- | :--------------------------------------- |
| /evidence-init                   | 保存输入，启动新的交互 Modeling          |
| /evidence-run                    | 执行当前就绪发现、工件或故事             |
| /evidence-answer [Q-ID]          | 回答或更正发现问题                       |
| /evidence-next                   | 按状态继续、回答或审核                   |
| /evidence-status                 | 当前阶段、发现版本、进度、报告、Gate     |
| /evidence-check                  | 定稿完成后重检，不能跳过发现或缺失工件   |
| /evidence-review                 | 人工 Gate                                |
| /evidence-revise [反馈]          | 修订当前阶段；Modeling 重开发现          |
| /evidence-back                   | 回退一个阶段；保留文件但使相应旧决定失效 |
| /evidence-pause /evidence-resume | 暂停/恢复阶段工具约束                    |
| /evidence-reset                  | 重置状态，可明确选择清理工件             |

`.evidence`、artifacts、reports 由扩展拥有。不得手改状态、绕过提交工具写工件，或让产品任务修改扩展/Skills。显式插件维护可以改扩展实现，但不能顺手改活动运行、Gate 或报告。

发现期间保存后停止是合法检查点；`/evidence-run` 可继续。正式文档任务未提交就结束，恢复 ready 并提示重新执行。工具限制不是安全沙箱，项目脚本及本地扩展需要信任。

## 7. 扩展验证

```bash
npm run evidence:verify
npm test
npm run lint
npm run build
```

扩展验证包含类型、Vitest、格式及隔离 FM Python 测试，不调用语言模型。回归覆盖问答等待/恢复、部分回答、取消、更正、来源/快照篡改、草稿隔离、共同 Gate、Schema/lineage/适用模拟和下游测试契约。这些是合成自动化证据，不是具名业务验收或真实 TUI/Agent 生成质量评测。
