# Evidence FM 评测（Evals）

本目录用真实提示词检验 `evidence-fm` 的建模行为，是提示词改动的判据。表达与模型夹具在 `tests/fixtures/`，只由测试和确定性检查消费，不进入提示词。

## 用例维度

| 用例                    | 考察                                                     |
| ----------------------- | -------------------------------------------------------- |
| `FM-C1`                 | 请求—确认对偶与履约包裹                                  |
| `FM-C2`                 | 易变策略隔离为 Rule、违约阶梯有明确责任终点              |
| `FM-C3`                 | 最小保存单元与局部一致性                                 |
| `FM-C4`                 | 主要履约项成对，合同双方各承担一项                       |
| `FM-C5`                 | 单侧方向报范围完整性缺口，不补造对侧凑完整               |
| `FM-C6`                 | 业务凭证与领域逻辑分离及角色变化点                       |
| `FM-C7`                 | 凭证不可变性与红冲补偿机制                               |
| `FM-C8`                 | 跨端变体演进与外部合规角色插槽                           |
| `FM-C9`                 | 多方居间合同两两分解律                                   |
| `FM-C10`                | 合约前场景 · 无磋商直接签约（标准化消费直签免前置方案）  |
| `FM-C11`                | 合约前场景 · 多入度磋商汇聚（招标磋商与战略提案多入口）  |
| `FM-C12`                | 履约确认 · 多个请求共享确认（等价权责履约确认）          |
| `FM-C13`                | 违约判定 · 时段超时无确认追溯（到期未确认构成实质违约）  |
| `FM-C14`                | 凭证角色化 · 仅限时刻凭证扮演（反模式拦截时段凭证）      |
| `FM-C15`                | 非履约条款与运营附随服务过滤（广告与免责声明非凭证主干） |
| `FM-C16`                | 缺失合同时的凭证逆推归纳建模（事实单据逆推双边合约）     |
| `FM-C-RFP`              | 节点类型 · 索取提案 (evidence/rfp) 协商期时段凭证         |
| `FM-C-PROPOSAL`         | 节点类型 · 提案报价 (evidence/proposal) 响应时段凭证    |
| `FM-C-CONTRACT`         | 节点类型 · 双方合约 (evidence/contract) 时刻凭证与上下文根|
| `FM-C-REQUEST`          | 节点类型 · 履约请求 (evidence/fulfillment_request) 直连根合同|
| `FM-C-CONFIRMATION`     | 节点类型 · 履约确认 (evidence/fulfillment_confirmation) 多确认基数|
| `FM-C-SUPPORT-EVIDENCE` | 节点类型 · 通用支撑凭证 (evidence/other_evidence) 形成先决依据|
| `FM-C-PARTY`            | 节点类型 · 全局参与方 (participant/party) 独立稳定主体   |
| `FM-C-THING`            | 节点类型 · 领域标的物 (participant/thing) 独立资产属性    |
| `FM-C-ROLE-PARTY`       | 节点类型 · 参与方角色 (role/party) 上下文身份载体        |
| `FM-C-ROLE-DOMAIN`      | 节点类型 · 领域能力角色 (role/domain) 算法策略变化点     |
| `FM-C-ROLE-THIRDPARTY`  | 节点类型 · 外部系统角色 (role/third_party) 外部系统适配边界|
| `FM-C-ROLE-CONTEXT`     | 节点类型 · 上下文角色 (role/context) 外部未澄清边界占位   |
| `FM-C-ROLE-EVIDENCE`    | 节点类型 · 凭证证明角色 (role/evidence) 仅限时刻凭证扮演 |
| `FM-C-CONTEXT-CONTRACT` | 节点类型 · 合同上下文 (context/contract) 两方根与成对履约|
| `FM-C-CONTEXT-PRECONTRACT` | 节点类型 · 协商上下文 (context/pre_contract) 磋商无正式合同根|
| `FM-C-CONTEXT-DOMAIN`   | 节点类型 · 领域上下文 (context/domain) 标的物为根无履约  |
| `FM-C-FULFILLMENT`      | 节点类型 · 履约容器 (fulfillment) 双向覆盖与成对包裹     |
| `FM-T1`                 | 讨论分支：解释方法但不写文件                              |
| `FM-T2`                 | 只读校验不越权修复                                       |
| `FM-T3`                 | 负面控制：与本方法无关的请求不触发、不写文件             |

## 确定性检查

| 规则                   | 验证内容                                                       |
| ---------------------- | -------------------------------------------------------------- |
| `check_fm_consistent`  | 被测 Agent 写出的 `.evidence/fm/` 通过 `scripts/check_fm.py`   |
| `check_fm_pairing_gap` | 同上；缺模型时判失败，不回退到内置夹具自证                     |
| `no_file_write`        | 只读／讨论／拦截分支没有新增或改写文件                         |

mock 模式改用 `tests/fixtures/models/` 自检链路。缺 `cel-python` 时只比对结构错误，仍如实标注依赖缺失。

## 运行

```bash
"$PYTHON" .agents/skills/evidence-modeling/evals/runner.py --skill evidence-fm
"$PYTHON" .agents/skills/evidence-fm/evals/runner.py --mock
```

改动提示词前后各跑一次，比对 `baseline.regressions`；退化先回退，通过率提升且效率未明显变差才保留。mock 结果不写入基线。

`harness.py` 由各包各自持有同一份实现，保证包独立可运行；不跨包引用，也不在提示词中使用。
