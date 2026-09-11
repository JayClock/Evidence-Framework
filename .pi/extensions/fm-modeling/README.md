# FM Modeling 交互适配器

该项目级 Pi 扩展只改善 `fm-modeling` Skill 的交互体验，不维护业务 Run、问答事件仓库、模型状态或发布事务。关闭扩展后，仍可通过 Skill、项目文件和独立 CLI 完成同一建模流程。

## 命令

```text
/fm-model <目标>  # 通过原生 /skill:fm-modeling 展开目标
/fm-model         # 选择开始、继续、只校验或返回
```

扩展会确认 `fm-modeling` Skill 已被宿主发现，再使用 `expandPromptTemplates: true` 发送原生 Skill 命令。资源缺失只提示安装问题，不生成业务问题。

## UI 工具

### `fm_ui_question`

Agent 提供 `questionId`、`gapKey`、问题、影响、当前理解和来源引用。面板独立返回：

- `answered`：保留多行回答原文；
- `deferred`：暂缓当前问题；
- `stopped`：结束本次讨论；
- `cancelled`：关闭或空白提交；
- `unavailable`：无 UI 或已有 FM 面板。

扩展不分配问题／回答标识、不写发现记录，回答后也不主动发送下一轮消息。Agent 必须按 Discovery 方法先保存返回结果；保存失败时停止推进。

### `fm_ui_review`

输入 `publish_fm.py prepare` 产生的 `receiptPath`。面板展示目标与 preparation ID、来源／候选／目标摘要、增改删数量、Schema／CEL／lineage／simulation／timeline 检查、Evidence 时间线及未决顺序，并允许查看完整差异。返回：保存当前候选、返回修改、暂不保存、取消或不可用，以及绑定的准备结果标识和摘要。

扩展不调用 `apply`，也不把“保存”解释成具名业务审核。Agent 仅可对同一已展示准备结果调用独立发布 CLI；内容变化后需要重新准备和确认。

## 宿主边界

- TUI 和 RPC 使用宿主标准选择器与多行编辑器；无 UI 时返回 `unavailable`，由 Agent 转为普通对话。
- 同时只打开一个 FM 面板，这是进程内 UI 互斥，不是业务状态机。
- 启动、重载和关闭没有业务文件副作用，不读取或写入 `.evidence/`、`artifacts/`、`reports/`。
- 不替换工具集、编辑器或系统提示，不注册路径拦截、自动推进或 Session 恢复逻辑。
- UI 返回与业务文件写入之间存在保存窗口；最终以项目文件为准。

## 验证

```bash
npm run fm-modeling:typecheck
npm run fm-modeling:test
npm run fm-modeling:format:check
npm run fm-modeling:verify
```

自动测试覆盖唯一 `/fm-model` 的原生 Skill 转发、资源缺失、问答结果分支、无 UI 降级、候选绑定、完整差异、Evidence 时间线和空场景显示。真人仍需检查中文输入法、窄终端、主题切换、RPC 客户端、取消／暂缓／继续和发布中断体验。
