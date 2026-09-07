# 上游来源与 Evidence 适配

- 来源：<https://github.com/JayClock/.agents/tree/523284947e689924a6a4a6686327bf9569871386/skills/modeling>
- 固定提交：`523284947e689924a6a4a6686327bf9569871386`（统一领域、渠道与履约范围）。
- 版本：FM / 8X Flow Schema v3；不兼容 v2，不自动猜测迁移事实。

## 本地维护边界

references、schemas、scripts、tests 和 evals 以该提交为基线，保留上游语义及测试，并按本地 lint/格式规范整理。

本地适配：

1. `SKILL.md` 保留名称 evidence-modeling。Evidence v6 从 Init 直接进入交互发现，以 8X Flow 权责与四色凭证/数据追溯、案例回放共同迭代术语和模型。问题与人工回答通过扩展持久化，完整草稿可隔离检查；定稿后生成软件范围及 US/AC，共用 Modeling Gate，不再有前置 Requirements 阶段。模型路径为 artifacts/02-modeling/fm-model，Schema v3 不变；DDD 设计映射留给 Architecture。禁止 Agent 直接写 artifacts 或伪造人工回答。
2. `validate_fm_model.py --model-only` 保留本地扩展入口，将模型校验与单据模拟分开记录。默认 CLI 仍验证提交的 validation 套件。数值转换报告明确错误上下文，role-play 清理失败返回可读错误；不放松 Schema 验证。
3. `modeling.ts` 白名单允许单层 discovery Markdown/YAML 与业务模式 YAML，拒绝派生文件；扩展统一执行业务模式文档生成。
4. 无适用单据场景不冒称模拟成功；领域运行时行为仍由下游 Q1/Q2 验证。人工状态以模型源文件为准，不由状态页复制或提升。
5. evals 路径适配 `.pi/skills/evidence-modeling`，准备时把上游 `$modeling` 提示引用替换为 `$evidence-modeling`；保留原始场景要求作为独立建模基准，不将它当作 Evidence Gate 流程验收。runner 是独立开发工具，不在活跃产品任务中直接写生成工件。

## 同步与验证

后续升级需整体比较 Schema、加载器、CEL、模拟器、fixtures 和 compiled schema，重新应用本地适配并运行 `npm run evidence:verify`。不得只替换 SKILL.md 或只改 schemaVersion。

工作流集成测试与 Python 合成案例是确定性回归，不等于真实 Agent 生成质量对照评测、具名业务确认或人工 TUI 端到端验收。本轮未运行外部 Agent 基准。
