# Evidence Modeling 使用指南

从 [项目宪法](../AGENTS.md)和 [Guides](guides/index.md)确定本次权限，再选择一个入口。Skills 提供方法与执行协议，项目文件保存业务来源和产物；交互界面不保存业务状态。

## 选择入口

| 你要做什么                   | 入口                                                               | 本轮结果                               |
| ---------------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| 解释履约建模方法或术语       | [FM](../.agents/skills/evidence-fm/SKILL.md) 的讨论分支            | 解释、依据与未知；不落盘               |
| 访谈、继续澄清、更正或停止   | [Discovery](../.agents/skills/evidence-discovery/SKILL.md)         | 来源记录和当轮术语；最多一个必要问题   |
| 只生成、修改或校验正式 FM    | [FM](../.agents/skills/evidence-fm/SKILL.md)                       | 授权范围内的模型与实际检查             |
| 从整体 FM 设计 API           | [API Design](../.agents/skills/evidence-api-design/SKILL.md)       | api.json、完整 HTTP 契约及派生产物     |
| 生成或检查离线工作台         | [Visualization](../.agents/skills/evidence-visualization/SKILL.md) | 页面或检查结果，不改两源               |
| 一次完成模型、API 与联合审核 | 显式调用 [Modeling](../.agents/skills/evidence-modeling/SKILL.md)  | FM → 整体 API → 联合审核，阶段分别校验 |

```text
/evidence-model 访谈并沉淀领域语言
/skill:evidence-modeling 核对准入后修改模型与 API，生成联合审核页
/evidence-model 只修改 FM，不设计 API，不生成页面
/evidence-model 只校验当前 FM 与 API，不写任何项目文件
/evidence-model 生成联合审核页，不修改设计源
```

无参数菜单提供访谈、生成、只校验、联合审核页与返回。方法讨论可直接在目标中说明。独立 Skill 不自动扩展为完整链路；显式 Modeling 的生成／修改默认一次授权完整链路，更窄要求优先。

## 编辑准入与停止

正式 FM 编辑前需要**人类明确确认全部追责结束**，并核对该依据仍覆盖当前范围和版本。编辑请求不替代确认，确认本身也不授权生成；直接调用 FM、外部材料和已有模型不绕过追责结束门槛。完整规则只在 [准入方法](../.agents/skills/evidence-fm/references/responsibility-closure.md) 维护。

访谈、讨论、仅保存资料和只读校验各自保留权限，不自动开始正式生成。停止或暂缓不等于追责结束；下游返回缺口不自动恢复问答。只校验不修复、不写报告、不生成页面。

业务未知交给来源拥有者，技术表达错误在本轮授权内修正；保存失败、输入变化或环境缺失分别报告，不通过缩小业务范围或改预期取得通过。不自动回滚、批准、提交或进入需求与实施。

## 按需加载方法

不要顺序读取所有专业文档。先读所选 Skill，由其按当前动作加载：

| 当前判断                                    | 唯一方法来源                                                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 经营依据、合同边界、请求—确认骨架及分析依赖 | [业务分析](../.agents/skills/evidence-fm/references/business-analysis.md)                                                        |
| 术语定义、standalone 与 model 引用          | [领域语言](../.agents/skills/evidence-fm/references/domain-language.md)                                                          |
| 正式对象、引用与业务时间语义                | [FM 语义](../.agents/skills/evidence-fm/references/semantics.md)、[文件格式](../.agents/skills/evidence-fm/references/format.md) |
| 问答、保存顺序与跨会话恢复                  | [访谈协议](../.agents/skills/evidence-discovery/references/interview.md)                                                         |
| 阶段接续与中断恢复                          | [文件交接](../.agents/skills/evidence-modeling/references/workflow.md)                                                           |

正式语义包括履约与上下文的区别、同合同直接引用、跨上下文结果引用及变化点、消费凭证到依据的方向、实例依赖与业务时间；由 FM 方法解释，不从页面位置、类型关联或文件顺序推定实例已形成。

## 项目文件

| 默认路径                                        | 用途                                                 |
| ----------------------------------------------- | ---------------------------------------------------- |
| `.evidence/discovery.json`                      | 来源、工作理解、问题与恢复点；`schemaVersion: "2.0"` |
| `.evidence/questions.json`                      | 可选拆分的已提问题，与主记录只维护一处               |
| `.evidence/glossary.json`                       | 唯一词汇入口，定义或正式对象引用                     |
| `.evidence/fm/`                                 | 正式 JSON、说明、validation 与 generated             |
| `.evidence/api/api.json`                        | 唯一 API 设计源                                      |
| `.evidence/api/generated/`                      | 可重建 API 投影、OpenAPI、样例与流程                 |
| `.evidence/views/index.html`                    | 当前源的只读工作台快照                               |
| `.evidence/checks/fm/`、`.evidence/checks/api/` | 经授权保存的紧凑检查记录                             |

沿用已有文件或指定路径，不自动迁移。发现记录从 `handoff.focusRef` 和来源引用恢复，`business.responsibilityClosure` 引用人类终点及全局结束依据；字段由 Discovery 模板维护，不保存另一份责任图或当前请求副本。版本不符先报告，转换另需授权。

发现记录与词汇表不是原子事务：先保存原话来源，再按授权沉淀术语；任一失败即停止，恢复时分别核对实际文件。模型落实术语保留 term ID 并改为引用，名称和含义不重复定义。

## 如何判断本轮交付

- **访谈**：来源、焦点、未决项和各文件保存结果可定位；未实际推演不声称通过。
- **正式 FM**：增改删及来源映射可定位，当前词汇与模型检查有实际结果；`inputChanged` 使检查无效，未执行场景的 `simulationPassed` 为 null。
- **API**：整体覆盖、全部契约与静态消费者流程通过检查；静态结果不证明服务、授权或外部系统已运行。
- **联合审核**：当前两源重新校验后生成同一页面，并完成浏览器检查及截图复核；缺 API 不降级，旧页面不代表当前有效。

完整链路不是原子事务。FM 已保存但 API 阻塞时分别交接，不撤销已保存事实，也不宣称完整交付。具体命令从对应 Skill 读取；机器通过、页面生成和人类业务批准分开。

## 维护验证

```bash
npm run skills:verify
npm run evidence-modeling:verify
npm run guides:verify
npm test
npm run lint
npm run build
```

覆盖与环境限制见 [测试指南](engineering/testing.md)。跨 Skill 的触发与执行评测见 [建模评测协议](../.agents/skills/evidence-modeling/evals/README.md)；静态文档测试不能证明 Agent 选对分支或遵守访谈顺序，未实际执行的行为评测保持未执行。完成本轮获授权工作后停止。
