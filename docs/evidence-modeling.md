# Evidence Modeling 使用指南

从 [项目宪法](../AGENTS.md)和 [Guides](guides/index.md)确定本次权限，再选择入口。建模只使用 Skill；Skills 提供专业方法与执行协议，普通对话是完整交互路径。

## 选择入口

| 目标                         | 入口                                                                     | 本轮结果                                   |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| 解释履约建模方法或术语       | [FM](../.agents/skills/evidence-fm/SKILL.md) 的讨论分支                  | 方法解释、依据与未知                       |
| 记录建模过程或合同级交接     | [Handoff](../.agents/skills/evidence-handoff/SKILL.md)                   | Markdown 进展交接及下一轮建议              |
| 访谈、继续澄清、更正或停止   | [Discovery](../.agents/skills/evidence-discovery/SKILL.md)               | 共同理解、当前节点的独立问题组及获授权术语 |
| 生成、修改或校验 FM 与 API   | [FM](../.agents/skills/evidence-fm/SKILL.md)                             | 模型与整体 API；仅 FM 限制优先             |
| 从整体 FM 设计 API           | [FM 的 API 阶段](../.agents/skills/evidence-fm/references/api-design.md) | API 设计、HTTP 契约及派生产物              |
| 生成或检查离线工作台         | [Visualization](../.agents/skills/evidence-visualization/SKILL.md)       | 审核页面或检查结果                         |
| 一次完成模型、API 与联合审核 | [Modeling](../.agents/skills/evidence-modeling/SKILL.md)                 | FM → 整体 API → 联合审核                   |

```text
/skill:evidence-modeling 访谈并沉淀领域语言
/skill:evidence-handoff 下一轮继续运输签收证明，采购期限仍暂缓
/skill:evidence-modeling 核对准入后修改模型与 API，生成联合审核页
/skill:evidence-modeling 只修改 FM，不设计 API，不生成页面
/skill:evidence-modeling 只校验当前 FM 与 API，不写任何项目文件
/skill:evidence-modeling 生成联合审核页，不修改设计源
```

其他宿主使用各自 Skill 入口或显式读取 SKILL.md。显式一体生成默认授权两源与联合审核，更窄要求优先。

## 上下文总览与当前进度

先理解合约与经营目的，依据材料识别合同、领域、合同前协商的初步上下文及关联，让用户选择分析焦点。混合总览列出有充分依据的名称、类型、目的、边界、关联与结束状态；不把合约章节直接当成上下文。领域项说明对象和规则，协商项说明方案及拟形成的约定，不强加现金或 KPI，也不因领域归类删除合同责任。

合同项只列经营依据与独立边界充分的合同，包含名称、经营主线、具体目的、双方、责任边界与结束状态。主线为现金权责或目标与实际，现金方向注明观察主体；用谁与谁签订什么合同、实现什么经营目的表达。用户选择决定焦点：合同承接已有双方和全部主履约，领域优先承接已有方案与业务连接点，必要时才深入对象／规则，协商承接邀请／方案／回应。

总览在首次识别及用户要求查看／切换时展示。已澄清结束项仅供查看；取消保留原焦点，停止状态由明确继续意图解除。结束确认按类型覆盖当前完整范围与未决项；单合同结束、领域／协商分支结束与全局结束分别核对。总览不展示“待追溯”一栏；未决问题仍保留，进入焦点后再澄清。总览和日常问答不展示资料标题、文件名、路径、页码、链接或来源 ID，不附出处或参考资料段；内部依据与获授权交接中的产物引用仍保留，业务凭证的证明作用仍需说明。导航不与澄清问题混问；有效焦点直接恢复，不重复总览。

单点澄清每轮显示当前位置、一段简短追溯故事和当前节点内的一组独立必要问题，各题分别编号。前置依据未明确、题间存在依赖或独立性不明时先问前提；用户要求一次一问时遵守。履约位置是 `合同名称 → 履约项名称 → 请求或确认`，凭证使用中文（英文）业务名称，类型作辅助标签；位置紧接责任角色及已明确实际主体，不从经办人或证明提供方推断责任。请求与确认本身就是凭证。先画请求—确认骨架，再沿当前信息追溯依据。故事说明已追到什么业务依据、能证明什么、接下来追向哪里，展示专注于当前节点。协商与领域使用各自上下文与对象；必要未知才问，已知则复用或推导。

一个业务焦点下可以开展多凭证并行追溯，同一凭证也可有多条关键数据来源链。各链深度优先深入依据，再回溯上层判断；共同依据只追一次，独立前沿成组，依赖问题先处理前提，不机械逐字段问到底，也不先扫完所有凭证再深入。主焦点保持不变，各活跃凭证分别说明当前位置、关键数据与责任人；一条链暂缓不封锁其他获准继续的独立链。首次进入或目标变化时可用用户故事说明已知业务目的，每轮的凭证依据说明仍讲清各数据的证明边界。来源查清不表示履约完成，用户故事验收不等于 FM 履约确认。描述不附资料出处，内部业务依据引用仍按权限保留。

收到回答后吸收全部事实并重算依赖，不预排整份问卷。部分回答立即承接已答项，未答不默认同意，不知道保持未决；逐项暂缓保留原标识，整轮停止或取消后等待。合同导航、单合同结束确认和全局结束确认各自单独一轮，不与业务问题组混问。问题组回答完毕不表示全部追责结束或授权生成。

问答、控制与承接由 [访谈协议](../.agents/skills/evidence-discovery/references/interview.md) 唯一维护；[成组一轮](../.agents/skills/evidence-discovery/examples/grouped-turn.md)及[多来源一轮](../.agents/skills/evidence-discovery/examples/parallel-turn.md)、[多凭证一轮](../.agents/skills/evidence-discovery/examples/multi-evidence-turn.md)给出合成样例。表达质量评测核对问题独立性、故事事实忠实性、单点聚焦，以及来源文章、全局进度或准入提醒是否干扰当前展示。

领域按“识别边界 → 优先复用成熟方案 → 澄清业务连接点 → 必要时深入”推进，不默认重建通用能力；成熟方案不能替合同决定权益或责任。能力抽象用 `role/domain`，既有系统边界用 `role/third_party`（图示 `3rd-system`），不按公司内外或部署分类；确需展开内部且获授权时才建 `context/domain`。角色不是完成证明，关系遵守 FM 语义。领域及协商按各自方法问答，不强套履约凭证格式。分支结束按本次复用连接范围或获授权深入范围，单独展示规则／方案、关联责任及实际正常和反例核对，等待人类确认本分支澄清结束，并确认本范围没有适用履约责任、无需继续追责。必要缺口仍阻塞；不将未闭合合同改名为领域来绕过准入。完整交互与样例见 [访谈协议](../.agents/skills/evidence-discovery/references/interview.md)及 [混合上下文样例](../.agents/skills/evidence-discovery/examples/mixed-contexts.md)。

## 方法与承接

首次进入或必要上下文丢失时，定位提供的目标、材料、当前理解、原问题及控制意图，加载当前分支必要方法。连续问答吸收全部新增输入，增量核对当前节点及受影响依赖；已加载且未变化的方法复用。切换、更正与结束核对按影响扩大范围。

| 当前判断                           | 方法来源                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 经营依据、合同边界、骨架及依赖     | [业务分析](../.agents/skills/evidence-fm/references/business-analysis.md)                                                    |
| 领域复用、业务连接点及必要内部规则 | [领域建模](../.agents/skills/evidence-fm/references/domain-modeling.md)                                                      |
| 关键数据、计算与业务时间依据       | [业务追溯](../.agents/skills/evidence-fm/references/provenance.md)                                                           |
| 术语理解、日常表达及定义归属       | [领域语言](../.agents/skills/evidence-fm/references/domain-language.md)                                                      |
| 合同级准入、责任终点与全局明确确认 | [追责结束准入](../.agents/skills/evidence-fm/references/responsibility-closure.md)                                           |
| 正式对象、引用与时间语义           | [FM 语义](../.agents/skills/evidence-fm/references/semantics.md)、[格式](../.agents/skills/evidence-fm/references/format.md) |
| 问答、控制与跨会话承接             | [访谈协议](../.agents/skills/evidence-discovery/references/interview.md)                                                     |
| 阶段接续及产物恢复                 | [文件交接](../.agents/skills/evidence-modeling/references/workflow.md)                                                       |

行为基线按当前动作加载：[Discovery](../.agents/skills/evidence-discovery/examples/README.md)、[Modeling](../.agents/skills/evidence-modeling/examples/README.md)、[FM](../.agents/skills/evidence-fm/examples/README.md)。样例是维护参考，实际业务判断使用本轮材料与用户决定。

## 正式编辑与产物

正式编辑先核对**合同级准入**：当前合同全部主履约、各层异常、人类终点、必要外部证明、完整责任图与实际推演均查清，且有人类明确结束确认及编辑授权。相关未澄清合同以 Context Role 表达外部边界，不补造其内部履约，也不能用角色隐藏当前合同必要缺口；没有关联的合同只保留在交接中。

本范围全部合同闭合后，单独取得**人类明确确认全部追责结束**，核对跨合同关联与整体推演；不要求已闭合独立合同等待此全局确认。完整责任判断由 FM 方法逐项复核；直接调用 FM、外部材料或已有模型均不绕过追责结束门槛。停止、暂缓、合同级结束与全局结束分别判断，结束确认与编辑授权分别核对。

| 默认路径                                        | 用途                                   |
| ----------------------------------------------- | -------------------------------------- |
| `.evidence/handoffs/<主题>.md`                  | 显式请求或合同级自动保存的建模过程交接 |
| `.evidence/glossary.json`                       | 唯一词汇入口，定义或正式对象引用       |
| `.evidence/fm/`                                 | 正式 JSON、说明、validation 与生成物   |
| `.evidence/api/api.json`                        | API 设计源                             |
| `.evidence/api/generated/`                      | API 投影、OpenAPI、样例与流程          |
| `.evidence/views/index.html`                    | 当前源的只读工作台                     |
| `.evidence/checks/fm/`、`.evidence/checks/api/` | 获授权紧凑检查记录                     |

访谈形成共同理解，明确术语按权限当轮沉淀。词汇表中 standalone 的 `name` 维护完整双语名称与未建模定义，model 引用当前 FM 的 `label` 与定义，落实为模型后保留 term ID。中文、英文及别名用于同一入口检索，不另存英文词典，也不因显示名更正自动迁移 FM/API。术语写入失败时说明真实结果并停止，恢复时核对实际条目。

单合同澄清结束并经人类确认后，建模入口默认调用正式建模 Skill，相关未澄清合同使用 Context Role，随后调用 `evidence-handoff` 保存未澄清部分及恢复位置。独立领域／协商在对应分支准入与结束确认有效后，也按入口授权接续正式建模及未澄清上下文的 Handoff，不要求无关合同先结束，不把领域边界一律表达成 Context Role。只读、仅访谈、不生成或不保存交接等明确限制优先；普通回答不触发生成。合同级自动接续的资源、失败及恢复规则由 [文件交接](../.agents/skills/evidence-modeling/references/workflow.md) 唯一维护；保存成功后停止，不自动切换合同。

完整生成依次执行 FM、整体 API 与联合审核；API 消费同一次有效 FM 检查并核对摘要，保留自身校验。联合页在独立页面运行中核对两源并完成浏览器检查。各阶段保存与检查分别交接，部分成功与完整交付分别报告。只读、仅 FM、仅页面等限定按本轮授权执行。

## 维护验证

```bash
npm run skills:verify
npm run guides:verify
npm test
npm run lint
npm run build
```

覆盖与环境限制见 [测试指南](engineering/testing.md)。真实多轮评测见 [建模评测协议](../.agents/skills/evidence-modeling/evals/README.md)，实际执行与未执行分别报告。
