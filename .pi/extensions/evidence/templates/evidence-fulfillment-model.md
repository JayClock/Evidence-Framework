---
description: 判断履约建模适用性并生成可校验的 FM Schema v2 模型
---

# 履约模型要求

依据原始需求和上游领域工件直接判断当前业务是否存在合同、权责、支付、KPI/SLA、验收、异常补偿或审计凭证链。适用性、分析假设及待决策项交由 Domain Gate 审核，不设独立问答前置条件。信息不足不等于“不适用”。

- 不适用时，调用专用提交工具并给出明确理由，不得虚构合同、参与方或金额规则。
- 适用时，按 Role-first 顺序建立 Contract Context、双方 Role、Fulfillment、Request、Confirmation、Trigger 与必要的 CEL Rule。
- 只提交模型定义和验证场景，不提交 `generated/` 派生产物。
- ID 和文件名必须稳定；YAML 一个文件一个文档。
- 对金额、KPI、赔偿、审计或复杂完成策略，至少提交一个正常场景和一个异常或追责场景。
- 机器校验和场景模拟不能代表业务方确认；`stakeholderReview` 默认保持 `pending`。
