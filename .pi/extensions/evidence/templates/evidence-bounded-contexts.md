---
description: 生成 DDD 限界上下文工件
---

# 限界上下文

## 上下文划分

| 上下文 | 类型 | 核心职责 | 拥有的数据 | 输入 | 输出 | 明确不负责 |
| :----- | :--- | :------- | :--------- | :--- | :--- | :--------- |

划分 3～6 个上下文；类型标注为 Core/Supporting/Generic。边界必须按语言、规则和数据所有权定义。

## 上下文关系

使用 Mermaid `flowchart` 展示上下游关系，并在正文解释 Customer/Supplier、Conformist、ACL、Published Language 等适用模式。

## 边界验证

列出每个边界可能发生变化的原因，以及为何不应合并或继续拆分。
