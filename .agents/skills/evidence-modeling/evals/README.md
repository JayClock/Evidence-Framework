# 技能评测与提示词进化（Evals）

本目录是 Harness 的持续改进入口：技能提示词（`SKILL.md` 与 `references/`）的每次改动，用这里的用例分数判断是否值得保留，而不是靠新增示例或主观感觉。用例、裁判模板和各技能基线由各包 `evals/` 独立持有；本包同时提供聚合调度。

## 评估什么

每条用例同时给三类信号，质量与效率必须成对看：

| 信号     | 取值来源                                                     |
| -------- | ------------------------------------------------------------ |
| 触发精度 | 该触发时是否加载技能，不该触发时是否越界（含至少一条负面控制） |
| 输出质量 | 确定性检查（文件是否写出、结构是否通过）+ rubric 裁判 0/1    |
| 效率     | `elapsed_s` 与 `tool_calls` 条数，和通过率一起比较           |

## 用例结构（`cases.json`）

| 字段                 | 含义                                                       |
| -------------------- | ---------------------------------------------------------- |
| `id` / `dimension`   | 用例编号与它单独考察的质量维度                             |
| `prompt`             | 真实输入；一条用例只考察一个维度                           |
| `expect_trigger`     | 预期是否加载被测技能；`false` 为负面控制                   |
| `deterministic_rule` | 客观检查名，由各包 runner 实现                             |
| `rubric`             | 裁判唯一依据；只写可判定的标准，不写“写得好”               |

`target_skill: "none"` 表示不应触发任何被测技能。

## 运行

```bash
# 全局看板（真实执行，需要可用的 agent 与裁判命令）
"$PYTHON" .agents/skills/evidence-modeling/evals/runner.py --all

# 单个技能
"$PYTHON" .agents/skills/evidence-modeling/evals/runner.py --skill evidence-discovery
"$PYTHON" .agents/skills/evidence-modeling/evals/runner.py --skill evidence-fm
"$PYTHON" .agents/skills/evidence-modeling/evals/runner.py --skill evidence-api
"$PYTHON" .agents/skills/evidence-modeling/evals/runner.py --skill evidence-modeling

# 只验证运行链路，不产生基线
"$PYTHON" .agents/skills/evidence-modeling/evals/runner.py --all --mock
```

真实执行默认使用 `pi -p --mode json --no-session` 作为被测 agent，`pi ... --no-tools` 作为裁判；用 `--agent-cmd`、`--judge-cmd` 或 `EVIDENCE_EVAL_AGENT`、`EVIDENCE_EVAL_JUDGE` 换成其他宿主命令。每条用例在独立临时工作区运行，技能被复制到该工作区的 `.agents/skills/` 下供发现，`tests/` 与 `evals/` 不复制。

裁判不可用或被判为 0 分时，用例不算通过；`--mock` 结果标注 `mode: "mock"`，不写入基线文件，不能当作改进证据。

## 提示词进化流程

1. **先取基线。** 改动前跑一次，`eval_results.json` 保留当前分数。
2. **改一处。** 只改与方法相关的提示词或检查，不顺手改用例预期来通过。
3. **再跑一次。** 与基线比较：`baseline.regressions` 非空说明这次改动带来退化，先回退或修好；通过率提升且效率未明显变差才保留。
4. **模型或运行环境升级后重跑全部用例。** 行为走样会以分数变化暴露，不靠等待新模型自动变好。
5. **废弃判断。** 卸掉技能后仍全部通过（能力已被模型内化或被其他技能覆盖），或连续多轮修改都无法恢复分数，才考虑退役该技能。

`eval_results.json` 是最新一次真实运行的基线，由首次真实运行生成；不要在未重跑的情况下手改分数或把 mock 结果当基线。

## 各技能关注点

- **`evidence-discovery`**：现金权责双方锁定、凭证链追溯、依赖前沿同轮成组提问、控制分支不推进下游、非业务咨询不触发。
- **`evidence-fm`**：请求—确认对偶、违约阶梯与外置策略、最小保存单元、只聊不落盘与只读不越权；确定性检查优先检查被测 Agent 实际写出的 `.evidence/fm/`。
- **`evidence-api`**：角色接口与成功消费步骤、只投影不重新设计、只读校验不改写；确定性检查校验被测 `api.json` 是否符合设计 Schema。
- **`evidence-modeling`**：意图分派与授权传递、阶段门禁、缺口阻断不伪造放行。

## 边界

评测通过只说明这些用例在当前模型与运行环境下达标，不证明真实业务访谈质量或服务运行验收。用例是合成的，不进入提示词；提示词不得反向引用本目录或 `tests/` 里的夹具来“教” Agent。

`harness.py` 由各包各自持有同一份实现，保证包独立可运行；不跨包引用，也不在提示词中使用。
