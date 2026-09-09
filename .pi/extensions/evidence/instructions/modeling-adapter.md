# Pi Modeling 执行适配

访谈机制由 evidence-discovery 维护；业务判断、来源追溯、凭证时间与模型案例由 evidence-fm 维护。发现阶段组合 Discovery 入口及 interview 与 FM 的 business-analysis、provenance、scenario-validation，只读使用知识，不加载 FM 生成入口。本文件只规定当前受控任务的交互、存储与提交契约，不维护第二份业务方法。

本项目提供两包，因此专业发现缺任一必需指令时拒绝启动；不会退化为没有建模准则的猜测访谈。这不同于单独安装 Discovery 的通用访谈能力。发现日志中的 candidate／context／fulfillment 仍是工作理解，不是需要与正式 FM 同步的副本。

## 与通用 Skill 的执行差异

当前运行以扩展状态与追加日志为准。通用 Skill 中的默认文档路径、普通对话回答、直接保存候选目录与文件发布建议，在此由下述工具替代。不要直接写 `docs/business/`、`docs/requirements/` 或受保护的 artifacts 来形成并行事实源；也不执行 Skill CLI 来绕过提交管线。自然语言提到停止或更新不代替扩展保存的人工控制事件。

- 发现：`evidence_save_discovery` 保存理解，`evidence_ask_questions` 保存当前问题后停止在 waiting_answer。每轮只问一个核心问题，不捆绑子问题。人工回答来自扩展问答 UI，不由 Agent 代写。
- 用户在菜单选择回答或使用 `/evidence-answer`；Esc 仅关闭界面。未知、排除、跳过和历史更正仍由人工操作。账号由扩展获取，不推断业务角色或批准权限。
- `finish` 仅停止提问并整理；`resume` 恢复问答并重新开放暂缓问题。人工停止后补答不自动恢复问答，不换 Q-ID 追问暂缓缺口。
- 人工 `/evidence-discovery update-model` 才授权 `evidence_finalize_discovery`；先消化新增回答和跳过记录，再提交全历史 Context assessment v1。
- 更新成功后停回发现；人工另选 `/evidence-discovery converge` 才进入需求收敛。统一语言、FM、需求共用 Modeling Gate；普通回答、模型保存和机器通过不是批准。

## 有界上下文与追加记录

优先使用本轮上下文包，不每轮重读完整 current.json、全部历史回答或方法文件。包内摘要遗漏不等于无此事实、已解决或排除；未内嵌的待消化人工输入必须按给定 read offset/limit 全部补读后再保存。

明细缓存 `context-details.md` 与 current.json 可重建，不是独立业务来源。核对 revision，写入后不复用旧行号。历史记录不可改写或删除；revision-N.json 只含本轮事件，不能只读链尾当作完整快照。

`evidence_save_discovery` 接收 expectedRevision、summary、sourceRefs、records：

- 只追加本轮新增或变化，不提交 content 全量快照。记录类型为 scope、position、note、source、candidate、case、context、fulfillment、resolution、withdraw。
- 新对象 supersedes=null；更正／撤回引用 recordHeads 中该对象当前 D-ID，D-ID 由扩展分配。未提及不是撤回，撤回须处理悬空引用。
- candidate 的 label 为 1–40 字符的单行短名称，description 保存完整说明；业务事实、来源解释和局部缺口按 Skill 方法记录，不为技术字段重问用户。
- 六类凭证的类型时间与所有关键数据的业务来源写入 candidate.description／notes，实例时间留给各自实例；不新增发现字段或另一套 DSL。
- 来源仅为 `INPUT`、有效 `SRC-*` 或最新有效 answered `A-*`。D-ID 只追溯 Agent 解释；未知或已更正回答不能支持明确事实。SRC 版本绑定来源摘要，变更材料后须显式更正实际受影响的解释。
- 每次回答、未知、排除或跳过后，先通过 evidence_save_discovery 追加消化结果，再决定下一问；在 summary／notes 说明本次变化、依据及剩余缺口。
- 所有发现工具传当前 expectedRevision，每次保存后采用返回的新版本。普通问答不消耗 maxRounds。

## 业务位置与切片投影

businessView 由 context、fulfillment、position 记录派生，不由 Agent 全量提交，也不是正式 FM。按 Skill 已识别的关系映射，不从技术槽位推断业务事实。

- context：明确 channel／contract／domain；contextRef 引用上下文候选。合同 roleRefs 恰好两个位置；participantRefs、thingRefs、evidenceRefs 分别记录实际参与人／组织、标的物和凭证。
- fulfillment：candidateRef、contextRef、rightHolderRef、obligorRef，以及结构化 requestEvidence、confirmationEvidence、supportingEvidenceRefs、participantRefs、thingRefs 和来源。请求／确认分别表达凭证、形成或提供者、证明作用与类型时间；全未知字段为 null，部分已知保留原依据。
- deadline 保留已识别请求的 start_at／expired_at 类型语义，同时写明尚未明确的确定依据；字段非空不表示来源已解决。
- 后续履约用同一合同内的 parentFulfillmentRef 与 trigger 连接直接前序，不能循环。
- position.current 指向当前 channel／contract／domain 上下文及可选履约／对象；尚无业务位置时 contexts 为空或 current 为 null。
- 问题 target 指向已有上下文及可选履约／对象，尚未定位为 null。界面用 label 展示，F2 与 `/evidence-status` 按需展示说明与来源；不提升候选审核状态。

## 问题身份与解决依据

每个新问题带稳定 gapKey（对象与事实维度）、Q-ID、focus、target、prompt、impact、blocking、sourceRefs。同一缺口复用原 gapKey 与 Q-ID，不因措辞改变、换焦点或暂缓新建。

历史原文未答、未关联有效解决依据且未暂缓的题可沿用原 Q-ID。已答题由人工更正；已有事实充分覆盖未答／未知题时，通过 resolution 关联而非造一条 `A-*`：

- value 为 questionId、conclusion、reasoning、sourceRefs、citations；每个来源均须逐字 quote，来自 `INPUT`、有效 `SRC-*` 或最新 answered `A-*`。
- resolution 是 Agent 解释，不是人工回答、范围排除或业务批准。原问题与人工原话保留，摘录存在的检查不证明解释成立。
- 更正／撤回引用 `resolution:Q-ID` 当前 D-ID。来源文件／版本、引用回答或目标题后续人工回答变化使关联失效；失效不自动恢复停止／暂缓。

## 定稿与需求提交

完整候选可通过 `evidence_check_model_draft` 隔离检查，不覆盖正式 FM、不产生 Gate。

人工更新请求后必须提交覆盖全部有效候选的 assessment；工具格式见 [增量评估协议](incremental-assessment.md)。业务就绪判断沿用 Skill 的具体事实依赖方法，协议负责 Context、facts、requiredFactRefs、affectedFactRefs、remainingScope 与发布覆盖的表示。

统一语言和需求文档通过 `evidence_submit_artifact`，FM 通过 `evidence_submit_fm_model` 提交，不能直接写目标路径。FM 提交完整源 YAML、说明与适用场景，不提交 generated、02-business-patterns.md 或 status.md；确定性结果由扩展运行 canonical Skill 脚本后生成。具体目标路径、版本、来源和模板由当前任务提供。

需求阶段加载 `.agents/skills/evidence-requirements/SKILL.md` 的方法，但输出遵从当前模板的 personas、problem-statement、story-map，以及唯一 acceptance-catalog JSON 契约，不新建另一组 scope／stories 文件。统一语言和 FM 阶段均加载 `.agents/skills/evidence-fm/SKILL.md`，只生成当前指定产物；不再独立生成 DDD 战术文档。

定稿中发现矛盾先保存发现并使旧就绪声明失效；人工停止状态不得直接追问。上一版已发布模型保留；进入下游后须人工回退 Modeling。所有工件和审核状态仍由扩展管理，本次资源迁移不改旧运行、工件、日志或 Gate。
