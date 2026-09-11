# 组合工作流程

## 文件恢复

新产物统一默认放在项目根的 `.evidence/`，告知以下位置并按需创建；已有文件与用户显式指定路径优先，不自动迁移：

- `.evidence/discovery.md`：来源、回答、工作理解、实际问题、暂缓与停止状态；需要独立问题文件时用 `.evidence/questions.md`。
- `.evidence/fm/`：正式 FM 源模型与说明，含术语、验证场景及可重建的 generated 输出。
- `.evidence/fm-candidates/<批次>/`：编辑中的完整候选。
- `.evidence/.fm-work/`：发布 CLI 冻结的候选和准备结果。
- `.evidence/fm-checks/`：已引用的检查与发布记录。

候选、正式模型和发布工作目录保持分离，不能相同或互相包含。另行使用 `fm-api-design` 时，API 设计放在 `.evidence/api/api.yaml`，投影放在 `.evidence/api/generated/<批次>/`；本入口不自动执行 API 设计。

恢复时读取文件而不是猜测旧会话。`discovery.md` 至少应指出当前业务对象、已消化来源、实际问题、暂缓、明确停止、正式模型／候选／检查记录位置及下一步选择。它不复制正式模型正文，也不维护第二套状态仓库。

## 讨论与澄清

定位 `evidence-discovery` 并遵循其访谈与保存方法。未形成模型也可以先问必要业务问题；一次回答中的所有事实和更正都要消化。写入失败时明确回答尚未保存并停止推进，不能继续提问。

停止不会因后续材料自动解除；暂缓问题沿用原 Q-ID 与 gapKey，不换标识重问。材料已经足够时更新交接后停止，不为凑流程提问。

## 候选与只读检查

定位 `evidence-fm`。只校验时对用户指定模型运行其只读检查器，报告真实退出状态、场景执行数和 `simulationPassed`；不修改预期来取得通过。

生成模型时先按 FM 方法评估 ready、support 与 pending，再按 Context／Role／责任边界、Evidence 主线与类型时间、Evidence→Thing、Other Evidence→Evidence、CEL Rule、Evidence Instance／`basedOn` 的顺序，在工作目录形成保留现有有效内容的完整候选。Fulfillment 仅作为 Context；无业务依据的 Evidence 顺序列为未决，不自动排序。调用 FM 包内发布 CLI 的 `prepare`，展示：

1. 正式目标和准备结果标识；
2. 候选、目标及声明来源摘要；
3. 全部增加、修改和删除文件及完整差异；
4. Schema、CEL、lineage、simulation 与 timeline 的真实检查结果和实际执行场景；
5. Evidence 时间线摘要、来源时间和未决顺序；
6. 尚未纳入或仍阻塞的业务缺口。

没有可纳入职责时只保存评估和缺口。纯领域或渠道仍可建模；没有场景时不宣称模拟通过。

## 保存候选

只有用户明确授权保存当前已展示的准备结果，才运行 FM 发布 CLI 的 `apply`。如果用户直接说“保存”但没有可确定的已展示准备结果，先说明缺少绑定对象，不套用旧确认。候选、来源、目标或准备结果变化后重新准备并再次展示。

`applied` 和 `noop` 是文件结果，不是业务审核。`conflict`、`validation_failed` 或 `recovery_required` 按原状态报告；恢复命令只处理文件事务。保存完成后更新发现交接中的正式模型和检查记录指针，不自动开始其他工作流。

## 界面降级

交互适配器可用时，它只收集回答、暂缓／停止选择或展示准备结果；标识和业务字段仍由当前记录与 Agent 提供。无界面、RPC 不支持某项显示或面板关闭时，转为普通对话：完整展示必要信息并等待用户输入，不伪造选择，不主动发送下一轮。
