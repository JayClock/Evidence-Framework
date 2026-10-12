# Evidence Modeling 使用指南

从 [项目宪法](../AGENTS.md)和 [Guides](guides/index.md)确定本次权限，再选择入口。建模只使用 Skill；Skills 提供专业方法与执行协议，普通对话是完整交互路径。

## 选择入口

| 目标                         | 入口                                                                     | 本轮结果                                   |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| 解释履约建模方法或术语       | [FM](../.agents/skills/evidence-fm/SKILL.md) 的讨论分支                  | 方法解释、依据与未知                       |
| 手动记录建模过程或会话交接   | [Handoff](../.agents/skills/evidence-handoff/SKILL.md)                   | Markdown 进展交接及下一轮建议              |
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

## 合同总览与当前进度

依据材料直接识别合同上下文，让用户选择分析焦点。总览只列经营依据与独立边界充分的合同，包含名称、经营主线、具体目的、双方、责任边界、待追溯事项与结束状态。主线为现金权责或目标与实际，现金方向注明观察主体；用谁与谁签订什么合同、实现什么经营目的表达。用户选择决定焦点，承接已有双方和全部主履约。

总览在首次识别及用户要求查看／切换时展示。已澄清结束项仅供查看；取消保留原焦点，停止状态由明确继续意图解除。结束确认须覆盖当前合同责任与未决项，单合同结束与全局结束分别核对。

单点澄清每轮显示当前位置、一段简短追溯故事和当前节点内的一组独立必要问题，各题分别编号。前置依据未明确、题间存在依赖或独立性不明时先问前提；用户要求一次一问时遵守。履约位置是 `合同名称 → 履约项名称 → 请求或确认`，凭证使用业务名称，类型作辅助标签；请求与确认本身就是凭证。先画请求—确认骨架，再沿当前信息追溯依据。故事说明已追到什么业务依据、能证明什么、接下来追向哪里，展示专注于当前节点。协商与领域使用各自上下文与对象；必要未知才问，已知则复用或推导。

收到回答后吸收全部事实并重算依赖，不预排整份问卷。部分回答立即承接已答项，未答不默认同意，不知道保持未决；逐项暂缓保留原标识，整轮停止或取消后等待。合同导航和全局结束确认各自单独一轮，不与业务问题组混问。问题组回答完毕不表示全部追责结束或授权生成。

问答、控制与承接由 [访谈协议](../.agents/skills/evidence-discovery/references/interview.md) 唯一维护；[成组一轮](../.agents/skills/evidence-discovery/examples/grouped-turn.md)给出合成样例。表达质量评测核对问题独立性、故事事实忠实性、单点聚焦，以及来源文章、全局进度或准入提醒是否干扰当前展示。

## 方法与承接

首次进入或必要上下文丢失时，定位提供的目标、材料、当前理解、原问题及控制意图，加载当前分支必要方法。连续问答吸收全部新增输入，增量核对当前节点及受影响依赖；已加载且未变化的方法复用。切换、更正与结束核对按影响扩大范围。

| 当前判断                       | 方法来源                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 经营依据、合同边界、骨架及依赖 | [业务分析](../.agents/skills/evidence-fm/references/business-analysis.md)                                                    |
| 关键数据、计算与业务时间依据   | [业务追溯](../.agents/skills/evidence-fm/references/provenance.md)                                                           |
| 术语理解、日常表达及定义归属   | [领域语言](../.agents/skills/evidence-fm/references/domain-language.md)                                                      |
| 责任终点与全局明确确认         | [追责结束准入](../.agents/skills/evidence-fm/references/responsibility-closure.md)                                           |
| 正式对象、引用与时间语义       | [FM 语义](../.agents/skills/evidence-fm/references/semantics.md)、[格式](../.agents/skills/evidence-fm/references/format.md) |
| 问答、控制与跨会话承接         | [访谈协议](../.agents/skills/evidence-discovery/references/interview.md)                                                     |
| 阶段接续及产物恢复             | [文件交接](../.agents/skills/evidence-modeling/references/workflow.md)                                                       |

行为基线按当前动作加载：[Discovery](../.agents/skills/evidence-discovery/examples/README.md)、[Modeling](../.agents/skills/evidence-modeling/examples/README.md)、[FM](../.agents/skills/evidence-fm/examples/README.md)。样例是维护参考，实际业务判断使用本轮材料与用户决定。

## 正式编辑与产物

正式编辑前核对**人类明确确认全部追责结束**，覆盖当前范围、全部主履约、各层异常、人类终点与实际推演。完整责任图及整体确认由 FM 方法逐项复核；直接调用 FM、外部材料或已有模型均不绕过追责结束门槛。停止、暂缓、局部终点与全局结束分别判断，结束确认与编辑授权分别核对。

| 默认路径                                        | 用途                                 |
| ----------------------------------------------- | ------------------------------------ |
| `.evidence/handoffs/<主题>.md`                  | 显式请求时保存的建模过程交接         |
| `.evidence/glossary.json`                       | 唯一词汇入口，定义或正式对象引用     |
| `.evidence/fm/`                                 | 正式 JSON、说明、validation 与生成物 |
| `.evidence/api/api.json`                        | API 设计源                           |
| `.evidence/api/generated/`                      | API 投影、OpenAPI、样例与流程        |
| `.evidence/views/index.html`                    | 当前源的只读工作台                   |
| `.evidence/checks/fm/`、`.evidence/checks/api/` | 获授权紧凑检查记录                   |

访谈形成共同理解，明确术语按权限当轮沉淀。词汇表中 standalone 维护未建模定义，model 引用当前 FM，落实为模型后保留 term ID。术语写入失败时说明真实结果并停止，恢复时核对实际条目。

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
