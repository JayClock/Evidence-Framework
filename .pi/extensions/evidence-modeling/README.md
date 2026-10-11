# Evidence Modeling 交互适配器

该项目级 Pi 扩展只提供一个命令和一个问答工具。Agent 按 Skill 核对人类追责结束依据及编辑授权后编辑项目文件、运行校验并展示差异；扩展不维护业务状态、不读写模型、不执行版本操作。外层交付循环由 `evidence-task-planning`、`evidence-delivery` 和仓库中的计划文件承担，不在扩展中增加自动推进或私有状态。

## 命令

```text
/evidence-model <目标>  # 转发原生 /skill:evidence-modeling
/evidence-model         # 访谈并沉淀领域语言／生成或修改模型与 API／只校验模型与 API／生成联合审核页／返回
```

- 访谈并沉淀领域语言：填写目标，保存发现记录并当轮更新已明确术语的统一词汇表；不修改模型 JSON、关系、规则、验证场景、API 或实现。
- 生成或修改模型与 API：填写目标，一次授权 FM、整体 API 与联合审核页；由 Skill 先核对全部主履约及各层异常的终点和人类明确确认全部追责结束的依据，满足后依次执行 FM → API → 联合审核。入口转发不保证准入已满足，不自动批准。
- 只校验模型与 API：只读检查，不写任何项目文件，不生成审核页。
- 生成联合审核页：从当前 FM 与 API 生成同一审核页，不编辑设计源；缺 API 不生成 FM 单独页面。
- 返回、关闭或空白目标：不发送消息。

先确认宿主已发现 `evidence-modeling` Skill，再以 `expandPromptTemplates: true` 转发。资源缺失只提示安装问题，不创建业务问题。组合分支的 FM/API/Visualization 资源与依赖检查由 Skill 在编辑前完成；扩展不执行流水线。带参数目标原样转发，明确只修改 FM 等更窄限制由 Skill 遵守。新布局由 Skill 定义，不在扩展中复制路径配置。

## `evidence_ui_question`

Agent 提供 `questionId`、`gapKey`、`position`、`known` 和 `prompt`。`position` 是当前业务位置：

- 履约：`kind: fulfillment`，以及 `contract`、`fulfillment`、`point: request / confirmation`。
- 合同识别：`kind: contract` 与 `contract`。
- 协商／领域：`kind: negotiation / domain`、`context` 与 `object`。
- 未定位：`kind: unlocated`，不补造合同或履约。

`known` 是当前节点已明确事实的短列表，允许为空；`prompt` 是一个必要问题。选择动作和多行回答编辑器都展示：

```text
当前位置：<合同名称> → <履约项名称> → <请求或确认>
已明确：<当前节点的业务事实>
正在澄清：<一个问题>
```

面板不展示业务标识、其他合同、全局进度、来源文章、影响说明或整体准入提醒。来源和完整责任结构继续由 Agent 保存到业务记录。契约拒绝额外字段，不接收旧问答载荷。

工具只返回：

- `answered`：保留多行回答原文；
- `deferred`：暂缓当前问题；
- `stopped`：结束本次讨论；
- `cancelled`：关闭或空白提交；
- `unavailable`：无 UI 或问答面板正在使用。

扩展不分配业务标识、不写发现记录、不主动发送下一轮。Agent 必须先保存返回的回答或控制状态，再按授权沉淀术语；任一保存失败停止推进，分别交接发现记录与词汇表的保存结果。回答在本次访谈授权内可用于沉淀明确术语，不扩大模型 JSON 编辑权限；仅记录或只聊不落盘等更窄要求优先。

## 文件与宿主边界

默认项目布局由各 Skill 共享：`.evidence/discovery.json`、`.evidence/glossary.json`、`.evidence/fm/`、`.evidence/api/`、`.evidence/checks/fm/` 和 `.evidence/checks/api/`。

TUI 与 RPC 使用宿主选择器和多行编辑器。无 UI 时转普通对话；并发问答互斥只在进程内存在。启动、重载和关闭无文件副作用，不替换系统提示或工具集，不注册自动推进、路径拦截或 Session 恢复逻辑。

模型可能处于编辑中或校验失败状态。Agent 展示本轮增改删及真实检查结果，不把文件存在、编辑成功或机器通过当作业务批准。Git 操作由用户显式决定。

建模完成后也不会自动进入实施。用户另行要求规划时，由 `evidence-task-planning` 生成 `docs/plans/smart-domain/`；用户要求实施或恢复时，由 `evidence-delivery` 读取任务 DAG、执行一个就绪任务并在完成后停止。

## 验证

```bash
npm run evidence-modeling:verify
```

自动测试覆盖命令转发、访谈／一体生成／联合只读校验／联合审核页的授权边界、更窄参数透传、资源缺失、取消、问答返回值和无 UI 降级。中文输入法、窄终端与 RPC 客户端体验仍需真人检查。
