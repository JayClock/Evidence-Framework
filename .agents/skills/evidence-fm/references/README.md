# FM v5 规则索引

本包可以单独安装，所有链接、schemas 和 Python 模块均在包内。API 方法、契约与投影由独立的 `evidence-api` 维护，本包只交接有效 FM 结果。

| 当前任务                                 | 读取                                         |
| ---------------------------------------- | -------------------------------------------- |
| 直接消费 Entity/属性定义、统一表达与更正 | [领域语言](domain-language.md)               |
| 合同约定、请求—确认配对包裹及凭证展开    | [业务分析](business-analysis.md)             |
| 材料不足、来源矛盾                       | [输入复核](input-review.md)                  |
| 当前判断的依据不足、冲突或需要深入       | [来源追溯](provenance.md)                    |
| 最小保存单元、递归责任与范围结束         | [责任范围](responsibility-closure.md)        |
| 当前业务依据到正式表达的映射             | [批次评估](batch-assessment.md)              |
| 增量编辑与检查的执行顺序                 | [编辑流程](editing-workflow.md)              |
| Context、Role、Evidence 等语义           | [语义](semantics.md)                         |
| 创建／修订 JSON，定位对应 Schema         | [结构契约与文件组织](format.md)              |
| 领域对象与业务规则                       | [领域建模](domain-modeling.md)               |
| CEL 表达式                               | [CEL](cel-rules.md)                          |
| 关键数据 lineage 与单据实例              | [追溯与模拟](traceability-and-simulation.md) |
| 正常、边界、异常业务预期                 | [场景校验](scenario-validation.md)           |
| 选择已有表达样例                         | [样例导航](patterns.md)                      |
| 执行真实检查                             | [校验](validation.md)                        |

访谈按领域语言方法直接核对相关 Entity 及其属性，当轮统一表达，并按需读取其他专业参考；不为保存名称启动模型 JSON 生成。问题选择、回答等待和控制状态由访谈任务管理，本包输入复核只输出具体缺口。

业务分析、来源追溯、责任范围与实例执行各自维护方法。字段、类型、枚举和局部必填直接读取 schemas/；format 只导航结构契约并维护文件组织。semantics 解释对象含义并链接跨对象校验，cel-rules 链接规则 Schema 与真实源规则，patterns 只选择已有样例，不再维护第二份结构规范。实际检查与结果记录看 validation；类型与机器结果不替代业务来源或人类确认。

只沿当前任务分支加载，不顺序读取整张索引。tests/ 是 Skill 开发验证材料，不是业务输入，也不从业务入口链接加载；操作说明留在测试目录。
