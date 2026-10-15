# 用 CEL 表达有依据的业务规则

业务依据决定要表达什么，CEL 只负责确定性计算和判断。Rule 的 JSON 结构、种类、绑定声明和目标字段直接读取 [Rule Schema](../schemas/rule.schema.json)，属性结构读取 [Entity Schema](../schemas/entity.schema.json)；本页不维护另一份字段模板或类型列表。

## 先写业务解释，再写表达式

说明规则读取什么事实、怎样判断或计算、结果在业务上意味着什么。使用 [领域语言](domain-language.md) 中的规范名称，具体 Entity ID 独立标注，不让 ID 充当英文名称；说明不只复述标题或表达式，也不包含技术实现方案。

期限、比例、资格和例外必须有来源，未知就保留缺口，不用示例公式或恒真表达式填洞。分析依据不足时回到 [来源追溯](provenance.md)，保存权限与检查顺序见 [编辑流程](editing-workflow.md)。

## 选择已有规则样例

只读当前需要的实际源文件，金额、期限与预期均为合成条件，不是生产默认规则。

| 要表达的判断                   | 可运行样例中的 Rule                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| 从约定取得请求金额             | [金额派生](../examples/valid-traceable-subscription/rules/rule--payment-request-amount.json)    |
| 按已有约定计算截止             | [时间派生](../examples/valid-traceable-subscription/rules/rule--payment-deadline.json)          |
| 核对金额、币种与实例结果       | [结果匹配](../examples/valid-traceable-subscription/rules/rule--payment-matches-request.json)   |
| 集合结果与请求时段共同判断完成 | [履约完成](../examples/valid-traceable-subscription/rules/rule--content-payment-completed.json) |
| 截止后的违约判断               | [违约判断](../examples/valid-traceable-subscription/rules/rule--payment-expired.json)           |
| 没有合同的领域行为条件         | [档案可编辑](../examples/domain/rules/rule--profile-editable.json)                              |

不复制一份 Markdown JSON 样例；维护时直接修改获授权的真实模型或样例源，再检查其引用与场景。

## 绑定与派生

绑定把表达式变量对应到已建模对象或明确的运行时输入，变量别名不是属性名。集合绑定须与集合访问方式一致；不能把没有凭证的情况伪装为一份全空确认。

CEL 是表达式，不执行赋值、SQL、网络调用或状态迁移。派生值的目标在 Rule 中声明，属性引用同一派生规则；判断规则不伪装成数据生产边。关键持久数据必须追回已建模输入，不能藏在无业务来源的自由参数里。

规则语法、声明变量、目标归属及结果类型的检查见 [validate_rules](../scripts/fm_model.py)；派生指针一致性见 [validate_derived_attributes](../scripts/fm_model.py)；属性读取、集合访问和依赖环见 [analyze_traceability](../scripts/fm_traceability.py)。不另建手写属性依赖表。

## 类型能力与运行边界

- Schema 接受某种声明类型，不等于当前 CEL 运行库支持该类型的全部运算；语法编译也不等于具体场景已经求值。
- 金额优先拆分最小货币单位整数与币种；精度、舍入、汇率和比例仍须来自业务依据。不要假定运行库具备项目所需的原生 Money 运算。
- 时间类型、适用口径和实例值分开处理；场景时间固定，不能读取机器当前时间来生成持久关键值。
- 领域前置条件和状态属性不会自动形成操作或状态机；当前凭证模拟器不执行领域对象实例与通用关系实例。不能通过假履约或假凭证扩大验证能力。

实际输入、求值和预期比较按 [实例执行](traceability-and-simulation.md)，统一运行与结果报告按 [校验](validation.md)。结果不符先查模型映射、场景构造和实现；只有业务来源确已更正时才修改预期。
