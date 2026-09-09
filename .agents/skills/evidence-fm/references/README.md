# FM v3 规则索引

本包可以单独安装，所有链接、schemas 和 Python 模块均在包内。

| 当前任务                       | 读取                                                                |
| ------------------------------ | ------------------------------------------------------------------- |
| 识别业务结构及必要知识缺口     | [业务判断准则](business-analysis.md)                                |
| 材料不足、来源矛盾             | [输入复核](input-review.md)                                         |
| 关键数据与六类凭证时间         | [来源映射](./provenance.md)                                         |
| 部分成熟、部分待定的模型更新   | [批次评估](batch-assessment.md)                                     |
| Context、Role、Evidence 等语义 | [语义](semantics.md)                                                |
| 创建／修订 YAML                | [格式](format.md)                                                   |
| 领域对象与业务规则             | [领域建模](domain-modeling.md)                                      |
| CEL 表达式                     | [CEL](cel-rules.md)                                                 |
| 关键数据 lineage 与单据实例    | [追溯与模拟](traceability-and-simulation.md)                        |
| 正常、边界、异常业务预期       | [场景校验](scenario-validation.md)                                  |
| 已有业务模式或复用主张         | [常见结构](patterns.md)、[模式提取](business-pattern-extraction.md) |
| 执行真实检查                   | [校验](validation.md)                                               |
| 经人工决定迁移旧格式           | [迁移边界](migration-v3.md)                                         |

访谈可只读本索引中的专业参考，不启动模型生成。问题选择、回答等待和控制状态由访谈任务管理，本包输入复核只输出具体缺口。

每项规则在本包按职责维护：结构判断看 business-analysis，业务来源看 provenance，时间与 YAML 结构看 format，运行实例与 CEL 依赖看 traceability-and-simulation，执行结果记录看 validation。类型与机器结果不替代业务来源或具名审核。Schema v3 的实际格式限制以 format 为准，旧模型迁移须另行授权。

只沿当前任务分支加载，不顺序读取整张索引。tests/、evals/ 是 Skill 开发验证材料，不是业务输入，也不从业务入口链接加载；它们的操作说明留在各自目录。
