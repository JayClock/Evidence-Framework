# 追溯问答：同一焦点，按依赖推进

以下为合成样例，双语名称、责任角色和业务依赖均为题设，不是当前项目事实。问答与控制规则由 [访谈协议](../references/interview.md) 维护；这里展示同凭证多来源和多凭证追溯的连续表达。

## 1. 同凭证：先共同依据，再独立问题

### 第一轮：共同版本与独立账户依据

采购合同（Purchase Contract）的付款（Payment）义务已明确，付款请求（Payment Request）由买方（Buyer）负责，实际主体未知。应付金额（Payable Amount）与付款期限（Payment Deadline）共同依赖已接受报价（Accepted Quote）的适用版本；收款账户（Payee Account）来自独立收款约定（Payee Terms）。两项必要依据未给，用户要求只聊并继续。

```text
当前位置：采购合同（Purchase Contract）→ 付款（Payment）→ 付款请求（Payment Request）〔履约请求〕
责任人：买方（Buyer）；实际主体待明确。

业务目标：作为买方（Buyer），我希望按适用约定履行付款（Payment）义务，以取得约定商品。

应付金额（Payable Amount）与付款期限（Payment Deadline）都追到了已接受报价（Accepted Quote），但本次适用版本尚未定位；需要先确定这项共同依据。收款账户（Payee Account）来自独立的收款约定（Payee Terms），可以另行追溯。

Q1：本次适用哪个已接受报价（Accepted Quote）版本？
Q2：收款账户（Payee Account）依据哪项收款约定（Payee Terms）确定？
```

共同版本只问一次，不提前追问依赖该版本的具体规则。买方（Buyer）是当前凭证责任人，不因引用报价或账户数据改成证明提供方。

### 第二轮：吸收部分回答并重算

用户答：“Q1 用双方接受的第二版，文件已给；Q2 不知道，请继续。”读取后发现该版金额与期限各自依赖尚未提供的独立补充约定。

```text
当前位置：采购合同（Purchase Contract）→ 付款（Payment）→ 付款请求（Payment Request）〔履约请求〕
责任人：买方（Buyer）；实际主体待明确。

已接受报价（Accepted Quote）的适用版本已定位。应付金额（Payable Amount）和付款期限（Payment Deadline）分别追到了两个独立补充约定；需要继续找到具体依据。收款账户（Payee Account）的原问题 Q2 仍未解决，本轮不重问。

Q3：应付金额（Payable Amount）适用哪个补充约定？
Q4：付款期限（Payment Deadline）适用哪个补充约定？
```

不等待整组答完，不重问 Q1。若实际材料说明期限依赖金额档位，则只问金额前提；用户要求一次一问时，即使独立也只选一题。题数来自当前依赖，不来自固定模板。

## 2. 多凭证：各链深入，再回到原判断

### 第一轮：两个独立前沿

主焦点是订阅协议（Subscription Agreement）的退款（Refund）履约中，退款申请（Refund Application）的应退金额（Refund Amount），申请由读者（Reader）负责。

支付凭证（Payment Evidence）属于支付服务约定（Payment Service Agreement）的付款（Payment）履约，由支付机构（Payment Institution）负责，提供实付金额（Paid Amount）；退款约定（Refund Terms）属于订阅协议（Subscription Agreement），由平台方（Platform Party）负责，决定退款规则。原订单匹配已明确，三项凭证的实际主体均未知。实付需要深入结算凭证（Settlement Evidence），退款约定需要定位适用版本，两项缺口独立。用户允许只聊并继续。

```text
主焦点：明确退款申请（Refund Application）的应退金额（Refund Amount）。
当前位置：订阅协议（Subscription Agreement）→ 退款（Refund）→ 退款申请（Refund Application）〔履约请求〕
责任人：读者（Reader）；实际主体待明确。

业务目标：作为读者（Reader），我希望核对应退金额（Refund Amount），以便按适用约定提出退款申请（Refund Application）。

并行追溯：
- 支付服务约定（Payment Service Agreement）→ 付款（Payment）→ 支付凭证（Payment Evidence）〔履约确认〕；关键项：实付金额（Paid Amount）；责任人：支付机构（Payment Institution），实际主体待明确。
- 订阅协议（Subscription Agreement）→ 退款约定（Refund Terms）〔其他凭证〕；关键项：适用版本；责任人：平台方（Platform Party），实际主体待明确。

原订单的匹配已核对，不重复追问。实付金额（Paid Amount）还要从支付凭证（Payment Evidence）深入结算凭证（Settlement Evidence）；应退金额（Refund Amount）则需继续核对退款约定（Refund Terms）的适用版本，两者不自动相等。

Q1：哪项结算凭证（Settlement Evidence）支撑本次实付金额（Paid Amount）？
Q2：退款约定（Refund Terms）的适用版本依据哪项约定确定？
```

各支撑凭证保留自己的责任，不取代主焦点的读者（Reader）；跨上下文只追当前退款判断需要的证明，不展开支付服务约定（Payment Service Agreement）的全部业务。

### 第二轮：一条链深入，另一条暂缓

用户提供结算凭证（Settlement Evidence），明确其责任角色为结算方（Settlement Party），形成于同一付款（Payment）履约；实际主体未知。用户暂缓 Q2，只允许继续实付依据。读取凭证后，仍缺本次金额对应的原始支付记录（Original Payment Record）。

```text
主焦点：明确退款申请（Refund Application）的应退金额（Refund Amount）。
当前位置：订阅协议（Subscription Agreement）→ 退款（Refund）→ 退款申请（Refund Application）〔履约请求〕
责任人：读者（Reader）；实际主体待明确。

并行追溯：
- 支付服务约定（Payment Service Agreement）→ 付款（Payment）→ 结算凭证（Settlement Evidence）〔其他凭证〕；关键项：实付金额（Paid Amount）；责任人：结算方（Settlement Party），实际主体待明确。
- 订阅协议（Subscription Agreement）→ 退款约定（Refund Terms）〔其他凭证〕；关键项：适用版本，原问题 Q2 继续暂缓；责任人：平台方（Platform Party），实际主体待明确。

实付金额（Paid Amount）的来源已深入结算凭证（Settlement Evidence），还需要找到对应的原始支付记录（Original Payment Record）。取得依据后会回到支付凭证（Payment Evidence），再支撑退款申请（Refund Application）的金额判断。Q2 继续暂缓，不因更换凭证恢复它。

Q3：结算凭证（Settlement Evidence）中的本次实付金额（Paid Amount）对应哪项原始支付记录（Original Payment Record）？
```

沿已选链深度优先追溯，而不是先扫描所有同层凭证。主焦点及目标未变，不重复用户故事；结算方（Settlement Party）的责任来自新材料，不自动继承上层角色。

### 第三轮：回溯并按要求停止

用户提供原始支付记录（Original Payment Record）及对应依据，足以解释实付金额（Paid Amount），并要求“今天停止，Q2 仍暂缓”。

```text
主焦点：明确退款申请（Refund Application）的应退金额（Refund Amount）。
当前位置：订阅协议（Subscription Agreement）→ 退款（Refund）→ 退款申请（Refund Application）〔履约请求〕
责任人：读者（Reader）；实际主体待明确。

实付金额（Paid Amount）已经追到原始支付记录（Original Payment Record），并核对结算凭证（Settlement Evidence）的对应金额；回到支付凭证（Payment Evidence）时，本次实付已有证明依据。再回到退款申请（Refund Application），应退金额（Refund Amount）仍依赖退款约定（Refund Terms）的 Q2，该题继续暂缓。实付依据查清不表示应退金额已确定，更不表示退款（Refund）已完成。

本轮只聊，未写入文件；按要求停止。
```

若后来取得明确的全额退款约定，可直接用实付金额（Paid Amount）解释应退金额（Refund Amount），不为凑题询问金额实例。来源终点不是责任终点，问题答完也不是全局追责结束；控制与术语结果的交接见 [控制与恢复](control-and-recovery.md)。
