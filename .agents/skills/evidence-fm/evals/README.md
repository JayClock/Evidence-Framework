# Evidence FM 评测（Evals）

本目录用真实提示词检验 `evidence-fm` 的建模行为，是提示词改动的判据。表达与模型夹具在 `tests/fixtures/`，只由测试和确定性检查消费，不进入提示词。

## 用例维度

| 用例      | 考察                                                     |
| --------- | -------------------------------------------------------- |
| `FM-C1`   | 请求—确认对偶与履约包裹                                  |
| `FM-C2`   | 易变策略隔离为 Rule、违约阶梯有明确责任终点              |
| `FM-C3`   | 最小保存单元与局部一致性                                 |
| `FM-C4`   | 主要履约项成对，合同双方各承担一项                       |
| `FM-C5`   | 单侧方向报范围完整性缺口，不补造对侧凑完整               |
| `FM-T1`   | 讨论分支：解释方法但不写文件                              |
| `FM-T2`   | 只读校验不越权修复                                       |
| `FM-T3`   | 负面控制：与本方法无关的请求不触发、不写文件             |

## 确定性检查

| 规则                   | 验证内容                                                       |
| ---------------------- | -------------------------------------------------------------- |
| `check_fm_consistent`  | 被测 Agent 写出的 `.evidence/fm/` 通过 `scripts/check_fm.py`   |
| `check_fm_pairing_gap` | 同上；缺模型时判失败，不回退到内置夹具自证                     |
| `no_file_write`        | 只读／讨论分支没有新增或改写文件                               |

mock 模式改用 `tests/fixtures/models/` 自检链路。缺 `cel-python` 时只比对结构错误，仍如实标注依赖缺失。

## 运行

```bash
"$PYTHON" .agents/skills/evidence-modeling/evals/runner.py --skill evidence-fm
"$PYTHON" .agents/skills/evidence-fm/evals/runner.py --mock
```

改动提示词前后各跑一次，比对 `baseline.regressions`；退化先回退，通过率提升且效率未明显变差才保留。mock 结果不写入基线。

`harness.py` 由各包各自持有同一份实现，保证包独立可运行；不跨包引用，也不在提示词中使用。
