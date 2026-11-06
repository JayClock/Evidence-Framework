# 领域语言直接来自模型

以下均为合成输入与表达样例，不是项目业务事实，不授权编辑业务文件。名称优先复用当前 Entity 及其属性，缺英文且含义明确时直接翻译，不从技术 ID 反推含义。

## 别名输入，规范名称输出

Entity `confirmation.receipt` 的 `label` 为到账证明（Receipt Evidence），`notes` 说明它证明收款方收到款项，`aliases` 包含“银行小票”。付款请求（Payment Request）对应另一个 Entity。用户说：“银行小票已经收到，继续核对。”

理解输入指到账证明（Receipt Evidence），后续每次使用完整规范名称：

- 访谈承接：已收到到账证明（Receipt Evidence），接下来核对它对应哪一笔付款请求（Payment Request）。
- 需求故事标题：核对到账证明（Receipt Evidence）。
- 任务标题：校验到账证明（Receipt Evidence）与付款请求（Payment Request）的匹配。
- 测试说明：到账证明（Receipt Evidence）与付款请求（Payment Request）不匹配时拒绝确认。
- 交接：下一轮继续核对到账证明（Receipt Evidence）的匹配依据。

中文、英文、完整名称和别名都指向 `confirmation.receipt`，不另存英文定义，不在叙述中轮换同义词。收到凭证不表示匹配通过或付款完成。

## 属性直接表达业务含义

退款申请（Refund Application）的应退金额（Refund Amount）由退款约定（Refund Terms）决定，支付凭证（Payment Evidence）的实付金额（Paid Amount）只能证明实际支付。这两项数据即使共享原订单（Original Order），也不自动相等。

应退金额（Refund Amount）直接由所属 Entity 的属性定义承载：`name` 定位字段，`label` 保存规范名称，`meaning` 解释适用约定及证明边界。判断规则引用该属性，英文业务名称不取代 Entity ID 或属性名，不把来源链进度写成模型属性。

## 同名异义，先定位上下文

付款与交稿两项履约中的确认 Entity 都被称为完成证明（Completion Evidence），但 `contextRef`、Entity ID 和 `notes` 不同：一个证明到账，另一个只证明收到稿件。

用户只说“这次完成了”，而当前材料涉及两项履约时，先定位所指上下文与 Entity，不因同名合并身份，也不把收到稿件推导为质量合格。上下文名称与当前 Context ID 对齐后再判断。

## 只读讨论，使用不等于保存

用户说：“沿用已有模型解释，今天只聊不落盘。”

读取相关 Entity 及其属性，用双语规范名称解释，不更新 FM 或 API。若用户更正到账证明（Receipt Evidence）的含义，定位 `confirmation.receipt`，说明依赖判断及确认失效影响，不创建同义对象绕过编辑权限，不声称定义已更正。

## 缺词时直接翻译，业务含义不清才澄清

用户明确“开箱视频”是连续、未经剪辑地记录拆包及验货过程的视频，没有提供英文，也没有正式模型。直接使用开箱视频（Unboxing Video），不追问英文，不为保存名称提前创建 Entity。

用户另提出“有效到账”，却没有说明它与到账证明（Receipt Evidence）的业务区别。需要澄清的是有效条件，不靠翻译补造条件。模型缺少 `notes` 或属性缺少 `meaning` 时说明定义缺口，不用名称代替业务说明。

新建对象或更正源标签都须具备相应范围的追责结束依据与编辑授权；仅访谈或只读时保留共同理解和待改影响，不把译名写成源文件已经保存。
