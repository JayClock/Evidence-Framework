# FM 生成与行为评测

本目录与运行脚本、schemas、测试一起随 Skill 维护，可单独复制使用。评测输入不是业务来源或已通过报告。

## 两类案例

- [evals.json](evals.json)：20 个完整 FM 生成／修复案例，供 `run_modeling_evals.py` 准备或评分。
- [behavior.json](behavior.json)：独立行为案例 4、9，观察部分纳入、真实依赖、未决赔付、明确更新意图，以及没有访谈包时返回具体缺口的边界。由独立会话和人工逐项检查，不交给完整模型评分器。

两套案例各保留原 ID，不混作同一编号空间。

| ID  | 完整 FM 案例     | 主要检查                                    |
| --- | ---------------- | ------------------------------------------- |
| 0   | VIP 协议         | 合同角色、显式履约与领域角色                |
| 1   | 支付渠道         | 开放凭证角色，不虚构提供方 Party            |
| 2   | 签约前来源       | RFP／Proposal 来源，不混合同与履约          |
| 3   | 内部 KPI         | 目标—实际，不虚构现金流                     |
| 4   | 缺失确认凭证修复 | 保持已有角色、凭证责任及触发语义            |
| 5   | 冲正与补偿       | 原凭证不覆盖，新义务与凭证                  |
| 6   | 简单胶水         | 有依据的不适用，不强求合同                  |
| 7   | 部分确认         | 次数／金额完成与 CEL                        |
| 8   | 自动触发         | 调度器代表角色，不成为参与者                |
| 9   | CEL 规则         | 不另造赋值 DSL 或自然语言执行式             |
| 10  | 参与者绑定       | 一个客户跨上下文扮演角色                    |
| 11  | 内容平台多合同   | 三合同、九项作为子 Context 的履约与候选复用 |
| 12  | 数据追溯与模拟   | 属性 lineage、成功／违约与待审核            |
| 13  | 歧义叙述         | 返回缺口，可不产模型；不编造已确认事实      |
| 14  | 跨领域复用       | 两合同／领域的支持，不虚构确认              |
| 15  | 纯客户领域       | 身份、关系、规则，不编合同与履约            |
| 16  | 纯合同前         | 签约前凭证允许没有履约                      |
| 17  | KPI 签约前协商   | 协商不变成目标设定履约                      |
| 18  | KPI 变更         | 变更与进度检查保留各自责任方向              |
| 19  | CRM 组合         | 领域与履约并存，输入不冒充完成证明          |

评分检查 Schema v3、确定性编译、真实履约的父子上下文与请求区间、CEL、角色和场景约束。专门案例核对 lineage 与真实单据模拟。纯领域／合同前不强求非空履约；发现案例不产模型可以成立，若产出仍应 draft／pending。候选复用、被支持的复用与人工确认分开。

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

完整生成案例 13 的结算业务叙述、五类缺口覆盖与 draft／pending 限制保持；产物要求改为缺口交接，不要求四阶段访谈或必答问卷。现有评分器继续检查缺口材料及业务覆盖，是否真正遵守交互边界仍须人工评测。

没有实际运行就标未执行，不填写通过率、token 收益或行为保证。业务审核、模型校验、单据模拟及生成质量是独立结论；不能为了通过评分改变既有预期。
