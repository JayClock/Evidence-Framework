# 上游来源与 Evidence 适配

- 来源：<https://github.com/JayClock/.agents/tree/523284947e689924a6a4a6686327bf9569871386/skills/modeling>
- 固定提交：`523284947e689924a6a4a6686327bf9569871386`（统一领域、渠道与履约范围）。
- 版本：FM / 8X Flow Schema v3；不兼容 v2，不自动猜测迁移事实。

## 本地维护边界

references、schemas、scripts、tests 和 evals 以该提交为基线，保留上游语义及测试，并按本地 lint/格式规范整理。

本地适配：

1. `SKILL.md` 保留名称 evidence-modeling。Evidence v6 从 Init 直接进入交互发现，以 8X Flow 权责与四色凭证/数据追溯、案例回放共同迭代术语和模型。本地 `references/discovery-workshop.md` 重构为上下文识别引导指南，由发现固定系统上下文完整加载，不逐轮复制进任务历史：合同先识别双方约定与履约项，领域先识别对象身份与规则，渠道沿真实协商凭证；三者可组合，范围是发现成果而非前置问卷。当前状态 v6、FM v3 不变；发现采用只追加日志 v4：Agent 每轮提交新增、更正或撤回记录，更正显式引用当前 D-ID，不提交完整快照。问题、人工回答／更正、控制和机器检查分别追加，历史不可改写或删除。contractView 和 interaction 由日志重放生成，问题 target 对齐讨论项；工程进度仅按需查看。不兼容或迁移旧快照。不新增独立查询工具，扩展自动提供有界轮次包、带 read 行号的 context-details.md 和完整 current.json；按需使用已有 read，缓存不纳入 Gate 或作为业务来源。请求级 context 投影收束本运行的旧发现轮次，不删除原始会话、人工消息或日志，不拆开工具调用对；未内嵌的新人工输入必须明确补读。内部仍完整校验和重放日志，不声称做了增量重放或限制整个会话 token。问题与人工回答通过扩展持久化，完整草稿可隔离检查；定稿后生成软件范围及 US/AC，共用 Modeling Gate，不再有前置 Requirements 阶段。模型路径为 artifacts/02-modeling/fm-model，Schema v3 不变；DDD 设计映射留给 Architecture。禁止 Agent 直接写 artifacts 或伪造人工回答。
2. `validate_fm_model.py --model-only` 保留本地扩展入口，将模型校验与单据模拟分开记录。默认 CLI 仍验证提交的 validation 套件。数值转换报告明确错误上下文，role-play 清理失败返回可读错误；不放松 Schema 验证。
3. `modeling.ts` 白名单允许单层 discovery Markdown/YAML 与业务模式 YAML，拒绝派生文件；扩展统一执行业务模式文档生成。
4. 无适用单据场景不冒称模拟成功；领域运行时行为仍由下游 Q1/Q2 验证。人工状态以模型源文件为准，不由状态页复制或提升。
5. evals 路径适配 `.pi/skills/evidence-modeling`，准备时把上游 `$modeling` 提示引用替换为 `$evidence-modeling`；保留原始场景要求作为独立建模基准，不将它当作 Evidence Gate 流程验收。runner 是独立开发工具，不在活跃产品任务中直接写生成工件。新增 `evals/discovery/` 是本地交互发现评测，不交给完整 FM 生成 grader，也不伪造人工答案。

6. 本地收紧 Evidence 类型时间契约：rfp／proposal／fulfillment_request 必须显式声明 start_at、expired_at，contract 必须有 signed_at，fulfillment_confirmation 必须有 confirmed_at，other_evidence 必须有 created_at；全部 required/keyData timestamp。最终 Entity 源 YAML 与 compiled schema 均检查，不由加载器或编译器自动补齐。Request interval 固定引用 start_at／expired_at，废止 openEndedReason；类型模型允许非派生时间属性，不要求先有固定时长或生成公式，实例仍须提供确定时间值。Schema 版本仍为 3.0，但旧 camelCase 时间模型与无期限写法不兼容，需人工核实后受控修订，工具升级不改既有业务工件。发现指南在首轮加载此知识并直接展开已识别凭证的类型时间，类型结构通过不等于业务来源充分，来源或规则缺口影响判断时仍保持阻塞；六类均补逐类型示例和非派生时间的模型／lineage／编译回归，时刻凭证不套请求区间，不互换必备属性，不默认签约等于生效、确认等于回调、凭证形成等于原事件发生。普通合成 fixtures 同步更新，不改变原正常／异常预期。

7. 业务属性名从允许任意 CEL 标识符收紧为小写 snake_case；Entity、Rule target、Instance values 直接键和 lineage Schema 一致，内存模型亦检查所有 Entity category。协议键、CEL 别名／内置函数与外部自由 map 数据不改名。源缺陷直接拒绝，不隐式改名；旧工件经受控迁移。`format.md` 统一两空格缩进及属性键顺序，但不把排版变成模型有效性条件。合成数据与 CEL／实例／预期引用同步更新；原始 eval 输入保留外部字段名以检查显式映射。

8. 本地发现交互统一事实覆盖与提问决策：合同／凭证、领域身份、渠道、计算、异常及回放均先复用已有事实与确定性推导，不把技术映射或 FM 表达缺口转成业务问卷。新问题带稳定 gapKey，同一缺口不换 Q-ID；已有 v4 无 gapKey 的历史问题保持原文。新增只追加 resolution 关联原始事实、逐字摘录与问题，生成可重建 questionResolutions 视图，不生成 A-\*，不作人工决定。来源版本／文件、引用回答或原题后续回答变化使关联失效，修订／撤回按当前 D-ID，不自动恢复问答；摘录存在不等于语义证明。状态 v6、日志 v4、FM v3 保持不变，不迁移或改写现有日志／工件。

9. 发现指南将类型展开、业务来源核对和派生发现合并为一个四色循环，覆盖所有关键数据，不以疑似派生为入口。直接记录、引用已有值、规则派生、来源待明确仅是现有 description／notes 的业务说明，不新增类型、枚举、DSL 或发现状态。类型存在、asserted 标签、合成模拟和机器 lineage 通过不能替代业务来源；resolution 只能由充分业务事实覆盖原题，不再允许仅凭“规定时间”加类型展开解除期限来源问题。非派生时间仍可通过结构校验；来源缺口按业务影响处理，人工控制、旧记录和 Schema／lineage 分类保持不变。

## 同步与验证

后续升级需整体比较 Schema、加载器、CEL、模拟器、fixtures 和 compiled schema，重新应用本地适配并运行 `npm run evidence:verify`。不得只替换 SKILL.md 或只改 schemaVersion。

工作流集成测试与 Python 合成案例是确定性回归，不等于真实 Agent 生成质量对照评测、具名业务确认或人工 TUI 端到端验收。本轮未运行外部 Agent 基准。
