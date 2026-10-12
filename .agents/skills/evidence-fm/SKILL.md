---
name: evidence-fm
description: 当用户讨论履约建模或 API 设计方法、整理业务术语，或要求生成、修改、修复、校验正式 FM 与绑定的整体 API、生成 OpenAPI 时使用。正式 FM 编辑须有人类全部追责结束依据；不主持访谈问答，不实现业务系统。
compatibility: 方法讨论只需文本；文件维护需读写能力；校验需 Python 3.10+ 和本包 requirements.txt。
---

# Evidence 业务建模与 API

业务分析、领域语言、正式 FM 与整体 API 由本包维护。Discovery 消费方法并管理问答；本包消费来源并维护正式表达，不接管访谈状态。FM 与 API 绑定在同一生成流程中，业务事实与技术契约仍分别保存。

## Guides

先确定本次是讨论、术语沉淀、正式编辑、API 设计／投影还是只读校验。读取项目权限、实际来源、已有文件与 Git 差异；只修改本次授权的文件，保留无关改动，不自动迁移。只聊不落盘不写文件；只校验不修复、不保存项目报告。

| 当前动作                             | 必要参考                                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 解释经营依据、责任边界或分析业务材料 | [业务分析](references/business-analysis.md)；存在矛盾或不足时读 [输入复核](references/input-review.md)                                                                      |
| 当轮沉淀术语或将术语落实为模型       | [领域语言](references/domain-language.md)                                                                                                                                   |
| 生成、修改、修复模型、规则或验证场景 | 先读 [追责结束准入](references/responsibility-closure.md)，再读 [批次评估](references/batch-assessment.md)、[语义](references/semantics.md) 与 [格式](references/format.md) |
| 表达关键数据、业务时间或计算规则     | [来源追溯](references/provenance.md)、[CEL](references/cel-rules.md)                                                                                                        |
| 编写或审查验证场景                   | [场景边界](references/scenario-validation.md)、[实例执行](references/traceability-and-simulation.md)                                                                        |
| 执行 FM 检查或生成派生产物           | [FM 校验命令与结果](references/validation.md)                                                                                                                               |
| 设计、修改或投影整体 API             | [API 阶段](references/api-design.md)，按分支加载设计方法、格式、HTTP 契约与校验纪律                                                                                         |
| 只校验 API                           | FM 校验参考及 [API 校验纪律](references/api-validation.md)，不编辑两源或生成交付                                                                                            |

只加载本次动作所需内容；领域能力、业务模式等专项从 [规则索引](references/README.md) 选择。tests/、evals/ 只用于维护评测，不是项目业务来源。

默认正式源为 `.evidence/fm/`，词汇表为其外的 `.evidence/glossary.json`；API 唯一源为 `.evidence/api/api.json`，默认交付 `.evidence/api/generated/`。获授权检查记录分别放在 `.evidence/checks/fm/` 和 `.evidence/checks/api/`。沿用已有指定位置，项目输出不写入 Skill 安装目录。

正式生成／修改默认包含绑定的 API 设计、校验和投影，无需另行触发；明确“只修改 FM”“不要 API”等更窄要求优先。API-only 请求不授权改 FM；仅讨论、术语沉淀和只读校验不自动生成 API。单独调用不自动生成页面；另行要求审核页时定位并读取 `evidence-visualization`。

## Action

- **讨论**：按专业参考解释判断、来源与未知；不保存，不自动开始访谈。
- **术语沉淀**：按领域语言方法维护明确术语；访谈来源先由 Discovery 保存。未建模定义使用 standalone，已建模概念只引用 FM；更正影响留在来源记录，不用同义条目覆盖模型含义。术语写入不授权模型 JSON 编辑。
- **只读校验**：直接进入 Sensors，不要求先通过编辑准入，不因发现错误转为修复；明确仅 FM 时不查 API。
- **仅 API 设计／交付**：先取得当前 FM 的有效检查结果，再按 API 阶段完成获授权动作，FM 保持只读。
- **正式编辑**：执行以下步骤。

1. **核对追责结束门槛**：定位人类确认范围、完整责任图、全部分支终点及全局结束原话，核对当前来源版本和本次编辑授权。任何必要依据未闭合即停止；独立调用、外部材料、已有模型及纯领域范围均按准入方法判断。编辑授权不是业务批准。
2. **评估映射**：按批次评估复核业务分析，将已确认依据映射到对象、属性、关系、规则与场景；说明本次增改撤回、稳定 ID 和表达限制，不用实现切片缩小责任范围。
3. **直接编辑当前模型**：按语义与格式维护源文件及说明，删除仅限授权对象并清理失效引用。涉及时间、关键值、规则或场景时加载对应参考；不以模板默认值填补业务未知。落实术语保留 term ID 并改为 FM 引用，定义归目标唯一维护。
4. **核对差异**：区分已有改动与本轮变更，包含未跟踪新文件；检查支撑引用闭合和源事实忠实性，不手改 generated 产物。
5. **检查后自动接续 API**：适用的词汇及 FM 检查通过后，以该次结果接续整体 API 设计、API 自身校验和投影。API 阶段不重复执行 FM 检查或模拟；明确仅 FM 时在 FM 检查后交接。

表达方式可选择，来源、准入、Schema 和证据边界不可放宽。校验器表达不了的业务保留限制，不制造假凭证或修改业务预期。

## Sensors

设置实际绝对路径及已满足依赖的 Python；执行前读取校验参考。模型编辑后运行两项检查，单独术语任务只运行适用的词汇检查：

```bash
"$PYTHON" -B "$FM_SKILL_DIR/scripts/check_glossary.py" "$GLOSSARY_FILE" --fm "$FM_ROOT"
"$PYTHON" -B "$FM_SKILL_DIR/scripts/check_fm.py" "$FM_ROOT" > "$FM_CHECK_FILE"
```

`FM_CHECK_FILE` 是模型目录之外的临时 JSON 结果路径，不是新业务记录或持久状态；只读请求使用项目之外的临时目录。先核对退出码与内容，失败不接续。检查结果已取得且适用于当前输入时直接交接，不为 API 再跑一次。模型、场景或校验器变化后返回 FM 阶段重新检查。

分别报告定义归属／引用、Schema、CEL、lineage、simulation、timeline 的实际结果。`modelDigest` 绑定本次输入；`inputChanged` 为 true 时结果无效。未实际执行场景时 `simulationPassed` 为 null，不把字段齐全或机器通过当作业务批准。

API 的 `inspect` 是可选只读索引，不是第二次 FM 准入；API `check/project` 只消费 `--fm-check` 并核对源摘要，保留整体对象／场景覆盖、HTTP 契约和消费者接续检查。命令与结果由 API 阶段参考维护；`runtimeValidated` 恒为 false。

正式编辑的退出证据是：来源到模型的映射、实际增改删、当前 FM 检查、获授权的 API 交付及未覆盖能力都能定位。获授权留存时按校验参考保存紧凑运行清单；只校验不写任何项目文件。

## Steer

- 表达错误：仅在本次编辑授权内修正并复验，不倒改业务预期；API 技术错误只改技术契约，不反向修改 FM。
- 新责任、来源冲突、身份／权限／数量缺口或确认失效：停止受影响阶段，交接具体对象和缺口；不自行提问，也不解除访谈停止／暂缓状态。
- 环境或保存失败：保留真实错误及已改文件，不自动安装依赖、不自动回滚；分别说明已保存、未通过和未执行。
- FM 摘要失配：返回 FM 阶段重新检查，不在 API 内隐式重跑。API 阻塞不撤销已保存 FM，也不宣称完整交付。
- 完成：交接文件、差异、来源定位、实际检查和未决项后停止。来自 `evidence-modeling` 时交回入口接续获授权联合审核；独立调用不自动生成页面或需求、进入实施、批准或操作 Git。
