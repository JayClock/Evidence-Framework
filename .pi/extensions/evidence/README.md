# Evidence Pi Extension

项目级 Pi 扩展，实现 [本地 Evidence 工程工作流](../../../docs/evidence.md)。

## 职责

- 在 `.evidence/state.json` 中持久化工作流状态。
- 按阶段选择模型、思考级别和工具白名单。
- 从原始需求直接生成工件，假设和待决策项交由阶段 Gate 审核。
- 每次生成并校验一个文档工件；架构阶段定义测试策略/工序，计划、编码和审查读取同一测试契约。
- 按需校验、模拟、编译并原子保存 FM Schema v2 履约模型。
- 强制记录真实 Red/Green 检查点并执行最终质量命令。
- 在 Pi TUI 中提供人工 Gate，批准后按阶段/故事隔离 Session。
- 保护状态、Gate、报告及扩展文件，防止 Agent 越权修改。

## 工件驱动与破坏性升级

- `/evidence-init` 保存原始需求后直接开始用户画像工件；Domain 在限界上下文之后直接判断 FM 适用性。
- 无独立访谈、回答命令或基线确认步骤。业务疑点在工件中列明，使用 `/evidence-review` 或 `/evidence-revise` 处理，不把推断当成已确认事实。
- 工作流状态版本为 2，不兼容版本 1。更新后运行 `/reload`；旧运行先 `/evidence-reset`，再 `/evidence-init`，不要手改版本号。
- `.pi/evidence.json` 配置版本仍为 1；FM 的 Schema v2 不受影响。FM 机器校验、场景模拟和具名业务审核保持独立。
- 保留已有 Gate 策略、阶段内工件自动衔接、真实 TDD 和质量失败轮次规则；未增加自动 PDCA 重试或新的 Gate 决策表单。

## 测试契约（第一批）

- Architecture 在数据模型之后生成 `test-strategy.md`、`test-procedures.md`，经原有提交工具和结构校验进入 Architecture Gate。
- Planning 以稳定验收场景 ID、TP-\* 工序 ID 实例化任务并映射 Q1/Q2 测试，提前安排 Q3/Q4 评价；Coding、Review 显式读取两份新工件。
- 不改变状态版本或现有工具。仍仅记录每故事每修订轮的一组故事级 TDD 检查点；逐工序状态、多循环证据和跨工件 ID 语义校验留待后续实现，不将文档约束冒充机器保证。
- 升级后执行 `/reload`。版本 2 的既有运行若缺少新契约或场景 ID，按 [升级说明](../../../docs/evidence.md#33-使用新版测试契约) 回退相关上游阶段修订并重新审核，不手改状态或已批准工件。

## 主要模块

- `index.ts`：Pi 工具、命令、事件和 TUI 集成。
- `phases.ts`：确定性的阶段与工件定义。
- `prompts.ts`：阶段限定的提示词组装。
- `storage.ts`：限定项目根目录的原子持久化。
- `validation.ts`：确定性的 Markdown 检查。
- `modeling.ts`：FM 路径保护、隔离 Python 环境、校验、模拟、编译与原子替换。
- `checks.ts`：有超时限制的命令执行、最终审查验证与报告。
- `gates.ts`：工件/报告摘要与可审计的决策记录。
- `git.ts`：故事开始时的工作区基线与真实文件变更证据。
- `workflow.ts`：阶段/故事流转和上游修订后的 FM 决策失效处理。

FM 校验需要 Python 3.10+，锁定依赖安装在 `node_modules/.cache/evidence-fm-runtime`。可通过 `EVIDENCE_PYTHON` 指定解释器。

从仓库根目录运行验证：

```bash
npm run evidence:verify
```
