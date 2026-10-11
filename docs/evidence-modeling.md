# Evidence Modeling 使用指南

Evidence Modeling 由可移植 Skills、项目文件和独立校验 CLI 组成，可选交互扩展只提供入口与问答。从 [项目宪法](../AGENTS.md)和 [Guides](guides/index.md)进入，按本次意图加载来源。生成／修改分支一次触发 FM、整体 API 与联合审核页，不授权下游需求、规划或实施。

## 入口与权限

```text
/skill:evidence-modeling <目标>
/evidence-model <目标>
```

无参数菜单为“访谈并沉淀领域语言／生成或修改模型与 API／只校验模型与 API／生成联合审核页／返回”；方法讨论可直接在目标中说明。

| 意图                 | 实际动作及权限                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| 讨论方法／只聊不落盘 | 解释合同、骨架与凭证，不保存、不自动访谈                                                          |
| 访谈并沉淀领域语言   | 保存原话和发现结构，当轮维护 `.evidence/glossary.json`；不写正式模型 JSON、规则、场景、API 或实现 |
| 生成／修改模型与 API | 先核对全局追责结束依据与授权，再依次维护、校验 FM 与整体 API，生成同页联合审核                    |
| 只校验模型与 API     | 只读报告；不写发现记录、词汇表、两源、交付或审核页；明确只查 FM 时仅检查 FM                       |
| 停止／暂缓／仅补资料 | 按更窄授权处理新增输入后停止，不自动恢复问答                                                      |
| 生成联合审核页       | 从当前 FM 与 API 重新校验后生成同一只读页面，不编辑设计源；缺 API 不降级                          |

本入口生成／修改模型默认包含整体 API 设计和联合审核页，无需再次触发。明确“只修改 FM”“不要设计 API”“不生成审核页”等更窄限制优先；独立 FM 调用保持自身权限。访谈、普通回答、追责结束确认及只读请求不触发生成。

编辑授权不是业务批准。直接调用 FM、已有模型或外部材料不绕过追责结束门槛；缺口只交接，不自动进入访谈。

## 专业分工与分析依赖

方法唯一由 FM 的 [业务分析](../.agents/skills/evidence-fm/references/business-analysis.md) 维护；Discovery 只负责交互、记录和恢复，Modeling 只负责分支与交接。

```text
经营目标与真实材料 → 合同与双方 → 全部主履约清单
                                      ↓ 当前履约
                            请求—确认骨架 → 凭证及关键数据追溯
                                      ↓
                            异常新义务 → 重复骨架与追溯
                                      ↓ 逐枝核对人类终点
                   单据推演 → 参与者与角色扮演 → 变化点与边界
                                      ↓ 完整责任图无未决责任
                            人类明确确认全部追责结束
                                      ↓ 本次一体生成授权
                             映射 FM → 校验 → 整体 API → 校验
                                      ↓
                             同页联合审核 → 展示差异 → 停止
```

分析不是逐字段问卷。已知主体、参数或异常立即复用，当前依赖可以提前处理；领域对象和渠道协商走各自分支，不强套合同。请求—确认骨架是工作理解，未明完成证明不抹去已知义务，也不表示证据已经充分。

合同参数、对象关联、履约义务与实际结果分开；合同不先填通用字段表。先展示全部主履约，再逐枝追溯请求依据、完成证明、关键数据、计算及业务时间。异常新义务重复同一分析，不以退款或外部接手作为自动终点。

全局门槛、终点判断及确认失效条件唯一见 [全部追责结束](../.agents/skills/evidence-fm/references/responsibility-closure.md)。可以分轮讨论，不能按局部事实充分放行；停止或暂缓不等于追责结束，机器通过也不是人类确认。

## 发现记录与正式模型分开

默认结构如下，沿用已有指定路径，不自动迁移或删除业务材料：

```text
.evidence/
├── discovery.json        # schemaVersion 2.0：来源、约定、骨架、追溯、问题与恢复点
├── questions.json        # 按需拆分的已提问题；与主记录只维护一处
├── glossary.json         # 唯一词汇入口，独立于 FM 类型
├── fm/                   # 唯一正式模型：JSON、说明、validation、generated
├── api/
│   ├── api.json          # 唯一 API 设计源
│   └── generated/        # 可重建交付文件
├── views/index.html      # FM 与 API 的联合只读审核投影
└── checks/
    ├── fm/               # 获授权的紧凑检查记录
    └── api/
```

发现记录按 Discovery 的 [模板](../.agents/skills/evidence-discovery/assets/discovery-template.json) 维护：`business.agreements` 保存约定，`business.responsibilities` 唯一保存每项请求与确认，`business.evidenceTraces` 保存其关键数据的来源分析。正常和争议单据推演、主体发现及变化点各有稳定引用；`business.responsibilityClosure` 汇总完整责任及人类依据。

`handoff.focusRef` 指向当前对象，`viewRefs` 用于生成本轮可读视图；不维护另一份“当前请求／确认”或视图事实副本。这些是有来源的工作理解，不是正式 FM。记录版本不匹配时先报告限制并停止结构写入，格式转换须单独明确授权，不自动猜测映射。

每轮先保存原话与来源，再按 [领域语言方法](../.agents/skills/evidence-fm/references/domain-language.md) 当轮沉淀明确术语。standalone 保存未建模定义，model 只引用已有 FM，名称与含义由目标唯一维护；未决解释及没有模型编辑授权的更正留在发现记录。原话与词汇两处保存不是原子事务，任一失败即停止，恢复先核对实际文件。

## 准入后的正式表达与校验

正式表达读取 [语义](../.agents/skills/evidence-fm/references/semantics.md)、[格式](../.agents/skills/evidence-fm/references/format.md) 和 [批次评估](../.agents/skills/evidence-fm/references/batch-assessment.md)，把全部有依据的约定、主履约、异常、凭证及规则映射到 FM，不直接复制发现模板。JSON 组装不是访谈顺序；合同前只保留实际存在的阶段。

Fulfillment 是合约内的权责履约结构，不是 Context；`contextRef` 表示真实上下文，`fulfillmentRef` 表示履约归属。同合约履约间直接引用凭证，跨独立上下文结果按证据角色表达；引用不自动声明先后。业务时间按真实事件展开，签约不等于生效，凭证形成不等于回调到达。

编辑前读取当前文件与已有差异，保留无关改动。落实术语保留 term ID 并替换为 FM 引用，不维护重复定义。模型、来源、场景或校验器变化后旧检查不能证明当前版本有效。

设置实际绝对路径及满足 FM requirements.txt 的 Python，运行：

```bash
"$PYTHON" "$FM_SKILL_DIR/scripts/check_glossary.py" "$PROJECT_ROOT/.evidence/glossary.json" --fm "$PROJECT_ROOT/.evidence/fm"
"$PYTHON" "$FM_SKILL_DIR/scripts/check_fm.py" "$PROJECT_ROOT/.evidence/fm"
```

按 [校验方法](../.agents/skills/evidence-fm/references/validation.md) 报告 Schema、CEL、lineage、simulation、timeline、`modelDigest` 与 `inputChanged`。未实际执行场景时 `simulationPassed` 为 null；检查期间输入变化使结果失效。失败保留真实错误与已修改文件，不倒改预期、不自动回滚或提交。

只校验不落盘；获授权检查记录只保存紧凑运行清单、摘要及日志指针，不复制完整输出。派生文件按用户请求用 FM 包的编译器和时间线工具生成，不能手改为新事实源。

## 整体 API 与联合审核

生成前确认 [FM](../.agents/skills/evidence-fm/SKILL.md)、[API Design](../.agents/skills/evidence-api-design/SKILL.md)、[Visualization](../.agents/skills/evidence-visualization/SKILL.md) 及运行依赖可用；专业步骤分别按各包执行，具体衔接见 [文件交接](../.agents/skills/evidence-modeling/references/workflow.md)。FM 本次通过后直接设计整体 API、执行 inspect/check/project；API 消费当前整体模型，不因软件切片修改业务事实，不反向改 FM 来消除接口缺口。

两源通过后使用现有 Visualization 生成器，不复制工具：

```bash
"$PYTHON" -B "$VISUAL_SKILL_DIR/scripts/generate.py" \
  --project-root "$PROJECT_ROOT" \
  --fm-skill "$FM_SKILL_DIR" \
  --api-skill "$API_SKILL_DIR" \
  --require-api
node "$VISUAL_SKILL_DIR/tests/review-browser.mjs" "$PROJECT_ROOT/.evidence/views/index.html"
```

变量设置为实际绝对路径。同一页面展示模型、规则、场景、接口、契约和消费者流程，并保留双向引用。生成器重新检查两源与输入新鲜度，缺 API、检查失败或输入变化不覆盖已有页面。只校验不调用 project 或生成器；单独要求联合审核页只写页面，不重写正式 API generated。旧页面不代表当前模型或接口已通过。

整条链路不是原子事务：后续阻塞不自动回滚已保存的 FM/API，分别交接当前差异、真实检查及未完成部分，不声称完整交付或审核获批。机器通过、页面生成与人类业务批准分开。

## 下游与开发验证

另行要求需求时由 Requirements 消费充分材料或 FM；规划消费需求、FM 与 API，交付消费唯一 plan.yaml，每次只执行一个获授权任务。联合审核后停止，不自动生成需求、规划或实施。

```bash
npm run skills:verify
npm run evidence-modeling:verify
npm run guides:verify
npm test
npm run lint
npm run build
```

检查的覆盖及环境限制见 [测试指南](engineering/testing.md)。静态文档和模板测试不证明 Agent 实际按顺序访谈；行为评测在隔离环境中另行执行，不改真实业务来源或审核状态。完成当前任务后停止。
