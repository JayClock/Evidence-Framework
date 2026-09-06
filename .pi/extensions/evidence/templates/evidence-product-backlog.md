---
description: 生成 Scrum Product Backlog 工件
---

# Product Backlog

## 排序原则

说明业务价值、风险、依赖和学习价值如何影响排序。

## Backlog

| ID  | 用户故事 | Epic | FM 模型引用 | 优先级 | Story Point | 依赖 | 验收就绪 | 目标版本 |
| :-- | :------- | :--- | :---------- | :----: | :---------: | :--- | :------: | :------- |

包含故事地图中的全部用户故事，不改变故事 ID。按可交付价值而不是技术层次纵向排序。填写稳定的 Context/Entity/Rule ID 及适用的 Fulfillment/Evidence/Scenario ID；无相关引用时注明 N/A 和依据。纯领域不是 FM 不适用，领域规则及模型/架构表达 gap 也须追溯到实现和测试。

## 依赖与风险

识别关键路径、可并行项和需要 Spike 的未知项。结合 test-strategy.md 和 test-procedures.md，说明测试环境、真实集成依赖及 Q3/Q4 评价如何影响风险、估算和验收就绪。缺少场景 ID、数据或通过标准的故事应标明阻塞；不要为补齐测试目录增加未经批准的产品能力。
