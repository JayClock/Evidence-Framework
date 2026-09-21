# 上下文倾倒：信息过多，Agent 反而迷失

## Bad Smell

上下文倾倒指的是把能找到的资料不加筛选全部塞给 Agent，以为给得越多，它了解得越充分。这个仓库里就有现成的倾倒路径：[`.evidence/fm/`](../../.evidence/fm/) 约 1.1 MB、[`api.json`](../../.evidence/api/api.json) 约 388 KB、[`plan.yaml`](../plans/smart-domain/plan.yaml) 约 280 KB，再加上 [`openwiki/`](../../openwiki/index.md) 约 504 KB 和维护范围内的全部指南文档。让 Agent“先把仓库读一遍”再动手，就是一次标准的上下文倾倒：窗口很快被填满，真正决定这次改动的约束与 CHECK 被挤到边缘。

具体表现是查找远多于实施：改一条持久化映射，却顺手把前端规范与全部架构文档一起读了进来；回答一个 API 问题，却把 21 个资源、28 个能力、20 个场景的契约全部带上。更隐蔽的后果是范围被上下文反向定义：[软件范围](../requirements/scope.md)写明“FM 中存在的所有活动”不能替代“本次软件负责什么”，但读过一遍之后，FM 里存在的活动很容易被顺手当成任务。

成因有两个：窗口有限，关键约束会被挤出或被压缩；注意力被稀释，CHECK、非目标、gap 与无关资料争的是同一份注意力。诊断信号是查找动作远多于实施动作，而且查找范围超出了本次任务的 `sourceRefs`：读到了与任务无关的内容，把 FM/API 里存在的活动当成任务，却说不出“不给它，Agent 会做错哪个决策”。

## Solution

消除这个坏味道的手法叫上下文预算。这个仓库把上下文当预算用，四种办法各管一段：筛选决定给不给，分层决定放在哪一层，按需加载决定什么时候给，压缩决定以什么形式给。落地顺序是从按需加载开始建立索引，再压缩，之后分层，最后筛选。

### 筛选：授权与范围决定“给不给”

- **任务自带允许清单**：`tasks[taskKey].sourceRefs` 只登记本次消费的 FM 单元（例如 `context.subscription`、`rule.payment-completed`），`procedureRefs` 只指向本次采用的工序、规范与范例，清单之外的内容不进入本次上下文。
- **计划消费投影而不是全文**：[API 规划投影](../plans/smart-domain/api-planning-input.yaml)只列 7 项已授权 `capabilityRefs` 和编译所需字段，权威 [api.json](../../.evidence/api/api.json) 则有 28 个能力；投影自己声明“缺席的能力属于本次授权范围之外，而不是从权威 API 删除”。
- **范围把不做的事逐条划出**：[软件范围](../requirements/scope.md)的“MVP 与非目标”列明前端业务页面、生产身份、生产数据库、真实支付协议等不由本批次新增，并声明“未定不等于永久排除”。
- **筛选不是删来源**：不进上下文的内容仍然留在仓库里。[Guides 导航](../guides/index.md)同时写明“没有读取的来源不能声称已核对”，也不允许拿没读过的来源充当依据。

### 分层：决定“放在哪一层”

| 层                 | 本项目落点                                                           | 加载时机         |
| ------------------ | -------------------------------------------------------------------- | ---------------- |
| 入口               | [AGENTS.md](../../AGENTS.md)（39 行）：权限、不变量、流程与完成底线  | 每次必读         |
| 路由               | [Guides 导航](../guides/index.md)（75 行）：只路由，不保存第二份事实 | 每次必读         |
| 项目基线与工程指南 | `docs/architecture/`、`docs/engineering/`、`docs/requirements/`      | 按改动类型选择   |
| 任务 Guides        | `tasks[taskKey]`：交付结果、来源、局部设计、文件范围、CHECK          | 执行当前任务必读 |

Skill 同样分层：`SKILL.md` 只放方法与边界，`references/` 按需读取（planning 的五份参考、delivery 的[双层循环协议](../../.agents/skills/evidence-delivery/references/lifecycle.md)），`tests/` 与 `evals/` 只在维护或明确评测时使用。双层循环本身也是分层：外层只处理任务选择、依赖与状态，内层只处理当前任务的执行质量，两层需要的上下文并不相同。

### 按需加载：决定“什么时候给”

按需加载的做法是把索引和内容分开，这也是这个仓库的默认做法：

- [Guides 导航](../guides/index.md)的“阅读路由”按工作类型（业务澄清、需求、任务规划、后端领域、持久化、API、前端、环境）列出必要前馈，入口只给路径，不复制内容。
- [范例索引](../engineering/examples.md)写明“优先引用仓库源码与测试，不复制一份容易失效的示范工程”，只给候选复用位置、配套测试与命令，执行前重新读源码，并用“适用限制”说明哪些结论不能从该范例推导。
- [测试工序](../engineering/procedures.md)规定执行者只加载当前任务采用的工序和直接前置产物；[恢复会话](../../.agents/skills/evidence-delivery/references/lifecycle.md)进一步限定为只读取该 taskKey、直接前置，以及 `sourceRefs`/`procedureRefs` 指向的真实来源与章节。
- `openwiki/` 在 [AGENTS.md](../../AGENTS.md) 受管块里被写成“optional just-in-time context, not required startup reading”：它是生成索引，按需查阅，源码与测试才是权威。

索引必须准确，写错主题就会读错资料，所以范例索引连同“适用限制”一起给出，测试指南也先给命令的覆盖范围再给结果。

### 压缩：决定“以什么形式给”

- **提炼接口契约**：不给整个模型或代码库，只给接口形态。[API 设计源](../../.evidence/api/api.json)是从 FM 提炼出的接口层，21 个资源、28 个能力、20 个场景及其关系链接都在里面；需要接口时读它就行，不必把约 1.1 MB 的 FM 读进来再自己推导接口。压缩结果仍要能对回来源：[API 规划投影](../plans/smart-domain/api-planning-input.yaml)的 `canonicalApi.sha256` 绑住 `api.json` 的字节，`api.json` 一变摘要就对不上、投影必须重算，压缩不会变成第二份事实源。
- **运行记录只留摘要**：`.evidence/checks/fm/` 与 `.evidence/checks/api/<批次>/` 保存的是紧凑清单：命令、cwd、退出码、Python 与工具版本、sha256、结果摘要与 `coverage.checked/notCovered`；[一条 FM 检查记录](../../.evidence/checks/fm/20260920T093650Z-column-subscription-model.json)的 `rawResult` 直接写“not saved; summary retained in this record”。API 批次记录同样只留 `result`（`complete`/`valid`/`interfaceCount`/`gapCount`）与 `redesign.basis`/`changes`/`converged`。
- **命令也用摘要表达**：[测试指南](../engineering/testing.md)为每条质量命令配“实际覆盖 / 不证明什么”两栏，读两行就能判断要不要深挖，不必先读完整套规范。
- **成功静默、失败完整**：成功只留一行统计，失败保留完整输出，避免失败被摘要成看不出原因的结论。
- **压缩也有两条边界**：约束与验收标准不压缩，`AGENTS.md` 的不变量、CHECK 的 `acceptanceCriteria.expected`、gap 的 `statement`/`impact`/`nextAction` 原样保留；摘要可能出错，越重要的结论越要能回到原始命令输出与源文件。
