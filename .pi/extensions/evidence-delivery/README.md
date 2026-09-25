# Pi 独立交付

主 Agent 负责外层 PDCA 与唯一归档；`evidence_worker` 启动独立执行会话，`evidence_review` 再启动独立只读审查会话。两个工具都不更新业务记录、计划、审核页或任务状态。

## 启用与权限

在可信项目中启动 Pi，加载本目录 `index.ts`；已有会话通过 `/reload` 加载。运行环境需在 PATH 中提供支持 `--no-session`、`--no-extensions`、`--tools` 的 `pi` CLI。模型和 thinking 由当前主会话传入，不更改用户配置或安装软件。

读写工具权限直接在 subagent 定义中配置，调度器读取 frontmatter 的 `tools`，不维护第二份工具权限表：

- [worker](../../agents/evidence-worker.md)：read、bash、edit、write、grep、find、ls。
- [reviewer](../../agents/evidence-reviewer.md)：read、grep、find、ls。

每次都是新的 Pi 子进程与内存会话，不续接、fork 或传递父会话历史。关闭子进程自动发现的扩展、Skills 和提示模板，避免继承主 Agent 的调度工具；必要 Skill 方法通过明确文件引用读取。项目 AGENTS 仍生效，子 Agent 不拥有归档权。

这是工具级角色分工，不是文件系统沙箱：worker 的 bash 仍有调用者权限，唯一归档依赖角色协议。范围/工作树核对是交付检查，不能阻止写入发生；检测到异常只报告并保留证据，不自动回滚。

## 单任务调用

主 Agent 先按 [delivery Skill](../../../.agents/skills/evidence-delivery/SKILL.md)完成授权、来源与就绪检查。实际实施开始时由主 Agent 设置 in-progress，再调用：

```json
{
  "taskKey": "当前计划中的精确 taskKey",
  "assignment": "本轮原始授权、目标、非目标、验收与停止条件；原话来源可定位",
  "sourceRefs": ["docs/plans/smart-domain/plan.yaml", "docs/requirements/stories.md"],
  "allowedFiles": ["本任务允许修改的精确项目相对文件路径"]
}
```

以上为 `evidence_worker` 参数。路径不接受目录通配符；sourceRefs 是文件路径，章节和来源 ID 放在 assignment。Harness 维护没有业务 DAG 时使用明确的维护标识与用户授权，不创建虚假的业务任务。

工具返回 `runDir`、报告和变更文件。主 Agent 检查 worker 交付，再向 `evidence_review` 传：

```json
{ "workerRun": "上一次 worker 返回的 runDir 绝对路径" }
```

reviewer 从任务包、实际产物与 worker 原始日志独立核验，不继承 worker 会话。worker 结束后工作树变化会拒绝旧交付；修复必须在同一授权任务中重新派发 worker，再另启 reviewer。没有子 Agent 能力时阻塞，不回退成主 Agent 自做自审。

## 临时交接与归档

每次调用在系统临时目录创建显式返回的运行目录，保存任务包、subagent 提示、工作树摘要、JSONL 原始事件、stderr 和 result.json。它不是业务事实源、长期知识库或隐藏进度。快照覆盖 Git 索引列出的文件及非忽略的未跟踪文件，比较内容与文件模式；不证明 ignored 构建目录、Git 元数据或外部文件未变。

运行成功仅表示拿到待核验交接：进程非零退出、模型 error/aborted、无最终回答、损坏事件、超时、中止或越界改动均报告失败并保留完整日志。调用限时 30 分钟，同一主会话不能并发委派共享工作树。取消会终止子进程组；多个独立主会话间仍需人工协调，工具不提供跨会话锁。

worker 的 CHECK 声明仍需对照原始日志，不以模型填出的退出码证明真实执行。reviewer 只有读取工具，不声称重跑命令；需要重跑时交主 Agent 安排。主 Agent 归档前必须再次核对受审文件、来源与 CHECK 环境未变化；不能仅凭 reviewer 的“满足”设置 done。

主 Agent 按[生命周期协议](../../../.agents/skills/evidence-delivery/references/lifecycle.md)整合两份交接，只把有依据且有授权的结果写入任务 observedEvidence、guides/design、gaps/status 或相应权威位置，再 verify 并重建审核页。工具不提供自动批准或自动推进。

临时目录可能由操作系统清理。主 Agent 归档前按实际授权保留必要、脱敏的原始证据，记录摘要与稳定指针；临时路径不能成为唯一的长期证据。整合失败或未保存必须明示，不能自动清理失败日志，也不把完整事件流复制进 plan.yaml。

## 验证

仓库根运行 `npm run evidence-delivery:verify`；测试覆盖独立启动、工具权限来源、只读审查、工作树新鲜度、错误结果、中止与单会话互斥。进程替身测试不证明真实模型遵守协议；Agent 行为评测见 delivery 的 [evals](../../../.agents/skills/evidence-delivery/evals/README.md)。项目总门禁另运行 npm test、npm run lint、npm run build 和 npm run guides:verify。
