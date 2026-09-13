# 文件

- [FM 到实现映射](domain-mapping.md) - 把业务 FM 的 Entity、Description、ContextRole、Evidence/Request/Confirmation 桥接到 smart-domain Java 落点，并固定命名/字段追溯与“业务逻辑不得进入 Resource、Mapper、Service”的映射纪律。
- [权威来源与前馈](evidence-sources.md) - 说明 Evidence 仓库的单一职责来源模型：业务事实、API 设计、软件范围、架构基线与计划/任务状态各自唯一维护，前馈按任务装配这些来源；生成产物与当前代码不是新的事实源，写入、机器检查与业务批准相互独立。
