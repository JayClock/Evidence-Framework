---
name: evidence-fm
description: 当用户讨论合同与履约发现、整理中文（英文）规范术语，或要求生成、修改、修复、校验 FM 时使用。维护从约定与责任双方进入、沿履约凭证增量发现协作的方法及正式表达；正式编辑须有人类合同级或相应范围追责结束依据，不主持访谈或实现业务系统。
compatibility: 讨论只需文本；文件维护需读写能力；校验需 Python 3.10+ 和本包 requirements.txt。
---

# Evidence 业务建模

本包维护业务分析、领域语言与正式 FM。Discovery 管理访谈问答，本包维护专业判断与正式表达；API 设计由独立的 `evidence-api` 维护，阶段接续归 `evidence-modeling`。

## Guides

先确定讨论、术语沉淀、正式编辑或只读校验。读取项目权限、实际来源、已有文件与 Git 差异，只修改本次授权的文件，保留无关改动，不自动迁移。只聊不落盘不写文件；只校验不修复、不保存项目报告。

| 当前动作                               | 必要参考                                                                                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 解释约定与责任双方、主要履约或协作边界 | [业务分析](references/business-analysis.md)；有矛盾或不足时读 [输入复核](references/input-review.md)                                                                                                                          |
| 分析领域对象、身份、关系与行为规则     | [领域建模](references/domain-modeling.md)；正式编辑另核对分支准入                                                                                                                                                             |
| 理解与使用术语、当轮沉淀或落实为模型   | [领域语言](references/domain-language.md)                                                                                                                                                                                     |
| 生成、修改、修复模型、规则或验证场景   | 先读 [追责结束准入](references/responsibility-closure.md) 与 [正式编辑流程](references/editing-workflow.md)，再读 [批次评估](references/batch-assessment.md)、[语义](references/semantics.md) 与 [格式](references/format.md) |
| 表达关键数据、业务时间或计算规则       | [来源追溯](references/provenance.md)、[CEL](references/cel-rules.md)                                                                                                                                                          |
| 编写或审查验证场景                     | [场景边界](references/scenario-validation.md)、[实例执行](references/traceability-and-simulation.md)                                                                                                                          |
| 执行 FM 检查或生成派生产物             | [FM 校验纪律](references/validation.md)                                                                                                                                                                                       |

专项按 [规则索引](references/README.md) 选择；首次处理某类表达时，从 [正式表达基线](examples/README.md) 只读对应样例，续问复用未变化内容。样例不是当前业务事实或准入依据；tests/、evals/ 仅用于维护。

默认源为 `.evidence/fm/` 及其外的词汇表 `.evidence/glossary.json`。获授权检查记录放在 `.evidence/checks/fm/`；沿用已有指定位置，项目输出保持在 Skill 安装目录之外。

## Action

1. **核对分支依据。** 按 Guides 读取当前动作所需方法和实际输入。正式编辑先核对合同级或相应范围的人类追责结束依据及本轮编辑授权；相关未澄清合同按语义使用 Context Role，不隐藏当前合同必要缺口；只读检查与未建模术语沉淀按各自权限执行。完成时，所需依据、允许文件与分支出口可定位；编辑授权不是业务批准。
2. **维护获授权表达。** 讨论只解释判断、依据与未知；术语沉淀按领域语言维护中文（英文）规范名称与定义或 FM 引用，不授权模型 JSON 编辑，不自动迁移已有单语名称。正式编辑按流程映射来源、直接编辑当前模型并核对差异；校验分支直接进入 Sensors。完成时，本轮增改删及定义拥有者清楚，未知与限制按实际保留。
3. **检查并交付。** 讨论只交接解释；需要校验的分支执行 Sensors 的适用检查。正式生成／修改在词汇与 FM 检查通过后交接完整模型根、实际差异及同一次有效结果；独立调用只交付 FM，不自动设计 API。来自 Modeling 时返回入口，由其按授权委派 `evidence-api`，交接后停止。完成时，获授权文件、检查与未覆盖能力均可定位，未完成阶段单独报告。

## Sensors

设置实际绝对路径和已满足依赖的 Python，读取校验纪律后执行：

```bash
"$PYTHON" -B "$FM_SKILL_DIR/scripts/check_glossary.py" "$GLOSSARY_FILE" --fm "$FM_ROOT"
"$PYTHON" -B "$FM_SKILL_DIR/scripts/check_fm.py" "$FM_ROOT" > "$FM_CHECK_FILE"
```

模型编辑后运行两项；单独术语任务只运行适用词汇检查。`FM_CHECK_FILE` 是模型目录之外的临时 JSON，只读请求使用项目外临时目录。先核对退出码与内容，失败不接续；已有有效结果直接交接，API 不重复 FM 检查或模拟。

分别报告定义归属／引用、Schema、CEL、lineage、simulation、timeline 的实际结果。`modelDigest` 绑定输入，`inputChanged: true` 使结果失效；未执行场景时 `simulationPassed: null`。模型、场景或校验器变化后重新检查。

FM 检查结果可交给独立的 `evidence-api` 消费；API 技术校验由该包维护。机器通过不等于业务批准。

## Steer

- **表达错误**：在当前授权内修正并复验。
- **新责任、来源冲突、身份／权限／数量缺口或确认失效**：停止受影响阶段，交接具体对象与缺口；不自行提问或解除访谈停止／暂缓。
- **环境或保存失败**：保留错误与已改文件，不自动安装依赖，不自动回滚；分别说明已保存、未通过与未执行。
- **FM 摘要失配**：按本轮检查授权重新核对当前 FM，交接有效结果；下游失败不撤销已保存 FM。
- **完成**：报告实际差异、来源定位、检查和未决项后停止。独立调用不自动生成页面；另行要求时定位 `evidence-visualization`，来自 `evidence-modeling` 时交回入口。需求、实施、批准和 Git 操作保持各自授权边界。
