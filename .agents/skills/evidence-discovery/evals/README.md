# Evidence Discovery 评测（Evals）

本目录用真实提示词检验 `evidence-discovery` 的访谈行为，是提示词改动的判据。对话样例在 `evidence-modeling/tests/fixtures/discovery/`，只由测试消费，不进入提示词。

## 用例维度

| 用例            | 考察                                                       |
| --------------- | ---------------------------------------------------------- |
| `DISCOVERY-C1`  | 从现金权责定位责任双方，并沿凭证链追溯，不退化为字段清单   |
| `DISCOVERY-C2`  | 沿依赖前沿同轮成组提出全部独立必要未知，不做单点往复追问   |
| `DISCOVERY-T1`  | 仅补资料／控制分支下保持等待，不推进下游产物               |
| `DISCOVERY-T2`  | 负面控制：非业务访谈的技术咨询不触发技能、不写文件         |

## 确定性检查

| 规则                     | 验证内容                                                 |
| ------------------------ | -------------------------------------------------------- |
| `check_interview_trace`  | 被测 Agent 写出的 `.evidence/traces/interview-trace.json` 通过 `scripts/check_interview_trace.py` |
| `no_downstream_advance`  | 未产生 `.evidence/api/` 或 `.evidence/views/` 下游产物    |
| `no_file_write`          | 负面控制分支没有新增或改写文件                            |

## 运行

```bash
# 真实执行（默认 agent：pi -p --mode json --no-session；裁判：pi ... --no-tools）
"$PYTHON" .agents/skills/evidence-modeling/evals/runner.py --skill evidence-discovery
# 只验证运行链路，不产生基线
"$PYTHON" .agents/skills/evidence-discovery/evals/runner.py --mock
```

改动提示词前后各跑一次，比对 `eval_results.json` 的 `baseline.regressions`；退化先回退，通过率提升且 `elapsed_s`／`tool_calls` 未明显变差才保留。mock 结果不写入基线，也不能作为改进证据。

`harness.py` 由各包各自持有同一份实现，保证包独立可运行；不跨包引用，也不在提示词中使用。
