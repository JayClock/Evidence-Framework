# FM Modeling 交互适配器

该项目级 Pi 扩展只提供一个命令和一个问答工具。Agent 按 Skill 直接编辑项目文件、运行校验并在普通对话中展示差异；扩展不维护业务状态、不读写模型、不执行版本操作。

## 命令

```text
/fm-model <目标>  # 转发原生 /skill:fm-modeling
/fm-model         # 讨论业务／生成或修改模型／只校验模型／返回
```

- 讨论业务：填写目标，明确只整理发现记录、不修改模型。
- 生成或修改模型：填写目标，明确直接编辑当前 FM 并校验。
- 只校验模型：只读检查，不修改源文件。
- 返回、关闭或空白目标：不发送消息。

先确认宿主已发现 `fm-modeling` Skill，再以 `expandPromptTemplates: true` 转发。资源缺失只提示安装问题，不创建业务问题。新布局由 Skill 定义，不在扩展中复制路径配置。

## `fm_ui_question`

Agent 提供 `questionId`、`gapKey`、问题、影响、当前理解及来源引用。工具只返回：

- `answered`：保留多行回答原文；
- `deferred`：暂缓当前问题；
- `stopped`：结束本次讨论；
- `cancelled`：关闭或空白提交；
- `unavailable`：无 UI 或问答面板正在使用。

扩展不分配业务标识、不写发现记录、不主动发送下一轮。Agent 必须先保存返回的回答或控制状态；保存失败停止推进。回答不等于修改模型的授权。

## 文件与宿主边界

默认项目布局由四个 Skill 共享：`.evidence/discovery.md`、`.evidence/fm/`、`.evidence/api/`、`.evidence/checks/fm/` 和 `.evidence/checks/api/`。

TUI 与 RPC 使用宿主选择器和多行编辑器。无 UI 时转普通对话；并发问答互斥只在进程内存在。启动、重载和关闭无文件副作用，不替换系统提示或工具集，不注册自动推进、路径拦截或 Session 恢复逻辑。

模型可能处于编辑中或校验失败状态。Agent 展示本轮增改删及真实检查结果，不把文件存在、编辑成功或机器通过当作业务批准。Git 操作由用户显式决定。

## 验证

```bash
npm run fm-modeling:verify
```

自动测试覆盖命令转发、三种意图的授权边界、资源缺失、取消、问答返回值和无 UI 降级。中文输入法、窄终端与 RPC 客户端体验仍需真人检查。
