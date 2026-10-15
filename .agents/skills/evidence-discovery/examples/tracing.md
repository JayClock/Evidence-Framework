# 凭证追溯：判断、找依据、再返回判断

以下为脱敏合成样例，采用通用商品、责任角色和虚构约定，不映射真实平台、行业或交易，不是当前项目事实或已执行评测。名称含义明确时直接翻译英文；问答规则由 [访谈协议](../references/interview.md) 维护。箭头表示为当前判断寻找依据，不表示操作先后。

## 已给材料与本次判断

采购合同（Purchase Contract）的双方为买方（Buyer）与卖方（Seller），实际主体未给。合成约定已明确：卖方（Seller）负责商品交付（Goods Delivery）及交付确认（Delivery Confirmation）；买方（Buyer）负责提供检验记录（Inspection Record），可用验收影像（Acceptance Footage）等证据说明实际状态；卖方（Seller）负责交付规格记录（Delivery Specification Record）、其中引用的外观标准（Appearance Standard）及交付记录（Delivery Record）。证明提供方不因此替代卖方（Seller）的交付责任。

当前只判断收到的商品是否符合约定外观等级（Appearance Grade）。双方认可的约定记录、实际状态的证明来源均未定位；其他交付责任尚未核对。用户允许只聊不落盘，暂不修改模型。

### 第一轮：从判断分开追要求与结果的依据

```text
当前位置：采购合同（Purchase Contract）→ 商品交付（Goods Delivery）→ 交付确认（Delivery Confirmation）〔履约确认〕
责任人：卖方（Seller）；实际主体待明确。

要判断收到的商品是否符合约定外观等级（Appearance Grade），需要把双方认可的要求与实际收到的状态对起来。

请求依据还没有定位到双方认可的记录，因此现在不能拿卖方（Seller）某次单方描述当作交付标准。结果证明也尚未定位；买方（Buyer）负责的检验记录（Inspection Record）能否说明实际状态，可以独立于约定记录先澄清。

Q1：本次约定外观等级（Appearance Grade）以哪份双方认可的记录为准？
Q2：检验记录（Inspection Record）用什么证据说明这次收到的商品状态？
```

两题分别解决比较所需的请求依据与结果证明，不是固定“两题模板”。若材料已说明某侧就直接复用；已知主体、已匹配的订单和无关操作不重问。

### 第二轮：部分回答后沿直接来源深入

用户只答 Q1：“双方认可交付规格记录，已给内容写外观等级为A档，并引用第二版外观标准。标准内容没给。Q2 不知道，继续。”这是部分回答，不等待整组答完。

```text
当前位置：采购合同（Purchase Contract）→ 商品交付（Goods Delivery）→ 交付确认（Delivery Confirmation）〔履约确认〕
责任人：卖方（Seller）；实际主体待明确。

约定外观等级（Appearance Grade）已追到采购合同（Purchase Contract）中卖方（Seller）负责的交付规格记录（Delivery Specification Record），双方认可这份记录。它写的是“A档”，但含义还指向第二版外观标准（Appearance Standard）；没有该版内容，仍不能据此比较实际状态。

检验记录（Inspection Record）的来源 Q2 仍未解决，买方（Buyer）的责任和原问题保留，不把“不知道”当作没有证据。本轮新增的必要未知是已引用标准的含义。

Q3：第二版外观标准（Appearance Standard）怎样界定“A档”？
```

Q1 的来源已经解释，不重问合同如何成立。取得标准后应先解释交付规格记录（Delivery Specification Record），再回到交付确认（Delivery Confirmation），不是另开外观标准的全局调查。

### 第三轮：暂缓一侧，另一侧继续追形成依据

用户答：“Q3 暂缓，只继续实际状态。补答 Q2：检验记录引用了验收影像，影像已给，但目前没有材料说明它对应哪次交付。订单和交付记录已给，买方负责影像、卖方负责交付记录。”

```text
当前位置：采购合同（Purchase Contract）→ 商品交付（Goods Delivery）→ 交付确认（Delivery Confirmation）〔履约确认〕
责任人：卖方（Seller）；实际主体待明确。

实际收到的商品状态，其证明已从检验记录（Inspection Record）追到验收影像（Acceptance Footage），两者都由采购合同（Purchase Contract）的买方（Buyer）负责。影像目前只展示一批商品，尚不能证明就是这次交付。

卖方（Seller）负责的交付记录（Delivery Record）已有这次订单与交付对象的对应依据。现在需要把影像中的商品与该记录对上；这个对应关系可以先查，不必猜测第二版外观标准（Appearance Standard）的内容。Q3 仍暂缓，因此即使实际状态的来源查清，也还不能判断是否符合约定。

Q4：什么依据能把验收影像（Acceptance Footage）中的商品对应到这份交付记录（Delivery Record）？
```

这里深入的是当前数据的形成和对应依据，不是沿操作顺序补问下单、发货或收货步骤。若更正表明对应关系也依赖暂缓的标准，则应重新判断依赖，不再将这条链视为独立。

### 第四轮：逐层返回判断，而非宣布完成

用户提供交付标识的可核对记录，影像中的标识与交付记录一致，足以建立本次对应关系，并更正：“影像只覆盖检验时的可见外观，不能证明所有质量要求。今天停止，Q3 仍暂缓。”

```text
当前位置：采购合同（Purchase Contract）→ 商品交付（Goods Delivery）→ 交付确认（Delivery Confirmation）〔履约确认〕
责任人：卖方（Seller）；实际主体待明确。

交付标识已把验收影像（Acceptance Footage）与卖方（Seller）的交付记录（Delivery Record）对应起来。回到买方（Buyer）的检验记录（Inspection Record），影像可以作为这次检验时可见外观的依据，不能据此证明全部质量要求。

再回到交付确认（Delivery Confirmation），现在能解释一部分实际状态的来源；约定外观等级（Appearance Grade）的第二版外观标准（Appearance Standard）仍因 Q3 暂缓而未明，暂不能比较并判断是否符合约定。这不表示履约完成，也不表示其他交付责任已经核对。

本轮只聊，未修改模型。按要求停止，Q3 原标识与其他未决责任保留。
```

来源查清、凭证证明充分、履约完成与人类追责结束分别判断。正常与争议业务推演仍按 FM 方法进行；跨会话控制见 [控制与恢复](control-and-recovery.md)。
