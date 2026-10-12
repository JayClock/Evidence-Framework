# FM 生成与行为评测

本目录与运行脚本、schemas、测试一起随 Skill 维护，可单独复制使用。评测输入不是业务来源或已通过报告。

## 案例分支

- [evals.json](evals.json)：20 个 FM 技术生成／修复及缺口案例，供 `run_modeling_evals.py` 准备或评分。正向案例附有[合成准入来源](fixtures/modeling-admission.md)，先核对对应范围、责任图及人类终点和全局结束原话；缺口仍须阻塞，合成确认不覆盖实际遗漏。
- [behavior.json](behavior.json)：独立行为案例 4、9、29，检查同一范围未决责任阻止局部建模、独立 FM 不绕过门槛，以及全部追责结束依据充分后的编辑。由独立会话和人工逐项检查，不交给技术产物评分器。

- [api.json](api.json)：整体 API 设计、只读、契约覆盖和生成失败边界；使用本包的 API 阶段，FM 检查一次后直接消费结果，不重复校验。files 相对 Skill 根解析，位于 `tests/api/fixtures/`。

各分支保留原 ID，不混作同一编号空间。API 行为评测由独立会话评价，不交给 FM 技术产物评分器；没有实际执行不记为通过。

| ID  | 完整 FM 案例     | 主要检查                                     |
| --- | ---------------- | -------------------------------------------- |
| 0   | VIP 协议         | 合同角色、显式履约与领域角色                 |
| 1   | 支付渠道         | 开放凭证角色，不虚构提供方 Party             |
| 2   | 签约前来源       | RFP／Proposal 来源，不混合同与履约           |
| 3   | 内部 KPI         | 目标—实际，不虚构现金流                      |
| 4   | 缺失确认凭证修复 | 保持已有角色、凭证责任及触发语义             |
| 5   | 冲正与补偿       | 原凭证不覆盖，新义务与凭证                   |
| 6   | 简单胶水         | 有依据的不适用，不强求合同                   |
| 7   | 部分确认         | 次数／金额完成与 CEL                         |
| 8   | 自动触发         | 调度器代表角色，不成为参与者                 |
| 9   | CEL 规则         | 不另造赋值 DSL 或自然语言执行式              |
| 10  | 参与者绑定       | 一个客户跨上下文扮演角色                     |
| 11  | 内容平台多合同   | 三合同、九项合同内权责履约与候选复用         |
| 12  | 数据追溯与模拟   | 属性 lineage、成功／违约与待审核             |
| 13  | 歧义叙述         | 未满足追责结束准入，只返回缺口，不产局部模型 |
| 14  | 跨领域复用       | 两合同／领域的支持，不虚构确认               |
| 15  | 纯客户领域       | 身份、关系、规则，不编合同与履约             |
| 16  | 纯合同前         | 签约前凭证允许没有履约                       |
| 17  | KPI 签约前协商   | 协商不变成目标设定履约                       |
| 18  | KPI 变更         | 变更与进度检查保留各自责任方向               |
| 19  | CRM 组合         | 领域与履约并存，输入不冒充完成证明           |

评分检查 Schema v4、确定性编译、真实履约的合同归属、履约成员与请求区间、CEL、角色和场景约束。专门案例核对 lineage 与真实单据模拟。纯领域／合同前不强求非空履约；责任未闭合的缺口案例不得产出局部模型。技术评分器检查已生成产物，不认证人类身份或证明准入核对实际发生；是否遵守全局门槛须另按行为案例及原始交互评价。候选复用、被支持的复用与人工确认分开。

角色身份只按来源明确程度映射：来源明确具体玩家才建 Participant + plays_role，仅有上下文身份则保留 Role。人仍须审核领域身份、关系、目标批准与及时回应的区别，以及简单胶水是否隐藏了领域规则。机器通过不证明业务语义完整。

## 本地运行

先使用满足本包 `requirements.txt` 的 Python 3.10+ 环境，将 `SKILL_DIR`、`PYTHON`、`WORKSPACE` 设置为实际绝对路径。输出目录须获授权，不覆盖真实业务模型。

```bash
# 只准备输入，不调用 Agent，也不代表评测通过
"$PYTHON" "$SKILL_DIR/evals/run_modeling_evals.py" --workspace "$WORKSPACE" --prepare-only

# 使用实际可用的外部 Agent 命令；含空格的路径须在模板中加引号
"$PYTHON" "$SKILL_DIR/evals/run_modeling_evals.py" --workspace "$WORKSPACE" --only 11,12,13,14 \
  --command-template 'agent-cli --prompt-file "{prompt_file}" --output "{output_dir}"'

# 评分已有输出
"$PYTHON" "$SKILL_DIR/evals/run_modeling_evals.py" --workspace "$WORKSPACE" --grade-only

# 本包确定性回归，不是 Agent 行为评测
"$PYTHON" -B -m unittest discover -s "$SKILL_DIR/tests" -v
```

案例 files 相对本目录解析，夹具位于 `fixtures/`，与调用目录无关。准备时将 `$modeling` 调用名替换为 `$evidence-fm`，不修改业务预期。外部命令经分词后执行，不经过 shell；工作目录为指定 WORKSPACE。模板可用 skill_dir、workspace、eval_dir、input_dir、output_dir、prompt_file、eval_id、eval_name；兼容占位符 repo_root 只表示调用目录，不要求仓库存在。未指定输出目录时使用调用目录下的 modeling-workspace/iteration-1。

[测试样例](../tests/context_samples.py) 在临时目录构造纯领域、合同前、混合与 KPI 合成模型。测试覆盖编译、lineage、约束反例和评分器负例；直接计算 CEL 真值不是单据模拟或领域状态机执行。

## 行为评价

为 behavior.json 使用独立临时项目和会话，只安装本 Skill；同一模型与输入分别运行有 Skill／无 Skill 或新旧版本，不共享答案。缺少必要业务依据时观察是否只返回具体缺口，不自动进入访谈。后续补充由真人按案例给出，保存对话、文件 diff 和逐条 expectations 的原文依据及通过／失败／未评结论，不让 Agent 自答。

案例 13 保留五类结算缺口，并要求未取得人类追责结束依据时不生成任何正式模型、规则或场景，只交接缺口，不自行访谈。合成准入来源不用于缺口案例 13、16；这些案例不能借其他案例的结束原话放行。自动输入准备或技术产物评分不替代这项人工行为判定。

没有实际运行就标未执行，不填写通过率、token 收益或行为保证。业务审核、模型校验、单据模拟及生成质量是独立结论；不能为了通过评分改变既有预期。
