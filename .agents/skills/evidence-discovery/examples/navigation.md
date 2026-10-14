# 上下文导航：从现金权责与绩效约定进入

以下为合成样例，双语名称为题设，不是项目业务事实或已执行评测。业务分析由 FM 维护，交互规则由 [访谈协议](../references/interview.md) 维护。

## 1. 已知现金权责，直接承接

读者（Reader）支付专栏订阅费，平台方（Platform Party）按双方接受的专栏订阅合同（Column Subscription Contract）提供付费内容访问。用户要求先追付款完成证明，仅访谈、不生成。

收款对应平台方（Platform Party）提供付费内容的义务，付款对应读者（Reader）取得访问权。依据已经明确，直接进入专栏订阅合同（Column Subscription Contract），承接付款与内容访问两项主要履约，不重复询问已知收支，不先展示总览。定位当前付款请求或确认，继续追金额、收款人及完成证明的必要依据。

这里直接进入是复用现金权责，不是绕过经营依据。只有一个合同名称、一个功能或一句承诺时，先澄清相应收支或内部目标及责任关系，不据此补造合同。

## 2. 沿支付证明发现协作

用户补充：读者（Reader）与支付服务方（Payment Provider）已有移动支付协议（Mobile Payment Agreement），支付服务方（Payment Provider）提供扣款确认（Debit Confirmation）。平台方（Platform Party）的财务经办人（Finance Operator）核对收款，银行另提供到账回执（Credit Receipt）。

增量补入移动支付协议（Mobile Payment Agreement）及其证明关联，不自动切换访谈焦点，也不展开支付服务方（Payment Provider）全部内部责任。扣款不自动等于订阅付款完成，继续核对收款人、金额和采信条件。

财务经办人（Finance Operator）保持代表办理身份，银行保持证明提供方身份，不替代所属合同的一方。若只知道支付系统名称，没有相应约定与责任，不据此制造新合同。

## 3. 没有对外收支，核对内部绩效

用户还提供内部约定：平台方（Platform Party）与编辑（Editor）就每月完成两门专栏上线准备达成编辑绩效协议（Editorial Performance Agreement），每周根据已确认的准备材料检查进度。编辑（Editor）提出下月目标，由主编（Chief Editor）代表平台方（Platform Party）评估是否接受。

从成本结构中的工作产出与进度检查理解该协议，通过目标—实际对比追溯证明；尚无实际偏差也可以分析。不补造按次收费，不把客户资料或任意统计数当成绩效约定。目标提案尚未接受时，不覆盖现行目标；目标设定与进度检查分别核对责任方向。

## 4. 用户要求总览时单独导航

当前还已知内容管理（Content Management）的专栏、文章身份及版本规则，以及尚未接受的企业订阅报价（Enterprise Subscription Proposal）。用户要求看当前上下文并选择下一步，只聊、不生成。

```text
1. 专栏订阅合同（Column Subscription Contract）〔合同〕
   读者（Reader）向平台方（Platform Party）支付订阅费，平台方（Platform Party）提供付费内容访问。
   责任边界：付款、内容访问及约定的异常责任；尚未结束。
   内容标的来自内容管理（Content Management），付款完成需核对外部支付证明。
2. 移动支付协议（Mobile Payment Agreement）〔合同〕
   读者（Reader）委托支付服务方（Payment Provider）执行支付，支付服务方（Payment Provider）按约定提供支付结果。
   责任边界：双方的支付约定；结果用于订阅付款判断，尚未结束。
3. 编辑绩效协议（Editorial Performance Agreement）〔合同〕
   平台方（Platform Party）与编辑（Editor）约定每月两门专栏的上线准备产出，并按周检查实际进度。
   责任边界：目标及进度检查的真实约定；产出支撑内容运营，尚未结束。
4. 内容管理（Content Management）〔领域〕
   提供专栏（Column）、文章（Article）的身份和版本规则，支撑订阅与编辑工作中的标的匹配；尚未结束。
5. 企业订阅协商（Enterprise Subscription Negotiation）〔协商〕
   平台方（Platform Party）与企业客户（Enterprise Customer）就企业订阅报价（Enterprise Subscription Proposal）及回应协商，报价尚未接受；尚未结束。

先分析哪个上下文？
```

总览说明实际现金权责、内部目标及协作，不用经营分类标签代替责任，不表示全部合同已经找到。导航只收集选择，不同时问付款证明、绩效目标或报价条件；不展示出处、内部检查过程或缺口字段表。

## 5. 选择、取消与结束分别承接

选择内容管理（Content Management）时，从当前对象身份或版本规则进入，不因划入领域而删除合同责任，不让领域能力替合同决定完成条件。选择企业订阅协商（Enterprise Subscription Negotiation）时承接报价与回应，不补造已签合同或履约。

用户取消时保留原焦点和原问题，等待输入；仅查看不解除停止或暂缓。选择另一个合同只改变焦点，不恢复其他暂缓题。

已有当前版本人类结束确认的合同仍供查看，但不可直接选择重开。领域／协商结束按实际范围单独确认，不能替关联合同结束；“今天到这里”只是停止。有效结束且有生成权限时才交回 Modeling，本例仅访谈、不生成的限制继续生效，不自动写 FM/API 或保存交接。
