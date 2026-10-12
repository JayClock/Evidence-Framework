# 多凭证一轮：各链深入，围绕同一判断回溯

以下是三轮连续的合成样例。双语名称、合同归属和责任角色均为样例给定，不是当前项目事实。并行追溯只服务当前退款判断，不开启其他合同的全面访谈。

## 1. 两个支撑凭证可以同时追溯

### 输入与判断

主焦点为订阅协议（Subscription Agreement）下退款（Refund）履约的退款申请（Refund Application），需要明确应退金额（Refund Amount）。申请责任角色为读者（Reader）。

实付金额（Paid Amount）来自支付凭证（Payment Evidence），该凭证属于支付服务约定（Payment Service Agreement）的付款（Payment）履约，责任角色为支付机构（Payment Institution）。退款约定（Refund Terms）属于订阅协议（Subscription Agreement），责任角色为平台方（Platform Party）；它决定应退金额（Refund Amount）。三项凭证的实际主体均未知，不从责任角色补造主体。

原订单（Original Order）的匹配依据已明确并适用于两条链。支付凭证（Payment Evidence）还需要追到用于证明实付的结算凭证（Settlement Evidence）；退款约定（Refund Terms）的适用版本依据尚未明确。两项缺口彼此独立，用户允许只聊并继续。

### 期望展示

```text
主焦点：明确退款申请（Refund Application）的应退金额（Refund Amount）。
当前位置：订阅协议（Subscription Agreement）→ 退款（Refund）→ 退款申请（Refund Application）〔履约请求〕
责任人：读者（Reader）；实际主体待明确。

业务目标：作为读者（Reader），我希望核对应退金额（Refund Amount），以便按适用约定提出退款申请（Refund Application）。

并行追溯：
- 支付服务约定（Payment Service Agreement）→ 付款（Payment）→ 支付凭证（Payment Evidence）〔履约确认〕；关键项：实付金额（Paid Amount）；责任人：支付机构（Payment Institution），实际主体待明确。
- 订阅协议（Subscription Agreement）→ 退款约定（Refund Terms）〔其他凭证〕；关键项：适用版本（Applicable Version）；责任人：平台方（Platform Party），实际主体待明确。

两条链都已经核对原订单（Original Order）的匹配，不重复追问。实付金额（Paid Amount）还要从支付凭证（Payment Evidence）深入结算凭证（Settlement Evidence）；应退金额（Refund Amount）则要继续核对退款约定（Refund Terms）的适用版本，两者不自动相等。

Q1：哪项结算凭证（Settlement Evidence）支撑本次实付金额（Paid Amount）？
Q2：退款约定（Refund Terms）的适用版本（Applicable Version）依据哪项约定确定？
```

### 检查

两个问题各自来自一条链的当前前沿，不先罗列所有上游凭证再深入。支付机构（Payment Institution）与平台方（Platform Party）是各自支撑凭证的责任角色，不取代主焦点的读者（Reader）。跨上下文只读取本次退款判断所需的证明，不展开支付服务约定（Payment Service Agreement）的全部内部责任。

## 2. 一条链深入，另一条暂缓

### 输入与判断

用户回答：“Q1 的结算凭证已经给出，由结算方负责。Q2 先暂缓，只继续实付依据。”样例材料明确结算方（Settlement Party）是该支撑凭证的责任角色，形成于同一付款（Payment）履约；实际主体仍未知。读取结算凭证（Settlement Evidence）后，仍不能确定其中哪项金额记录对应本次实付，需要追溯它的原始支付记录（Original Payment Record）。该原始记录尚未提供。

Q1 的凭证定位已解决，但它所支撑的实付金额（Paid Amount）仍未充分解释。保留返回支付凭证（Payment Evidence）及退款申请（Refund Application）的关系，继续深入而不是换到无关凭证。Q2 保留原标识和暂缓控制。

### 期望展示

```text
主焦点：明确退款申请（Refund Application）的应退金额（Refund Amount）。
当前位置：订阅协议（Subscription Agreement）→ 退款（Refund）→ 退款申请（Refund Application）〔履约请求〕
责任人：读者（Reader）；实际主体待明确。

并行追溯：
- 支付服务约定（Payment Service Agreement）→ 付款（Payment）→ 结算凭证（Settlement Evidence）〔其他凭证〕；关键项：实付金额（Paid Amount）；责任人：结算方（Settlement Party），实际主体待明确。
- 订阅协议（Subscription Agreement）→ 退款约定（Refund Terms）〔其他凭证〕；关键项：适用版本（Applicable Version），原问题 Q2 继续暂缓；责任人：平台方（Platform Party），实际主体待明确。

实付金额（Paid Amount）的来源已从支付凭证（Payment Evidence）深入结算凭证（Settlement Evidence），还需要定位其原始支付记录（Original Payment Record），才能解释本次金额。找到依据后会回到支付凭证（Payment Evidence），再支撑退款申请（Refund Application）的金额判断。另一条链的 Q2 继续暂缓，不因更换凭证恢复它。

Q3：结算凭证（Settlement Evidence）中的本次实付金额（Paid Amount）对应哪项原始支付记录（Original Payment Record）？
```

### 检查

沿已选链继续向深层来源追溯，不先遍历所有兄弟凭证；主焦点未变，不重复用户故事。结算方（Settlement Party）的责任来自本轮材料，不自动继承支付机构（Payment Institution）的责任。不得将 Q2 换号重新提出。

## 3. 回溯解释原判断，但不宣称退款完成

### 输入与判断

用户补充原始支付记录（Original Payment Record）及其与本次结算条目的对应依据，资料足以解释实付金额（Paid Amount）：“今天停止，Q2 仍暂缓。”直接复用已给材料，不追问已明确信息，不继续扩展支撑方内部业务。

### 期望展示

```text
主焦点：明确退款申请（Refund Application）的应退金额（Refund Amount）。
当前位置：订阅协议（Subscription Agreement）→ 退款（Refund）→ 退款申请（Refund Application）〔履约请求〕
责任人：读者（Reader）；实际主体待明确。

实付金额（Paid Amount）已经追到原始支付记录（Original Payment Record），并核对结算凭证（Settlement Evidence）的对应金额；现在回到支付凭证（Payment Evidence），它对本次实付的证明已有依据。再回到退款申请（Refund Application）时，应退金额（Refund Amount）仍依赖退款约定（Refund Terms）的 Q2，该题继续暂缓。实付依据查清不表示应退金额已经确定，更不表示退款（Refund）已完成。

本轮只聊，未写入文件；按要求停止。
```

### 检查

深入、回溯与责任归属可定位，来源终点不充当责任终点。原 Q2 及未决责任保留，不生成 FM/API，不创建词汇进度字段、隐藏追溯状态或第二份问题清单。只有实际资料解释不充分时才保留缺口，不为了展示循环而补造新凭证。
