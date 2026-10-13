# 追溯问答：一条主线，连续承接

以下为合成样例，不是当前项目事实或已执行评测。名称含义已明确，英文直接翻译；规则由 [访谈协议](../references/interview.md) 维护。独立边界见 [控制与恢复](control-and-recovery.md)，不再按每条规则更换业务重演。

## 连续主案例

订阅协议（Subscription Agreement）的双方是读者（Reader）与平台方（Platform Party）；读者（Reader）负责退款申请（Refund Application），平台方（Platform Party）负责退款确认（Refund Confirmation）及退款约定（Refund Terms）。支付服务约定（Payment Service Agreement）的双方是读者（Reader）与支付机构（Payment Institution），支付机构（Payment Institution）对支付凭证（Payment Evidence）及结算结果负责。实际主体均未知，用户允许只聊并继续，不写文件。

主焦点是退款申请（Refund Application）的依据。应退金额（Refund Amount）与退款期限（Refund Deadline）共用退款约定（Refund Terms）的适用版本，版本未知；实付金额（Paid Amount）来自支付凭证（Payment Evidence），其形成依据可以独立追溯。原订单（Original Order）匹配已知，直接复用。

### 第一轮：共同前提与独立证明同轮问

```text
主焦点：明确退款申请（Refund Application）的依据。
当前位置：订阅协议（Subscription Agreement）→ 退款（Refund）→ 退款申请（Refund Application）〔履约请求〕
责任人：读者（Reader）；实际主体待明确。

并行追溯：
- 订阅协议（Subscription Agreement）→ 退款约定（Refund Terms）〔其他凭证〕；关键项：适用版本；责任人：平台方（Platform Party），实际主体待明确。
- 支付服务约定（Payment Service Agreement）→ 付款（Payment）→ 支付凭证（Payment Evidence）〔履约确认〕；关键项：实付金额（Paid Amount）；责任人：支付机构（Payment Institution），实际主体待明确。

应退金额（Refund Amount）与退款期限（Refund Deadline）共同追到了退款约定（Refund Terms），这一共同依据需要定位双方认可的适用版本，不能分别重复追问。支付凭证（Payment Evidence）中的实付金额（Paid Amount）如何形成可以同时说明，不必等版本查清。原订单（Original Order）的匹配已有依据，不重问。

Q1：本次退款适用哪个双方认可的退款约定（Refund Terms）版本？
Q2：支付凭证（Payment Evidence）中的实付金额（Paid Amount）由哪项记录形成？
```

各凭证由所属合同的一方负责；经办人、上传人、证明提供方不能替代合同责任方。这里的支付机构（Payment Institution）不是因出具凭证而成为责任人，而是支付服务约定（Payment Service Agreement）的一方。

### 第二轮：部分回答后重算独立前沿

用户只答 Q1：“双方接受第二版；内容已给，金额与期限分别依赖两个独立补充约定。Q2 不知道，继续。”读取已给内容后承接，不等待整组答完。

```text
主焦点：明确退款申请（Refund Application）的依据。
当前位置：订阅协议（Subscription Agreement）→ 退款（Refund）→ 退款申请（Refund Application）〔履约请求〕
责任人：读者（Reader）；实际主体待明确。

并行追溯：
- 订阅协议（Subscription Agreement）→ 退款约定（Refund Terms）〔其他凭证〕；关键项：金额与期限的补充约定；责任人：平台方（Platform Party），实际主体待明确。
- 支付服务约定（Payment Service Agreement）→ 付款（Payment）→ 支付凭证（Payment Evidence）〔履约确认〕；关键项：实付金额（Paid Amount）的来源，原问题 Q2 未解决；责任人：支付机构（Payment Institution），实际主体待明确。

适用版本已定位，应退金额（Refund Amount）与退款期限（Refund Deadline）各自追到了独立补充约定，可以同时澄清。已答的 Q1 不重问；Q2 保留原标识，不在没有新依据时重复催答。

Q3：应退金额（Refund Amount）依据哪项补充约定确定？
Q4：退款期限（Refund Deadline）依据哪项补充约定确定？
```

如果新事实说明期限依赖金额档位，就重算依赖，延后该期限项，但仍主动寻找其他独立内容，不沿旧问题组机械继续。用户明确要求一次一问时，只选一个必要问题；不把这种控制偏好另写成默认串行模式。

### 第三轮：局部暂缓，获准的来源链继续深入

用户答：“Q3 按本笔实付全额退；Q4 暂缓。Q2 来自已给结算凭证，财务只代表支付机构办理。只继续实付依据。”读取后发现仅缺原始支付记录（Original Payment Record）。

```text
主焦点：明确退款申请（Refund Application）的依据。
当前位置：订阅协议（Subscription Agreement）→ 退款（Refund）→ 退款申请（Refund Application）〔履约请求〕
责任人：读者（Reader）；实际主体待明确。

并行追溯：
- 支付服务约定（Payment Service Agreement）→ 付款（Payment）→ 结算凭证（Settlement Evidence）〔其他凭证〕；关键项：实付金额（Paid Amount）；责任人：支付机构（Payment Institution），实际主体待明确。
- 订阅协议（Subscription Agreement）→ 退款约定（Refund Terms）〔其他凭证〕；关键项：退款期限（Refund Deadline）的补充约定，原问题 Q4 暂缓；责任人：平台方（Platform Party），实际主体待明确。

金额口径已明确为按实付全额退，实际金额仍需要支付依据。实付金额（Paid Amount）已深入结算凭证（Settlement Evidence），还需找到原始支付记录（Original Payment Record）；取得依据后回到支付凭证（Payment Evidence），再支撑退款申请（Refund Application）。Q4 继续暂缓。本轮查找后确实只有一个可问项，不因切换凭证恢复 Q4。

Q5：结算凭证（Settlement Evidence）中的本次实付金额（Paid Amount）对应哪项原始支付记录（Original Payment Record）？
```

### 第四轮：回溯判断，按要求停止

用户提供原始支付记录（Original Payment Record）及匹配依据，足以解释实付金额（Paid Amount），并要求“今天停止，Q4 仍暂缓”。

```text
主焦点：明确退款申请（Refund Application）的依据。
当前位置：订阅协议（Subscription Agreement）→ 退款（Refund）→ 退款申请（Refund Application）〔履约请求〕
责任人：读者（Reader）；实际主体待明确。

实付金额（Paid Amount）已追到原始支付记录（Original Payment Record），并核对结算凭证（Settlement Evidence）的对应金额；回到支付凭证（Payment Evidence），本次实付已有证明依据。再回到退款申请（Refund Application），结合已接受的全额退款约定，金额依据可以解释；退款期限（Refund Deadline）的 Q4 仍暂缓。

金额依据查清不表示退款（Refund）已完成，其他履约与异常责任仍未闭合。本轮只聊，未写文件；按要求停止。
```

来源终点不是责任终点，问题答完也不是全局追责结束。正常与争议的业务推演按 FM 方法进行，不因提问案例合并而省略。
