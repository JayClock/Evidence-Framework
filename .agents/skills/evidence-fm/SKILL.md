---
name: evidence-fm
description: 当用户讨论履约建模或 API 方法、整理中文（英文）规范术语，或要求生成、修改、修复、校验 FM 与整体 API、生成 OpenAPI 时使用。维护名称与定义的单一归属及多凭证并行、各链深度优先的追溯方法；正式 FM 编辑须有人类合同级或相应范围追责结束依据，不主持访谈或实现业务系统。
compatibility: 讨论只需文本；文件维护需读写能力；校验需 Python 3.10+ 和本包 requirements.txt。
---

# Evidence 业务建模与 API

本包维护业务分析、领域语言、正式 FM 与整体 API。Discovery 管理访谈问答，本包维护专业判断与正式表达；业务事实与接口契约分别保存。

## Guides

先确定讨论、术语沉淀、正式编辑、API 设计／投影或只读校验。读取项目权限、实际来源、已有文件与 Git 差异，只修改本次授权的文件，保留无关改动，不自动迁移。只聊不落盘不写文件；只校验不修复、不保存项目报告。

| 当前动作                             | 必要参考                                                                                                                                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 解释经营依据、责任边界或业务材料     | [业务分析](references/business-analysis.md)；有矛盾或不足时读 [输入复核](references/input-review.md)                                                                                                                          |
| 理解与使用术语、当轮沉淀或落实为模型 | [领域语言](references/domain-language.md)                                                                                                                                                                                     |
| 生成、修改、修复模型、规则或验证场景 | 先读 [追责结束准入](references/responsibility-closure.md) 与 [正式编辑流程](references/editing-workflow.md)，再读 [批次评估](references/batch-assessment.md)、[语义](references/semantics.md) 与 [格式](references/format.md) |
| 表达关键数据、业务时间或计算规则     | [来源追溯](references/provenance.md)、[CEL](references/cel-rules.md)                                                                                                                                                          |
| 编写或审查验证场景                   | [场景边界](references/scenario-validation.md)、[实例执行](references/traceability-and-simulation.md)                                                                                                                          |
| 执行 FM 检查或生成派生产物           | [FM 校验纪律](references/validation.md)                                                                                                                                                                                       |
| 设计、修改或投影整体 API             | [API 阶段](references/api-design.md)，按分支加载其方法、格式、HTTP 契约与检查                                                                                                                                                 |
| 只校验 API                           | FM 校验纪律及 [API 校验纪律](references/api-validation.md)，两源只读                                                                                                                                                          |

专项按 [规则索引](references/README.md) 选择；首次处理某类表达时，从 [正式表达基线](examples/README.md) 只读对应样例，续问复用未变化内容。样例不是当前业务事实或准入依据；tests/、evals/ 仅用于维护。

默认源为 `.evidence/fm/`、其外的词汇表 `.evidence/glossary.json` 及 `.evidence/api/api.json`；API 投影为 `.evidence/api/generated/`。获授权检查记录分别放在 `.evidence/checks/fm/`、`.evidence/checks/api/`；沿用已有指定位置，项目输出保持在 Skill 安装目录之外。

## Action

1. **核对分支依据。** 按 Guides 读取当前动作所需方法和实际输入。正式编辑先核对合同级或相应范围的人类追责结束依据及本轮编辑授权；相关未澄清合同按语义使用 Context Role，不隐藏当前合同必要缺口；只读检查与未建模术语沉淀按各自权限执行。完成时，所需依据、允许文件与分支出口可定位；编辑授权不是业务批准。
2. **维护获授权表达。** 讨论只解释判断、依据与未知；术语沉淀按领域语言维护中文（英文）规范名称与定义或 FM 引用，不授权模型 JSON 编辑，不自动迁移已有单语名称。正式编辑按流程映射来源、直接编辑当前模型并核对差异；API-only 先取得当前 FM 的有效检查结果并保持 FM 只读，校验分支直接进入 Sensors。完成时，本轮增改删及定义拥有者清楚，未知与限制按实际保留。
3. **检查并交付。** 讨论只交接解释；需要校验的分支执行 Sensors 的适用检查。正式生成／修改在词汇与 FM 检查通过后自动接续整体 API，由 API 消费同一次结果并核对摘要；“只修改 FM”“不要 API”等更窄限制优先，交接后停止。完成时，获授权文件、检查与未覆盖能力均可定位，未完成阶段单独报告。

## Sensors

设置实际绝对路径和已满足依赖的 Python，读取校验纪律后执行：

```bash
"$PYTHON" -B "$FM_SKILL_DIR/scripts/check_glossary.py" "$GLOSSARY_FILE" --fm "$FM_ROOT"
"$PYTHON" -B "$FM_SKILL_DIR/scripts/check_fm.py" "$FM_ROOT" > "$FM_CHECK_FILE"
```

模型编辑后运行两项；单独术语任务只运行适用词汇检查。`FM_CHECK_FILE` 是模型目录之外的临时 JSON，只读请求使用项目外临时目录。先核对退出码与内容，失败不接续；已有有效结果直接交接，API 不重复 FM 检查或模拟。

分别报告定义归属／引用、Schema、CEL、lineage、simulation、timeline 的实际结果。`modelDigest` 绑定输入，`inputChanged: true` 使结果失效；未执行场景时 `simulationPassed: null`。模型、场景或校验器变化后重新检查。

API 的 check/project 以 `--fm-check` 消费有效结果，保留整体覆盖、HTTP 契约和消费者接续检查；inspect 是可选只读索引，`runtimeValidated` 恒为 false。机器通过不等于业务批准。

## Steer

- **表达错误**：在当前授权内修正并复验；API 技术错误只改技术契约。
- **新责任、来源冲突、身份／权限／数量缺口或确认失效**：停止受影响阶段，交接具体对象与缺口；不自行提问或解除访谈停止／暂缓。
- **环境或保存失败**：保留错误与已改文件，不自动安装依赖，不自动回滚；分别说明已保存、未通过与未执行。
- **FM 摘要失配**：返回 FM 阶段检查，API 不隐式重跑。API 阻塞保留已保存 FM，交接部分结果。
- **完成**：报告实际差异、来源定位、检查和未决项后停止。独立调用不自动生成页面；另行要求时定位 `evidence-visualization`，来自 `evidence-modeling` 时交回入口。需求、实施、批准和 Git 操作保持各自授权边界。
