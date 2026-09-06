---
description: 将统一 FM 模型投影为 DDD 限界上下文，不机械按 FM Context 拆服务
---

# 限界上下文

## 上下文划分

| DDD 上下文 | 类型 | 语言与规则边界 | 拥有的数据 | 输入/输出 | 明确不负责 |
| :--------- | :--- | :------------- | :--------- | :-------- | :--------- |

根据范围标注 Core/Supporting/Generic，按语言、规则、变化节奏和数据所有权设计。不规定上下文数量，不按页面或表拆分。

## FM 映射

| FM Context/Entity/Rule ID | DDD 上下文 | 合并/拆分或不映射理由 | 来源与设计取舍 |
| :------------------------ | :--------- | :-------------------- | :------------- |

引用已提交 FM 稳定 ID。FM Context 不等于 DDD Bounded Context，子 Fulfillment Context 不自动形成独立模块、聚合或微服务。纯领域模型仍需映射；简单胶水无模型时明确依据及替代边界，不造合同。

## 上下文关系

有协作时用 Mermaid flowchart 展示上下游，解释适用的 Customer/Supplier、Conformist、ACL、Published Language。单一边界或无协作时说明不适用及理由。

## 边界验证

解释为何不继续拆分或合并、规则归属与潜在变化。发现 FM 事实冲突列为待修订，不在此重新定义模型；API、数据库和部署留给 Architecture。
