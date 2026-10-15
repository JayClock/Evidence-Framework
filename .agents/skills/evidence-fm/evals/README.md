# FM 生成与行为评测

本目录随 Skill 独立维护。评测输入是合成材料，不是实际业务来源或已通过报告；没有实际执行不记为通过。

## 案例分支

- [evals.json](evals.json)：技术生成／修复、不适用与仅说明案例，由 `run_modeling_evals.py` 准备或评分。`outcome` 为 `model`、`not-applicable`、`blocked`。模型案例仅授权 FM，不触发 API 或页面；[合成责任来源](fixtures/modeling-admission.md)提供对应业务范围与确认材料，不作为首次保存门槛，不覆盖实际遗漏。
- [behavior.json](behavior.json)：渐进保存、凭证与责任角色共同落地、实际主体未知、未决责任阻止下游而非保存、独立范围、只读及不同确认类型。独立会话逐项评价，不交给技术产物评分器。
- [model-language.json](model-language.json)：Entity/属性定义的直接消费、属性证明边界、上下文歧义、更正权限与未建模概念翻译。用实际文件差异及交互轨迹评价。

各文件 ID 独立。API 评测由 `evidence-api` 维护，业务批准、机器检查、实例模拟与人工行为评价分别报告。

| ID  | 技术案例       | 主要检查                               |
| --- | -------------- | -------------------------------------- |
| 0   | VIP 协议       | 合同角色、履约与领域角色               |
| 1   | 支付渠道       | 开放证明角色，不虚构 Party             |
| 2   | 签约前来源     | RFP／Proposal 不混同合同履约           |
| 3   | 内部 KPI       | 目标—实际，不虚构现金流                |
| 4   | 缺失确认修复   | 保持角色、责任与触发语义               |
| 5   | 冲正与补偿     | 不覆盖原凭证，保留新义务               |
| 6   | 简单胶水       | 有依据的不适用                         |
| 7   | 部分确认       | 累计完成与 CEL                         |
| 8   | 自动触发       | 调度器代表角色而非参与方               |
| 9   | CEL 规则       | 不另造执行 DSL                         |
| 10  | 参与者绑定     | 同一主体跨上下文扮演角色               |
| 11  | 多合同         | 合同内权责与候选复用                   |
| 12  | 追溯与模拟     | lineage、成功／违约及机器结果          |
| 13  | 歧义说明       | 按明确只说明、不生成的权限交接业务缺口 |
| 14  | 跨领域复用     | 引用有依据的结果，不虚构确认           |
| 15  | 纯领域         | 身份、关系、规则，不编合同履约         |
| 16  | 询价与报价说明 | 保留已知事实和截止缺口，遵守不生成限制 |
| 17  | KPI 合同前协商 | 不变成目标设定履约                     |
| 18  | KPI 变更       | 变更与进度检查保持各自方向             |
| 19  | CRM 组合       | 领域输入不冒充完成证明                 |

`model` 评分检查类型、引用、确定性编译及案例对应结构；纯领域不强求非空履约。`blocked` 案例 13、16 明确只说明、不生成，评分检查具体缺口及没有模型、零散规则、场景或编译产物，原因是权限而不是未取得追责结束确认。说明保存为评测输出 Markdown，不要求项目 discovery 目录或问题台账。`not-applicable` 检查有依据的不建模说明。

角色身份按来源明确程度映射：责任角色明确可保存，具体玩家未知不造 Participant 或 plays_role；角色未知暂不保存该凭证。领域行为不能通过补造 Evidence 获得模拟通过。技术评分器不认证人类身份、完整责任发现、编辑权限的实际核对或业务批准。

## 本地运行

使用满足本包 `requirements.txt` 的 Python 3.10+，设置实际绝对路径，输出目录须获授权且不能覆盖真实业务模型。

```bash
# 仅准备输入，不调用 Agent，也不表示通过
"$PYTHON" "$SKILL_DIR/evals/run_modeling_evals.py" --workspace "$WORKSPACE" --prepare-only

# 使用实际可用的外部 Agent；路径含空格时在模板中加引号
"$PYTHON" "$SKILL_DIR/evals/run_modeling_evals.py" --workspace "$WORKSPACE" --only 11,12,13,14 \
  --command-template 'agent-cli --prompt-file "{prompt_file}" --output "{output_dir}"'

"$PYTHON" "$SKILL_DIR/evals/run_modeling_evals.py" --workspace "$WORKSPACE" --grade-only
"$PYTHON" -B -m unittest discover -s "$SKILL_DIR/tests" -v
```

案例 files 相对本目录解析，夹具在 `fixtures/`；不依赖调用目录。命令经分词执行，不通过 shell，cwd 为 WORKSPACE。模板支持 skill_dir、workspace、eval_dir、input_dir、output_dir、prompt_file、eval_id、eval_name。默认输出为调用目录下 `evidence-fm-workspace/iteration-1`。

## 行为评价

使用独立临时项目与会话，分别运行有 Skill／无 Skill或新旧版本，不共享答案；后续回答由真人按案例给出，待评 Agent 不自答。保存原始对话、文件 diff、实际检查结果，以及逐条 expectations 的依据与通过／失败／未评结论。

检查有依据的内容是否获授权渐进保存，缺责任角色的凭证是否暂不保存，同合同退款等未决分支是否保留，是否分别报告一致性、指定范围完整性、模拟、人类确认与下游结果。已就绪独立范围不等无关合同，必要依赖也不能被删掉。只读、只聊不落盘、停止与部分保存失败分别评价，不用结构测试代替实际行为。

模型语言案例还检查 Entity 名称、属性含义、别名、上下文及更正影响；没有模型不为保存名称创建占位对象。目录和引用回归仅证明案例可达，不证明 Agent 表达质量。

没有实际运行就标未执行，不填写通过率、token 收益或行为保证，不修改既有预期制造通过。
