# 领域语言进入日常表达

以下均为合成输入与表达样例，不是项目业务事实，不授权编辑业务文件。名称优先复用已有规范映射，缺英文且业务含义明确时直接翻译，不从技术 ID 反推含义。

## 别名输入，规范名称输出

词汇入口中的规范名称是到账证明（Receipt Evidence），`aliases` 包含“银行小票”。付款请求（Payment Request）是另一个已有概念。用户说：“银行小票已经收到，继续核对。”

理解输入指到账证明（Receipt Evidence），后续每次使用完整规范名称：

- 访谈承接：已收到到账证明（Receipt Evidence），接下来核对它对应哪一笔付款请求（Payment Request）。
- 需求故事标题：核对到账证明（Receipt Evidence）。
- 任务标题：校验到账证明（Receipt Evidence）与付款请求（Payment Request）的匹配。
- 测试说明：到账证明（Receipt Evidence）与付款请求（Payment Request）不匹配时拒绝确认。
- 交接：下一轮继续核对到账证明（Receipt Evidence）的匹配依据。

中文输入“到账证明”、英文输入“receipt evidence”、完整名称和别名都命中同一 `term.*`。检索时英文大小写及空白可归一，输出仍使用原规范名称；不另存英文定义，也不在叙述中轮换同义词。引用用户原话时保留原文。

## 同名异义，先定位上下文

付款上下文（Payment Context）的完成（Completion）指到账证明（Receipt Evidence）满足付款请求（Payment Request）的完成规则；交稿上下文（Manuscript Delivery Context）的完成（Completion）指收稿回执（Manuscript Receipt）满足交稿请求（Manuscript Delivery Request）的完成规则。两个条目可有相同双语名称，但业务身份不同。

用户只说“这次完成了”，而当前材料涉及两项履约时，先定位所指上下文。上下文的完整名称、中文部分、英文部分或别名先与当前 Context ID 对齐，再核对概念；不能因中文字符串与 ID 不同就把它当作另一个上下文，也不能把一个完成结论扩展到另一项履约。

## 只读讨论，使用不等于保存

用户说：“沿用已有词汇解释，今天只聊不落盘。”

读取相关条目并用双语规范名称解释，不更新词汇表、FM 或 API。需要指出叫法冲突时说明具体差异，不在交接中声称术语已保存，也不创建 Markdown 或英文词典。

## 缺词时直接翻译，业务含义不清才澄清

用户明确“开箱视频”是连续、未经剪辑地记录拆包及验货过程的视频，没有提供英文。直接使用开箱视频（Unboxing Video），不追问英文名称；若当前获准沉淀且无已有定义，按 standalone 保存完整名称与明确含义。只聊不落盘时也使用同一译名，但不写文件。

用户另提出“有效到账”，却没有说明它与到账证明（Receipt Evidence）的业务区别。当前需要澄清的是有效条件，不是索取英文；不能靠翻译补造有效条件。含义明确后直接翻译。

若 model 条目所引 FM 目标没有业务说明，报告定义缺口，不拿名称代替定义，也不在词汇表补一份。已有单语 FM 标签含义明确时，对话中直接展示双语名称，源标签更正交给 FM 拥有者并遵守模型编辑权限；不借访谈改模型，不把已译名称写成源标签已经保存。

## 名称与来源边界进入同一业务判断

退款申请（Refund Application）的应退金额（Refund Amount）由退款约定（Refund Terms）决定，支付凭证（Payment Evidence）只能证明实付金额（Paid Amount）。这两项数据即使共享原订单（Original Order），也不自动相等。规范名称用来表达这一区别，不把统一语言缩成同义词替换。

未建模定义放在 standalone 的 `name/definition`；落实到 FM 后，保留原 `term.*`，转换为 model 引用，名称从 `label` 解析，定义由目标唯一维护。英文业务名称不取代 `request.refund` 等稳定 ID，责任人与来源链进度也不保存为词汇字段。
