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

也可不带参数，在编辑器中输入。先讲业务问题、实际发生的事和材料位置即可，不必先定义完整范围或提供合同、履约项、人物画像和用户故事。

扩展保存 `artifacts/00-input/requirements.md`，创建新运行并进入 Modeling 的发现活动。Agent 首先从叙述和材料识别有依据的候选上下文，解释不确定点并引导你核实具体事实；不是先要求你完成范围问卷。不设置独立 Requirements 阶段、访谈基线 Gate 或前置完整需求批准。

### 2.2 破坏性升级

工作流状态版本为 **6**，发现日志仅支持 **v6**，Context 评估与事实覆盖协议为 **v1**。FM 仍为 **Schema v3**，测试契约与配置仍为 1。无兼容逻辑：拒绝旧日志、缺 assessment、候选级评估／覆盖和旧 finalizing 自动进入需求的路径，不迁移、不转换、不自动重置。升级不会修改旧运行数据、工件或 Gate；旧运行由人工决定归档或重新初始化，不能手改版本号。

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
Modeling：上下文识别 ↔ 合同履约/领域对象/渠道协商 ↔ 业务来源追溯 ↔ 案例回放
          → 手动更新模型：统一语言 → FM → 停回发现（可重复）
          → 手动进入需求收敛：软件需求 → Modeling Gate
  ↓
Architecture → Planning → Coding（逐 US）→ Review → complete
```

阶段间通过文件交接。默认每个阶段/编码故事一个 Session；发现问答保持当前阶段，不为每一题开新 Session。

### 3.1 Agent 识别上下文，再引导具体事实

建模方法与运行资源以 `.agents/skills/` 为唯一维护源。发现阶段组合 `.agents/skills/evidence-discovery/SKILL.md` 与其 interview 访谈机制，以及 `.agents/skills/evidence-fm/references/` 下 business-analysis、provenance、scenario-validation 专业准则，不加载模型生成流程。统一语言和正式 FM 使用 evidence-fm；需求使用 evidence-requirements。项目受信任后 Pi 原生发现 `.agents/skills/`，启动与重载都无需扩展注册、复制或同步。交互、追加日志与提交差异只放在 `.pi/extensions/evidence/instructions/modeling-adapter.md`，不写入独立包。代码负责状态、恢复与工具约束，Agent 负责根据材料识别语义，不增加关键词分类器或互斥建模模式。

| 实际语义       | Agent 的引导主线                                                                   |
| :------------- | :--------------------------------------------------------------------------------- |
| 合同/内部绩效  | 候选合同上下文 → 双方角色与约定 → 展示履约请求—确认凭证候选 → 核实缺口、期限与异常 |
| 纯领域         | 候选领域上下文与对象 → 身份 → 属性与关系 → 变化条件、不变条件与计算 → 反例         |
| 签约前渠道     | 真实邀请、报价或方案 → 请求与回应 → 协商规则 → 按需连接签约来源                    |
| 共用追溯与回放 | 凭证及数据来源、公式与历史版本、正常/边界/异常案例；缺口返回对应业务事实           |

例如“找作者写文章，按阅读收入分成”，Agent 会指出可能的内容合作协议并核实双方承诺，而不是让你先列功能清单。若材料已明确签约、交稿义务及编辑代表平台催稿，就先展示“平台（编辑代表）向作者请求交稿 → 确认凭证待明确”，附要求／依据与期限，再问“以什么记录证明本次交稿完成？”。不自动补造编辑验收或审批阶段；已有独立验收约定则保留并核实其标准和凭证。签约前试写留在渠道主线，不混入签约后交稿履约。“客户档案重复”则从身份判断与合并规则切入，不索要合同。“报价尚未接受”不会补造已签合同。流程中的按钮、导入或内部操作不自动成为履约。

合同、领域和渠道可以并存；不让用户先选择模式，不按“CRM”等系统名称分类。材料明确的直接引用，推断标为候选，缺依据问具体事实，不靠用户沉默把猜测当成确认。

**范围是发现成果，不是前置问卷。** Agent 随发现整理已展开、暂未展开和已确认排除项，只有影响当前结果的边界歧义才问你。例如多个合同中，当前争议来自哪一份？不自行扩大或缩小目标，不把未提及的业务自动排除。局部业务不补齐整个企业；没有合同不等于 FM 不适用，材料不足也不等于不适用。简单工具胶水只有确无独立语义时才可声明不适用，仍走本地定稿与共同 Gate。

每轮先展示有来源的候选结构及不确定点，通过 `evidence_save_discovery` 追加本轮理解（现有视图已反映理解则不重复提交），再围绕其中一个关键缺口，Agent 调用 `evidence_ask_questions` 只保存一个核心业务问题，包含 Q-ID、焦点、来源、影响和是否阻塞。工具拒绝批量提问；指南要求不在一题中捆绑多个子问题，也不预排问卷。问答界面显示对应合同及履约关系，不再堆叠焦点和阻塞统计；问题的来源、影响和阻塞标记仍保存在问题记录中。扩展进入 `waiting_answer` 后停止，不把提问结束误报为提交失败，也不要求每轮生成正式模型。

### 3.2 回答与更正

```text
/evidence-answer
/evidence-answer Q-001
```

通常不需要输入命令：Agent 保存一个问题并完全结束本次生成后，自动显示当前合同／履约和问题，首层提供“回答”“更新模型（纳入已积累的发现）”和“结束本轮问答，整理已有信息”。选择“回答”直接进入编辑器，提交后以“事实或决定”留存并自动启动消化，不再先选场景或回答类型。

TUI 中以问答卡片为主要展示入口，上下文、当前履约项、问题正文与操作分区展示；提问工具结果只提示问题已保存、`/evidence-answer` 重开和 `/evidence-status` 查看完整结构，不重复问题正文及履约树。按 **F2** 仅展开／收起当前候选详细说明、来源和前序触发依据，完整履约结构留在 `/evidence-status` 按需查看。按 **Ctrl+↑↓** 滚动上下文；问题正文不截断，窄屏自动换行，空间不足时优先定位当前问题。编辑器沿用 Pi 原生输入，支持中文 IME、Shift+Enter 换行和配置的外部编辑器快捷键（默认 Ctrl+G）。界面仅在回答期间出现，不增加常驻面板；RPC 客户端继续使用普通选择和编辑对话。

Esc 仅关闭当前菜单或编辑器，空输入不保存，也不代表结束本轮；同一问题不会反复弹出，可用 `/evidence-answer` 或 `/evidence-next` 手动重开。`/evidence-answer Q-ID` 保留高级操作：“事实或决定”“未知，仍需澄清”“移出本次范围”“暂不确定／跳过此题”和“返回场景选择”，用于明确标注未知、排除、跳过、补答或更正。自动入口与手动入口不会重叠；重载／切换 Session 不自动弹出旧问题，也不会清除停止标记。非交互模式保留等待状态，提示到交互模式回答。

选择记录回答时，扩展才通过 `gh api --hostname github.com user` 读取当前认证账号，在回答编辑器中显示，并自动将 `github.com/<login>` 记录为回答者，不再手动输入姓名或业务角色。取消或空输入不会保存假回答；移出范围仍须填写原因。跳过与结束不需要输入文本或读取 GitHub 账号。

- 需要已安装 GitHub CLI 并运行 `gh auth login --hostname github.com`；读取失败（含网络失败或 10 秒超时）时不打开回答编辑器、不保存回答，修复后重试。
- “当前账号”指本机 `gh` 对 github.com 生效的认证账号，包括 `GH_TOKEN` / `GITHUB_TOKEN` 的覆盖；不是 Git 提交者、仓库所有者或 Pi 模型登录账号。可用 `gh api --hostname github.com user --jq .login` 核对，已存储账号可用 `gh auth switch --hostname github.com --user <login>` 切换。
- 每次回答或更正重新读取账号，历史回答者保持原样。仅保存账号标识，不保存 Token 或完整用户资料；账号归属不证明操作者实名、业务角色或批准权限，回答仍不等于模型批准。

- 问答开启时，每次回答、未知、排除或跳过后自动启动一次消化。Agent 必须先用 `evidence_save_discovery` 保存更新后的候选、案例和合同视图，再决定下一问或执行草稿／定稿校验；向你简述明确了什么、模型如何变化、还缺什么。一次回答包含多项信息时全部吸收，已明确的内容不重复问。
- 当前运行的历史问题完整保留，答一题就先消化，不要求答完剩余题。场景列表当前题优先，其余供主动切换讨论对象或更正，不是必做题目清单。其他未答问题不自动删除、暂缓或排除；已有事实足以覆盖时，可追加带原文摘录的 resolution 关联到原 Q-ID，不要求重复回答。仍未解决时 Agent 可原文重用一条未答且未暂缓的 Q-ID。新问题须提供稳定 gapKey（对象与事实维度），同一缺口不换标识。暂缓不生成 `A-*` 回答、不解除业务阻塞、不换 Q-ID 重复追问。
- 人工结束本轮后补充答案不会自动启动或恢复提问，可用 `/evidence-run` 手动整理。取消、空输入或 GitHub 读取失败不触发消化。自动任务中断后可 `/evidence-run` 接续；保存后没有必要的新问题时可以停止，不强行凑题。
- “未知”是有效回答，但它本身不能解除业务阻塞；可用其他有效事实建立解决依据，或由人工继续核实／明确缩小范围。
- 已回答问题可通过 Q-ID 更正，旧原文保留。更正会使旧草稿检查、正式定稿和待审 Gate 失效，不消耗修订轮次。
- 进入架构等下游后必须先 `/evidence-back` 回到 Modeling 再更正，不允许旁路改写已批准业务事实。
- 问题等待与回答持久化，可跨 Session、暂停和重载恢复。`/evidence-next` 在等待回答时打开回答流程。

普通问答不是失败轮次，不消耗 `maxRounds`。Agent 不能代用户填写回答；缺少依据时停下来，不通过预设价格、时限、权限或赔偿制造完整模型。

#### 手动结束本轮，不必逐题输入

在自动打开的当前问题菜单中直接选择“结束本轮问答，整理已有信息”，无需输入命令或回答文本。高级单题菜单仍可通过“返回场景选择”找到结束入口；返回不保存回答。也可直接运行：

```text
/evidence-discovery finish
```

该命令在未暂停且空闲的 Modeling 发现阶段可用，保存人工停止标记并启动一次整理任务：保留原始问题、已答内容、暂缓项和历史版本，禁止 Agent 自动追问或用新 Q-ID 重新发起问答。无论是否有阻塞项，都只保存发现、列出缺口并停止，不更新正式模型。非阻塞问题可以保留为未解决缺口，不能当作明确事实。结束问答不是批准模型，也不创建或跳过 Gate。

如需恢复提问或重新处理暂缓问题：

```text
/evidence-discovery resume
```

恢复后，未回答与暂缓问题可重新讨论；已有回答不丢失。若还有未消化输入，先运行 `/evidence-run` 整理，否则进入待答列表。也可直接 `/evidence-answer Q-ID` 补充个别答案，不必恢复自动提问。普通 `/evidence-run`、重载及 `/evidence-pause` / `/evidence-resume` 不会清除人工停止标记。只想离开编辑器可按 Esc 取消，再用 `/evidence-pause` 暂停整个工作流。

问答控制作为独立 interaction 事件追加，不是业务回答或可引用的 `A-*` 来源；扩展重放问题、回答和控制事件，派生 stopped、activeQuestionId、needsConsolidation 和暂缓列表。新运行初始化为未停止且无当前题、无待消化输入、无暂缓项。人工恢复问答且无待消化输入时，选择一条尚未回答的问题继续，不恢复批量问卷，不自动改写历史。

#### 手动更新模型与进入需求收敛

积累若干轮问答后，在问题菜单选择「更新模型（纳入已积累的发现）」，或者运行：

```text
/evidence-discovery update-model
```

Agent 先消化全部新回答，再按 Context 组织全历史候选，声明本批次职责、具体已知／未知事实、所需事实、来源、回放和剩余职责。Domain 检查身份／结构／相关规则，Channel 检查真实双方／凭证／有效性／相关回应，Contract 检查相关约定与双方，Fulfillment 检查请求／期限依据／确认凭证／判断规则。跨 Context 依赖具体事实及其 structure/provenance/decision 用途，各阻塞题定位实际事实，不要求相关 Context 整体完成。

扩展区分 ready（本批次职责就绪）、support（只纳入被消费的已知支撑事实）、pending（本次未纳入），保留事实级阻塞路径。例如已确定订单金额可支持付款，而不必先补完报价渠道；真正依赖未知报价版本时，才沿该路径阻塞。领域身份不依赖全部生命周期，合同不依赖全部签约渠道、兄弟义务或补偿链。未纳入项仍是缺口，不代表无后续责任或已排除范围；没有可纳入职责也保存实际评估并保留上一版 FM。

随后运行 `/evidence-run` 接续统一语言与 FM 更新。成功后停回发现，即使开启 `autoContinueArtifacts` 也不会自动进入软件需求。每批次记录发现版本、Context 状态、纳入事实和产物摘要；FM 的 discovery-coverage v1 精确列出全部 Context 的状态／模型引用／retainedFactRefs／remainingScope，以及纳入事实的实际模型 ID。发布前核对 ID、Context 类型与纳入／保留范围，防止把支撑投影宣称为整体完成；变更说明保留新增、修订、撤回依据。失败不覆盖上一版有效 FM。尚未完成的更新在任务空闲后也可用 `/evidence-discovery resume` 放弃本次更新请求、回到问答；已提交的语言文档可能是本批次版本，下一次更新会重新生成并核对，不把它当作上一版 FM 已更新。

你可以继续 `resume` 问答并多次更新；准备收敛软件职责时，另选菜单中的「进入需求收敛」或运行：

```text
/evidence-discovery converge
```

有新发现尚未更新、未消化回答、原始材料或已发布模型文件变化时，不能直接收敛。手动更新与收敛均不代替 Modeling Gate。所有批次共用同一新协议，无旧 finalizing 兼容分支。协议细节见 `.pi/extensions/evidence/instructions/incremental-assessment.md`。

### 3.3 发现记录、来源和草稿

`evidence_save_discovery` 只提交本轮 `summary`、`sourceRefs`、`records`，不再提交完整工作快照。工具绑定 `expectedRevision`，拒绝过期／并发写入；扩展生成新 D-ID。记录类型为 scope（范围与排除项）、position（focus 与 current）、note（分析说明）、source（原始材料）、candidate、case、contract（上下文与双方）、fulfillment（单个履约及所属合同）、resolution（问题解决依据）、withdraw（撤回）。`focus` 是工作位置，不是固定阶段；不为填满字段编造范围、合同或规则。

- 首次提出对象：`supersedes: null`。
- 更正已有对象：提交该对象的新说明，`supersedes` 引用当前 D-ID；稳定 C-ID／SRC-ID／CASE-ID 不变。
- 撤回：追加 withdraw，引用待撤回的当前 D-ID；旧原文仍可追溯，不是删除。重新提出须引用撤回记录；遗漏某对象不代表撤回。
- D-ID 格式为 `D-003-001`（版本号、本轮序号），由扩展分配，从当前视图 recordHeads 获取；不能将 D-ID 当作独立业务来源。
- 同轮处理悬空关系；例如撤回合同时须处理其履约和当前位置。历史问题不能由 Agent 撤回；已知事实可通过 resolution 关联解决，真实未知／冲突仍须人工处理。

#### 共用提问决策与问题解决关联

所有主线先核对已有材料、候选与最新有效回答：已知事实直接复用，确定性结果保存推导，技术映射交 Architecture，FM 表达缺口由 Agent 补模或记录；只有仍影响业务结果的真实知识缺口／冲突才问。类型必填字段、角色槽位、追溯和回放清单不是用户必答题，不能反过来编造业务事实。

来源追溯统一在 `.agents/skills/evidence-fm/references/provenance.md` 的“业务来源追溯的统一循环”：展开对象／凭证类型 → 复用已有事实 → 追溯关键数据的业务来源 → 区分直接记录、引用已有值、规则派生或来源待明确 → 保存依据／缺口 → 必要时逐问并回放。所有关键金额、数量、比例、时间及领域结论都适用，不等 Agent 觉得需要派生才开始。从关键值定位凭证或对象属性，沿引用与派生输入核对提供角色、业务事件、适用约定和规则版本；不增加实体类型或来源字段。

公式可以没有，业务来源不能由字段存在代替。直接记录须保留提供来源与业务依据的已知部分；引用值保留原属性、版本和当时可见性；派生值追溯输入与规则，已有则推导、缺必要口径则问。来源性质未知先问“依据什么确定”，不预设公式或自由输入，不让人写 CEL。所有追溯先复用材料，不是逐字段问卷；未知按业务影响保留，仍服从停止／暂缓及历史缺口防重。

例如 deadline 可保留“以本次付款请求的截止时间（expired_at）为准；确定依据待明确”。若来源缺口影响逾期作废判断，就需澄清；不能只引用“规定时间内付款”、类型已展开、asserted 标签或合成模拟通过便用 resolution 关闭问题。只有已有业务事实充分覆盖原题才关联解决。升级不自动改历史题、撤回旧关联或解除阻塞，已有记录须受控整理。

这对六类凭证统一适用：RFP／Proposal 同样直接展开 start_at／expired_at；Contract 的 signed_at 表达签约时间，Confirmation 的 confirmed_at 表达履约确认时间，Other Evidence 的 created_at 表达凭证形成时间。后三类不补请求区间、不索取实例日期或记录字段。不能据此推定签约等于权益生效、确认等于回调到达、补录凭证形成等于原事件发生；相关事实有真实争议才向业务方澄清。六类都保留 required/keyData timestamp，实际实例不得缺失或互换各自的必备属性。

新问题的 gapKey 如 `c-004.payment-deadline`、`input.agreement`，同一缺口保持标识和 Q-ID。程序拦截同标识及部分文本重题，不保证识别所有语义改写；不同对象不能因问法相同而混为一题。v5 问题必须包含 gapKey，不补写或转换旧日志。

一次回答覆盖其他问题、或原始材料已足够时，Agent 可通过 `evidence_save_discovery` 追加 resolution：questionId、conclusion、reasoning、sourceRefs、citations（sourceRef、逐字 quote）。每个引用来源必须有原文摘录，只接受 `INPUT`、有效 `SRC-*` 或最新 answered `A-*`；D-\*、未知、排除和停止／暂缓标记不是事实证明。推理须说明如何充分回答原题，不得捏造约定、掩盖冲突或替代已有人工事实／排除决定。

有效关联使原题不再待答／阻塞，但不会创建 A-\* 或改写题目。历史菜单标“已关联依据”，TUI／RPC 和 /evidence-status 保留结论、推理与来源，人工可主动补答或更正，解释不会被预填为人工答案。来源版本／文件、所引用回答或原题后续人工回答变化会使关联失效；更正、撤回和重建引用 `recordHeads` 的 `resolution:Q-ID` 当前 D-ID，旧原文仍保留。失效／撤回不会自动弹题或恢复停止／暂缓；真正的业务缺口仍由定稿检查阻塞。若关联来源仅在磁盘变化、尚未显式更新，先用 `/evidence-run` 整理来源或撤回旧关联，再恢复／重选问题，避免重载后选题不一致；仍可按 Q-ID 补充真实回答。摘录存在不证明推理正确，业务批准仍走人工 Gate。

例如：第一轮记录期限7天；人工随后追加更正回答15天；Agent 再追加引用旧 D-ID 和新 A-ID 的期限解释。旧回答和旧解释都不改写，当前视图显示15天及其依据。人工回答证明当时提供了什么信息，不保证信息永远正确；Agent 解释不等于业务批准。

```text
artifacts/02-modeling/discovery/<runId>/revision-N.json
```

每个文件只保存本次事件及前序摘要，不重复全部候选与问答。问题、人工回答（更正时引用前次 A-ID）、Agent 发现记录、人工控制、机器检查分别留痕。`.evidence/state.json` 仅保存链尾版本、路径、摘要和发现／定稿状态。扩展逐条验证摘要并重放生成当前视图，拒绝覆盖历史，日志写入后指针保存中断也不覆盖遗留条目。

**不新增独立查询工具。** `.evidence/cache/discovery/<runId>/current.json` 保留完整视图（含 recordHeads、withdrawnRecordKeys、staleRecordKeys、questionResolutions）。启动／续轮／恢复时提供最多 14,000 字符的上下文包，内含待消化人工输入、当前讨论对象、相关缺口，以及同目录 `context-details.md` 的逐对象 read offset/limit；不要求每轮整份读取 current.json。尚未内嵌的新输入会明确提示补读，不得视为已消化；省略对象不等于不存在、已解决或排除。明细中保留原文、D-ID 和完整缺口索引，行号仅适用于所示 revision。历史依据仍按 D-ID 读取对应 revision 文件。

方法与指南位于每次请求的固定系统上下文，不再逐轮追加到任务历史。扩展通过 Pi 的 `context` 钩子，只在发给模型时收束本运行已标记的旧发现轮次，保留最新轮次、真实用户消息、其他扩展／运行和压缩摘要，不拆开工具调用与结果。磁盘 Pi 会话及发现日志均保留；后续阶段也不会重新塞回旧发现轮次。新会话通过 `/evidence-run` 继续，方法不依赖“上轮已经读过”的内存标记。

这限制的是自动上下文包和可识别的旧建模轮次，**不是整个模型上下文的硬 token 上限**：固定系统方法仍占输入 token，本轮主动读取的大文件、未标记历史和其他对话仍可能需要 Pi 自动压缩。内部读取、摘要校验和重放仍遍历完整日志，尚未优化为增量重放。两个缓存均可覆盖重建，不是不可变凭证、独立业务来源或 Gate 输入；校验和恢复不信任缓存，单个链尾文件不是完整现状。

新运行有新 runId，不读取旧运行作为已确认发现。日志和缓存可能含用户原文和材料位置，需按项目敏感数据要求保存，只使用获授权的脱敏材料。

- `INPUT` 指原始输入；`SRC-*` 指项目内原始材料及定位；`A-*` 指最新人工回答。
- 原始文本材料保存 SHA-256；模型或报告不能冒充独立业务来源。二进制材料应先提供可核对的脱敏文本及原始定位。
- `explicit/inferred/unknown` 表示候选依据，不是模型批准状态；未知/已被更正的回答不能支撑明确事实。
- 候选和发现记录不是第二份正式模型，未确认候选不能声明绑定正式模型 ID。
- 原始材料变化必须重新发现；只在显式追加 source 版本时捕获该材料摘要，依赖解释绑定该版本，更正来源后需显式更正相关解释。追加无关 note 不会刷新旧材料摘要；INPUT 改变需重新初始化。相关摘要纳入 Gate 和下游测试契约。

完整 FM 候选可以用 `evidence_check_model_draft` 在临时目录运行既有 Schema/CEL、lineage、适用单据模拟与编译。无论成功失败都不替换正式 FM、不创建 Gate；只保留候选文件摘要和实际检查结果。草稿文件内容由 Agent 随当前候选重新提交，日志只追加检查摘要和实际结果，不保存整套草稿 YAML。后续追加发现使当前草稿结果失效，历史检查记录仍然保留。

#### 问答主界面：履约请求与确认凭证

参考课程第 15、16 讲，TUI 问题选择和回答编辑器使用分区卡片展示当前“请求 → 确认凭证”候选结构，工具结果只保留简短保存提示，不再重复展示。F2 仅查看当前候选详细说明、来源及前序触发依据；完整履约树和其他责任通过 `/evidence-status` 查看。RPC 的普通选择／编辑对话及非交互模式仍保留原有文本上下文和问题，不要求这些客户端支持 TUI 卡片。无合同时显示已保存的业务范围，不补造合同或铺满合同空字段。不再提供底部固定面板或 Evidence 状态栏，避免与对话重复展示；`/reload` 会清除旧版残留显示，不改动运行数据。当前问题的首层操作为“回答／更新模型／结束本轮”，历史问题选择留在高级入口。工程状态与详细来源也可用 `/evidence-status` 查看。

**名称不是分析段落。** 每个候选新增必填短名称 `label`（1–40字符、单行、无首尾空白）；`description` 保留完整业务说明、已明确事实、推断理由和剩余缺口。标题、双方角色和请求箭头只使用 label，例如“平台 → 读者”，不把角色职责重复放到箭头两端。候选状态由界面添加，不写进 label。请求／确认各用简短业务说明，详细论证留在 description／notes；局部未知不代表整个义务都未知。

卡片中请求、期限与确认说明超过100字符会标省略并提示 `/evidence-status` 查看完整原文，问题正文保持完整。当前合同全部候选描述、来源与完整请求／确认文本均可在状态详情查看，发现原文不受展示截短影响。

记录中的候选必须携带 label，不能只写 description。名称更正同样追加新记录并引用前次 D-ID，不改写旧解释；不提供旧快照兼容或迁移。

示例（不是当前项目事实）：

```text
业务建模 · 等待回答
── 合同上下文 ──
作者合作协议
双方角色：平台 ↔ 作者

── 当前履约项（候选结构） ──
支付分成
履约请求：作者 → 平台（权利方 → 义务方）
要求／依据：合作协议、结算单
履约期限：以本次付款请求的截止时间（expired_at）为准
履约确认凭证：待明确

── 当前问题 · Q-001 ──
什么凭证证明分成已支付？

F2 详情 · Ctrl+↑↓ 滚动上下文
── 操作 ──
> 回答
  更新模型（纳入已积累的发现）
  结束本轮问答，整理已有信息
```

请求端的箭头表示权利方向义务方提出履约要求，不是资金流向，也不是聊天问答。确认端说明谁提供或形成什么凭证、证明什么结果，不默认是人工审批；可以由其他合同上下文产生的凭证承担，不据此为当前合同增加第三个角色。只有凭证名称而无提供方时保留原文，不自动补造确认人。同一方在不同履约项中可以互换权责；`▶` 标出当前项，`↳` 表示异常触发的新责任。只有材料支持才添加异常履约，没有异常记录不表示没有责任。视图表达发现中的结构，不表示业务已完成履约或模型已批准。

派生的 `content.contractView` 是发现候选的关系投影，不是另一份正式 FM，也不由 Agent 每轮全量提交：

- `contracts`：合同 `contextRef`、两个角色位置 `roleRefs`、来源 `sourceRefs`、履约清单 `fulfillments`，均引用现有候选 C-ID。未知角色位置为 null，不补造双方身份。
- 每项履约：`candidateRef`、`rightHolderRef`、`obligorRef`、`request`（谁向谁提出什么要求及依据，有来源才写代表／经办人）、`deadline`（期限依据）、`confirmation`（谁提供或形成什么凭证、证明什么结果）、`sourceRefs`。权责方来自同一合同且不同；全未知的角色或依据为 null，部分已知只记录有依据的部分并标明剩余待明确。不解析旧文本猜测确认人；每项通过独立 fulfillment 记录追加或更正。
- 异常分支：`parentFulfillmentRef` 和 `trigger` 必须同时填写，前序在同一合同且无循环；主要履约两者均为 null。
- `current`：`{contractRef, fulfillmentRef}`；未选具体履约时 fulfillmentRef 为 null，未定位合同时整个 current 为 null。
- 问题必填 `target`，采用同样的合同／履约引用或 null。选择问题时以其 target 为准，不误用上一次保存的合同位置。

没有合同依据时 contracts 为空，显示待明确，不为纯领域或签约前讨论补造合同。候选标注保留；引用或回答依据失效时不展示旧关系，快照损坏时显示“合同视图不可用”。position 记录仅设置 focus 与 current，不新增业务阶段，不做旧数据兼容或迁移。

RPC／非交互模式的简要文本视图最多展示五个履约项并保留当前项；TUI 不重复输出这份文本，完整关系及前序触发条件按需 `/evidence-status` 查看。原始证据不变。整理输入和人工结束状态通过消息或问答操作展示；所有阶段均不再创建固定状态面板。

### 3.4 案例回放与定稿

正常、边界、异常/追责案例分别记录输入情节、预期、来源与 gap。不适用也要提供具体理由。预期须来自业务材料或回答，不能从实现倒推，更不能为了让模拟通过而削弱预期。

单据回放检查：在当时可见的凭证下，Role 能否发起请求、确认结果、解释争议。验证场景固定 `asOf`。纯领域则回放对象规则，并把操作/状态机验证交给后续 Q1/Q2；现有模拟器只实例化 Evidence，不实例化 Thing/Party。

`evidence_finalize_discovery` 仅在人工请求更新模型后执行。Agent 提交全历史 assessment，扩展检查范围、来源新鲜度、候选与回放，并按实际阻塞影响及必要依赖计算可纳入部分。这不是人工批准，也不能证明所有问题都已被发现。关键缺口阻塞实际依赖它的单元，不自动全局阻塞。

正式工件顺序：

1. `artifacts/02-modeling/ubiquitous-language.md`：从发现中形成术语、示例、非例及歧义。
2. `artifacts/02-modeling/fm-model/`：统一 FM v3。
3. `artifacts/01-requirements/personas.md`：实际用户/角色与软件需求。
4. `artifacts/01-requirements/problem-statement.md`：问题、软件职责、MVP 与排除项。
5. `artifacts/01-requirements/story-map.md`：稳定 US/AC、Given/When/Then、示例及 acceptance-catalog JSON。

`01-requirements` 是需求投影的存储目录，不代表前置阶段。画像、Epic、故事不再按固定数量补造。业务模型包含的线下、第三方和人工活动不自动成为本系统待开发功能。

Markdown 用 `evidence_submit_artifact`，FM 用 `evidence_submit_fm_model`。手动更新批次只执行前两项，然后停回发现；人工选择 converge 才执行后三项。需求全部完成后重新检查，统一进入 Modeling Gate。`autoContinueArtifacts` 不跨越模型更新与需求收敛的人工选择，也不自动回答业务问题或跳过审核。

定稿途中发现冲突，可用发现工具重开循环，旧定稿失效，从统一语言重新提交。术语和模型在发现中共同迭代；正式 FM 不依赖后生成的用户故事，不产生循环依赖。

### 3.5 FM 格式和证据边界

FM 源文件包括 model.yaml、说明、entities、按需 fulfillments/relationships/rules/business-patterns，以及可选 discovery 摘要与 validation 实例/场景。只接受白名单路径、单文档 YAML、稳定 ID；Agent 不提交 generated、02-business-patterns.md 或 status.md。工具校验成功后原子替换并派生结果。

- Domain Context 可独立建模；Party 在 Context 外，Place/Thing 属于 Domain Context。
- 履约位于父 Contract 的子 Fulfillment Context；合同双方 Role 留在父上下文。
- Request interval 使用 required、keyData timestamp；类型属性可为非派生输入，无固定时长不等于无截止时间。实例须提供确定时间值，不用 openEndedReason，也不强制生成公式。
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
| /evidence-answer [Q-ID]          | 回答、更正、跳过或结束本轮问答           |
| /evidence-discovery update-model | 手动将积累的发现更新进模型，成功后停止   |
| /evidence-discovery converge     | 基于最近成功更新的模型进入需求收敛       |
| /evidence-discovery finish       | 停止自动提问，仅整理发现，不更新模型     |
| /evidence-discovery resume       | 恢复问答，重新处理未答与暂缓问题         |
| /evidence-next                   | 按状态继续、回答或审核                   |
| /evidence-status                 | 当前阶段、发现版本、进度、报告、Gate     |
| /evidence-check                  | 定稿完成后重检，不能跳过发现或缺失工件   |
| /evidence-review                 | 人工 Gate                                |
| /evidence-revise [反馈]          | 修订当前阶段；Modeling 重开发现          |
| /evidence-back                   | 回退一个阶段；保留文件但使相应旧决定失效 |
| /evidence-pause /evidence-resume | 暂停/恢复阶段工具约束                    |
| /evidence-reset                  | 重置状态，可明确选择清理工件             |

`.evidence`、artifacts、reports 由扩展拥有。不得手改状态、绕过提交工具写工件，或让产品任务修改扩展/Skills。显式插件维护可以改扩展实现，但不能顺手改活动运行、Gate 或报告。

发现期间保存后停止是合法检查点；`/evidence-run` 可继续。状态界面在定稿前显示“业务上下文识别与发现”，不显示未来的统一语言工件。恢复提示携带当前焦点、未回答问题及仍未知的阻塞项，按最新回答承接候选和回放缺口，不重启范围问卷。正式文档任务未提交就结束，恢复 ready 并提示重新执行。工具限制不是安全沙箱，项目脚本及本地扩展需要信任。

本次发现仅支持追加日志 v5、Context assessment v1 与事实 coverage v1，状态仍为 v6、FM 仍为 v3。无旧协议兼容、转换、迁移或自动重置；升级不改已有运行、Gate 或已批准模型，旧运行由人工决定如何处理。

## 7. 扩展验证

```bash
npm run evidence:verify
npm test
npm run lint
npm run build
```

扩展验证包含类型、Vitest、格式及隔离 FM Python 测试，不调用语言模型。回归覆盖问答等待/恢复、部分回答、无文本暂缓、人工结束/恢复、阻塞保护、取消、更正、来源/快照篡改、草稿隔离、共同 Gate、Schema/lineage/适用模拟和下游测试契约。这些是合成自动化证据，不是具名业务验收或真实 TUI/Agent 生成质量评测。发现引导另有 `tests/skills/pi-discovery/evals.json` 及操作说明，覆盖合同、领域、混合、渠道、低信息、已有明确材料、绩效及简单胶水；需实际运行 Agent 并由人工评价，不能把提示词字符串测试当成交互质量通过。
