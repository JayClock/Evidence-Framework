# 上下文焦虑：Agent 在长对话中丢失关键信息

## Bad Smell

上下文焦虑指的是 Agent 在接近上下文限制时的行为退化：匆忙完成、跳过验证、选择简单方案。本项目的样子是：会话前期逐项核对不变量与 CHECK，跑命令、看退出码；到了后期，上下文里已经堆了 FM 全文、API 契约与多份检查记录，它开始跳过 CHECK、把缓存命中的输出当成新运行、把“文件已写入”说成任务完成，急着收尾。

这是模型自身的缺陷，不是提示词能修的行为习惯。把窗口余量告诉它没有用，要求“请仔细检查”也压不住收尾倾向。可观察的规律是：同一个任务、同一个模型，上下文充足时表现正常，长会话末尾明显粗糙。这也是它与惰性生成的区分方法——把同一个任务放进新会话，只加载该任务记录与直接前置，重跑同样的 CHECK；新会话能得出而旧会话跳过的部分，问题在上下文压力，不在任务本身。

本项目的风险面是现成的：单会话连做多个任务，`plan.yaml` 约 280 KB、`api.json` 约 388 KB，任何一次“读全文”都会把占用推高。焦虑一旦发生，模型从“把任务做完”切换到“尽快结束”，而且很难当场察觉——等发现质量不对，已经积累了一批不可信结果。

## Solution

应对方式是双层循环加 checkpoint：外层用 PDCA 给上下文造边界，内层继续执行上下文预算。这套做法在本项目是默认实践，不等问题出现才补：焦虑不挑任务规模，任何会话只要读了一份大文件、查了一堆资料、聊得够久就可能触发；代价是跳过验证后的结果不可信、要重做已完成的步骤，成本只是一个任务结束时压缩一次、写一次存档、读文件前先检索定位。

### 外层：每个周期结束就是一个天然边界

[AGENTS.md](../../AGENTS.md)把外层 PDCA 与内层 `Guides → Action → Sensors → Steer` 分开，并要求“每次只执行一个获授权且就绪的任务；完成后停止”。[双层循环协议](../../.agents/skills/evidence-delivery/references/lifecycle.md)把状态机钉在这条链上：`planned → in-progress → done`，`done` 之前必须有真实证据。长任务因此被切成有界片段，内层不需要背着整个任务的历史继续跑。

上下文焦虑的起点是上下文失去边界。只要允许一个会话从头跑到尾，没有周期、没有存档、没有可以重置的位置，占用就会一路涨到上限；双层循环正是那个把长任务切成有界片段的框架。

### 外层：checkpoint 落在文件里，而不是对话里

本项目没有名为 checkpoint 的字段，存档点就是任务记录本身。课程要求原样保留的四类内容在这里各有落点：

| checkpoint 内容 | 本项目落点                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------- |
| 进度            | `tasks[taskKey].status`（唯一状态位置）与 `compiled.executionOrder`                               |
| 关键决策及理由  | 任务 `guides`/`design`/`dependencyUsage` 与 `executionDiscipline`；检查记录的 `redesign` 决策段   |
| 验证记录        | `tasks[taskKey].observedEvidence`（checkId、command、exitCode、observed）与 `.evidence/checks/`   |
| 未决事项        | `gaps` 的 `statement`/`impact`/`nextAction`（如 `GAP-IDENTITY`、`GAP-DATABASE`、`GAP-SCOPE-CRM`） |

几个细节值得抄下来：

- **决策必须带理由**。一条真实记录写的是“本任务因用户授权解决 `GAP-FND-READER-TEST-FORMAT` 而转为窄范围 `implementation`：只允许修复 `ReaderTests.java` 的格式并复验既有行为”，而不是只写“已修复格式”。理由丢了，下一个会话要么推翻既定决策，要么把已经犯过的错再犯一遍。
- **验证记录必须带命令与退出码**。`observedEvidence` 的一条是 `./gradlew :backend-domain:test --tests ... --rerun-tasks` → `exitCode: 0` → 观察到的结果；`.evidence/checks/` 记的是命令、工具版本、输入 sha256 与 `coverage.checked/notCovered`。没有命令的“已验证”无法恢复。
- **未决事项保持未决**。`GAP-IDENTITY` 写清“可信身份、主体映射、代表权限和实例归属尚未决定”，并给出影响与下一步动作；它不是“以后再说”，而是一条下一个会话能直接读到的边界。
- **结构还能兜底**：`plan_state.py verify` 会把 `done` 但 `observedEvidence` 为空、`blocked` 却没有关联 gap、CHECK 未被 `acceptanceCriteria` 引用报为结构错误。落盘不是自觉，而是检查项。

### 外层：按存档恢复，而不是转发对话

[双层循环协议](../../.agents/skills/evidence-delivery/references/lifecycle.md)的“恢复会话”给出固定动作：读项目宪法、Guides 导航与 Git 差异 → 核对 FM/API 与计划输入 → `plan_state.py verify` → 取结构候选 → 只读该 taskKey、直接前置与所引用来源 → 六项开工检查，通过后才开始。恢复只依赖文件：[Skills 说明](../../.agents/skills/README.md)写明“跨会话读取文件恢复焦点、已知事实、暂缓及停止状态”；[访谈评测](../../.agents/skills/evidence-discovery/evals/README.md)把同一条纪律写成“恢复只交接实际保存文件，不转发旧对话”。

真正需要替换上下文的时机，是发现质量开始下降时：结束当前会话或清空上下文，按最近一次存档继续。项目里这个动作必须由人发起——AGENTS.md 不授权自动暂存、提交、回滚或后台推进，所以重置不会悄悄发生。

### 内层：上下文预算与 subagent 切分

严格的双层循环把内层限制在有界子任务上，但一次子任务要读大文件、查多份资料时，内层同样会逼近上限。而且更难发现：长会话有“前期仔细、后期敷衍”的对照，内层短而独立，草草做完只表现为“结果粗糙了一点”。

落点与[上一讲](<上下文倾倒：信息过多，Agent 反而迷失.md>)相同：读文件前先检索定位、只读相关段落；入口只放索引与摘要；`sourceRefs`/`procedureRefs` 精确到文件与章节；`.evidence/checks/` 只留摘要与 sha256 指针；成功静默、失败完整。装不下的上下文再用 subagent 切分：模型校验、API 设计校验、离线可视化这类需要大量上下文的工作交给拥有独立上下文的 Skill，主循环只拿回落盘结果与摘要——切分靠公开产物而不是转发旧对话，子代理也不拥有计划状态。

### 周期收尾的落盘清单

每个周期结束前问四件事：进度是否只在 `status` 记录，且与 `compiled` 一致；关键决策是否写了理由（`guides`/`design`/`executionDiscipline`）；验证记录是否带精确命令、退出码与观察结果，覆盖与未覆盖是否分开；未决事项是否进了 `gaps` 并关联受影响任务。四件事都落进 `plan.yaml` 后重建只读投影 `review.html`，然后停止。

### 演进触发条件

- 何时替换上下文仍靠人工判断：“质量开始下降”是语义信号，没有传感器；按轮次或占用触发重置的机制尚未内建。
- 存档就是 `plan.yaml` 任务记录与 `.evidence/checks/` 清单，没有独立的 checkpoint 文件或恢复摘要；`plan.yaml` 已约 280 KB，继续增长后可能需要按切片分片或提供只读摘要视图。
- 上下文预算与 subagent 切分是纪律而非门禁：没有单任务读取上限或委派阈值的自动检查；`plan_state.py verify` 只检查结构与状态一致性，不检查上下文质量，也不度量会话占用。
