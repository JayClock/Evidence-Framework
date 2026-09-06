---
name: evidence-domain
description: 编排 Evidence Domain 阶段，从批准需求生成统一语言、统一 FM v3 业务/领域模型以及 DDD 设计投影。用于领域建模、上下文边界、实体/值对象、聚合、一致性边界和领域事件工件；具体 FM YAML、规则与校验使用 evidence-modeling，不重复维护业务事实。
---

# Evidence 统一建模与 DDD 设计投影

在架构与编码之前明确业务事实、语义边界、不变条件和设计缺口。领域、渠道、履约使用同一 FM 格式，不分拆独立领域 DSL。

## 阶段顺序

1. 读取已批准需求及稳定 US/AC ID，生成统一语言，注明来源、上下文语义、例子和非例；数量随范围，不靠凑术语获得完整性。
2. 在统一语言之后，使用 `evidence-modeling` 生成统一 FM v3 模型或有依据的不适用决策。纯领域、纯渠道仍适用，不要求先有合同；有履约才按 Role-first 展开权责。不预先固化 DDD 限界上下文。
3. 从 FM 的范围、Context、Entity 和 Rule 投影 DDD 限界上下文，解释按语言、规则、变化节奏及数据所有权进行的合并/拆分。FM Context 不等于 DDD Bounded Context，也不自动生成模块或微服务。
4. 生成实体/值对象设计，引用 FM 稳定 ID，说明身份、值语义、生命周期、行为与规则执行位置；不把每个 Role/Evidence/Fulfillment 机械映射为实体或聚合。
5. 围绕不变条件形成小型一致性边界，说明聚合根、命令入口、规则何时检查及跨聚合协作；事务是业务一致性要求，不在此选择数据库、Repository 实现、锁或消息设施。
6. 定义过去式业务事实作为领域事件，注明触发条件、载荷语义及消费者。适用时引用 FM Trigger/Evidence；纯领域事件不虚构合同 Role。
7. 记录来源、假设、待决策项及表达 gap，通过 Domain Gate 处理，不新增独立问答或确认基线。

## 唯一事实源与表达缺口

- FM 分片 YAML 是其能表达的业务/领域语义事实源；DDD 文档是有追溯的设计投影，不能悄悄改写已有规则。发现冲突交由修订反馈处理。
- v3 尚无第一等 Command/Operation/状态迁移实体，关系基数和复杂算法也可能无法完整表达。文档明确所需语义、依据、未验证部分和下游验证责任，不伪造 FM 履约填洞。
- 领域模型必须有规则和行为，不是贫血字段清单；但不得为满足文档数量而补造实体、聚合、事件或上下文。
- 极小范围或简单技术胶水可明确某项设计不适用，保留章节并解释依据、影响和替代方案，不输出空白表格充数。
- 不跨 DDD 限界上下文直接共享实体；外部修改通过聚合根，跨聚合通常以 ID 协作。
- 领域事件不等于命令、集成消息或审计日志；重试、排序、消息 Schema、持久化并发机制留给 Architecture。
- 结构/lineage 通过不等于领域状态机模拟通过；具名业务/领域专家评审、机器校验、模拟和软件测试保持独立。

## 工件

按当前 Prompt 每次只生成一个工件：

- `ubiquitous-language.md`
- `fm-model/`：通过 `evidence_submit_fm_model`
- `bounded-contexts.md`
- `entities-and-value-objects.md`
- `aggregates.md`
- `domain-events.md`

Markdown 只通过 `evidence_submit_artifact`，FM 只通过 `evidence_submit_fm_model`；不要直接写 artifacts、reports 或状态。API、数据模型与部署是后续架构投影，不写回 FM。
