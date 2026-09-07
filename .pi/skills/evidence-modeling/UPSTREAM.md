# 上游来源与 Evidence 适配

- 来源：<https://github.com/JayClock/.agents/tree/523284947e689924a6a4a6686327bf9569871386/skills/modeling>
- 固定提交：`523284947e689924a6a4a6686327bf9569871386`（统一领域、渠道与履约范围）。
- 版本：FM / 8X Flow Schema v3；不兼容 v2，不自动猜测迁移事实。

## 本地维护边界

references、schemas、scripts、tests 和 evals 以该提交为基线，保留上游语义及测试，并按本地 lint/格式规范整理。

本地适配：

1. `SKILL.md` 保留名称 evidence-modeling。Evidence v6 从 Init 直接进入交互发现，以 8X Flow 权责与四色凭证/数据追溯、案例回放共同迭代术语和模型。本地 `references/discovery-workshop.md` 重构为上下文识别引导指南，由发现提示词直接加载：合同先识别双方约定与履约项，领域先识别对象身份与规则，渠道沿真实协商凭证；三者可组合，范围是发现成果而非前置问卷。当前状态 v6、FM v3 不变；问答主界面使用发现快照 v3，以 contractView 引用候选合同、双方角色及履约权责，问题 target 对齐讨论项；工程进度仅按需查看。逐问 interaction 控制全部必填，移除旧 position 导航及缺字段回退，不兼容或迁移 v1/v2 快照。问题与人工回答通过扩展持久化，完整草稿可隔离检查；定稿后生成软件范围及 US/AC，共用 Modeling Gate，不再有前置 Requirements 阶段。模型路径为 artifacts/02-modeling/fm-model，Schema v3 不变；DDD 设计映射留给 Architecture。禁止 Agent 直接写 artifacts 或伪造人工回答。
2. `validate_fm_model.py --model-only` 保留本地扩展入口，将模型校验与单据模拟分开记录。默认 CLI 仍验证提交的 validation 套件。数值转换报告明确错误上下文，role-play 清理失败返回可读错误；不放松 Schema 验证。
3. `modeling.ts` 白名单允许单层 discovery Markdown/YAML 与业务模式 YAML，拒绝派生文件；扩展统一执行业务模式文档生成。
4. 无适用单据场景不冒称模拟成功；领域运行时行为仍由下游 Q1/Q2 验证。人工状态以模型源文件为准，不由状态页复制或提升。
5. evals 路径适配 `.pi/skills/evidence-modeling`，准备时把上游 `$modeling` 提示引用替换为 `$evidence-modeling`；保留原始场景要求作为独立建模基准，不将它当作 Evidence Gate 流程验收。runner 是独立开发工具，不在活跃产品任务中直接写生成工件。新增 `evals/discovery/` 是本地交互发现评测，不交给完整 FM 生成 grader，也不伪造人工答案。

6. 本地收紧 Evidence 类型时间契约：rfp／proposal／fulfillment_request 必须显式声明 start_at、expired_at，contract 必须有 signed_at，fulfillment_confirmation 必须有 confirmed_at，other_evidence 必须有 created_at；全部 required/keyData timestamp。最终 Entity 源 YAML 与 compiled schema 均检查，不由加载器或编译器自动补齐。Request interval 固定引用 start_at／expired_at，废止 openEndedReason；无确定截止依据不得定稿。Schema 版本仍为 3.0，但旧 camelCase 时间模型与无期限写法不兼容，需人工核实后受控修订，工具升级不改既有业务工件。发现指南在首轮加载此知识，未知依据保持阻塞；普通合成 fixtures 同步更新，不改变原正常／异常预期。

7. 业务属性名从允许任意 CEL 标识符收紧为小写 snake_case；Entity、Rule target、Instance values 直接键和 lineage Schema 一致，内存模型亦检查所有 Entity category。协议键、CEL 别名／内置函数与外部自由 map 数据不改名。源缺陷直接拒绝，不隐式改名；旧工件经受控迁移。`format.md` 统一两空格缩进及属性键顺序，但不把排版变成模型有效性条件。合成数据与 CEL／实例／预期引用同步更新；原始 eval 输入保留外部字段名以检查显式映射。

## 同步与验证

后续升级需整体比较 Schema、加载器、CEL、模拟器、fixtures 和 compiled schema，重新应用本地适配并运行 `npm run evidence:verify`。不得只替换 SKILL.md 或只改 schemaVersion。

工作流集成测试与 Python 合成案例是确定性回归，不等于真实 Agent 生成质量对照评测、具名业务确认或人工 TUI 端到端验收。本轮未运行外部 Agent 基准。
