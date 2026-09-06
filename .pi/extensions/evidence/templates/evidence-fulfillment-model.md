---
description: 按当前范围生成统一 FM Schema v3 领域、渠道、履约或混合模型
---

# 统一 FM 模型要求

读取原始需求、批准需求和统一语言。先确认当前问题及独立业务/领域语义，再展开存在的上下文；本工件是 Modeling 的最后工件，不读取未来的架构或 DDD 设计。业务/领域不变条件在此定义，软件边界与保障机制由 Architecture 按需映射。

- 领域对象身份、关系、规则和计算使用同一 FM YAML；纯领域和纯渠道允许没有 Contract/Fulfillment，不能因此判不适用。
- 只有简单胶水且无独立业务/领域语义时才提交不适用理由和空文件集；信息不足不是不适用。
- 有履约时按 Role-first 建立父 Contract、两个 Party Role、子 Fulfillment Context、Request interval、确认、触发、完成和异常规则。内部 KPI 与对外合同共用机制。
- v3 要求 Place/Thing 属于 Domain Context；Party 在 Context 外。玩家仅按来源明确建立，系统或调度器不是 Party。
- 规则用 CEL 和 keyData/AST lineage；不自造 Command、状态迁移或关系基数字段，不用假 Fulfillment/Evidence 填表达缺口。
- `README.md` 说明范围、来源、假设、待确认项及 gap；discovery 是发现记录而非正式事实。疑点交由 Modeling Gate，不增设独立问答步骤。无法建立有效范围时明确阻塞，不编造成功模型。
- 有金额、KPI、赔偿、审计或复杂完成策略的单据链，至少提供正常和异常/追责场景。纯领域记录正常、边界和反例及后续 Q1/Q2 验证需求，不能宣称单据模拟器已验证领域对象或状态机。
- 有权责复用主张才提交 `business-patterns/*.yaml`。只提交源 YAML、必要说明和场景，不提交 `generated/`、`02-business-patterns.md` 或 `status.md`。
- `modelStatus` 默认 draft，`stakeholderReview` 默认 pending；机器校验和 Modeling Gate 不代替具名业务/领域专家确认。

最后通过 `evidence_submit_fm_model` 提交全部源文件；不要直接写盘或自行运行派生命令。工具重检统一语言与模型，按配置进入 Modeling Gate；不继续生成独立 DDD 工件。
