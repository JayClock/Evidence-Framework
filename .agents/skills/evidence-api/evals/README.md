# Evidence API 评测（Evals）

本目录用真实提示词检验 `evidence-api` 的契约设计行为，是提示词改动的判据。完整链路夹具在 `tests/fixtures/full-lifecycle/`，只由测试与确定性检查消费，不进入提示词。

## 用例维度

| 用例       | 考察                                                              |
| ---------- | ----------------------------------------------------------------- |
| `API-C1`   | 角色接口的资源、能力归属与 mapped 2xx 消费步骤                    |
| `API-C2`   | 只从既有设计源投影 OpenAPI，不重新设计、不重复 FM 检查             |
| `API-C3`   | 严格遵循 CR 哲学（出库/收货为 POST/GET，更正通过追加红冲凭证）    |
| `API-C4`   | 基于弹性边界（冷热流量差异与业务等待点）的资源拆分                |
| `API-C5`   | 凭证角色化消费契约 · 仅限时刻事件作为先决前置步骤                 |
| `API-C6`   | 多请求共享确认的多入度 API 契约（等价权责映射）                   |
| `API-C7`   | 合同列表的函数求值编排与主体作用域（微服务编排封装，非主体管理合同）|
| `API-C8`   | 服务蓝图三线分流与全模型闭包（前台/经办/可视线以下 nonApi 互斥覆盖）|
| `API-C9`   | 单例与集合基数寻址形态精准映射（1:1 单例父作用域无子 ID vs 1:N 集合）|
| `API-C10`  | 派生属性禁止入参红线与受控集合查询（计算属性服务端回填，受控过滤）|
| `API-T1`   | 负面控制：与本项目无关的请求不触发、不写文件                      |
| `API-T2`   | 只读校验不修改设计源或派生产物                                    |

内容用例会先写入 `.evidence/fm/`（`API-C1`、`API-C3`～`API-C10`）或 `.evidence/fm/` 加 `.evidence/api/api.json`（`API-C2`、`API-T2`）作为合法输入；只读检查按播种后的快照判断是否被改写。

## 确定性检查

| 规则               | 验证内容                                                   |
| ------------------ | ---------------------------------------------------------- |
| `check_api_schema` | 被测 `.evidence/api/api.json` 通过 `schemas/api.schema.json` |
| `no_file_write`    | 播种输入未被改写，也没有新增文件                           |

## 运行

```bash
"$PYTHON" .agents/skills/evidence-modeling/evals/runner.py --skill evidence-api
"$PYTHON" .agents/skills/evidence-api/evals/runner.py --mock
```

首次真实运行生成基线 `eval_results.json`；此后每次改动前后各跑一次并比对 `baseline.regressions`。mock 结果不写入基线。

`harness.py` 由各包各自持有同一份实现，保证包独立可运行；不跨包引用，也不在提示词中使用。
