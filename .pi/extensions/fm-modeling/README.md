# 独立 FM Modeling 插件

该项目级 Pi 插件通过一个命令维护独立的 FM Schema v3 建模闭环，不进入现有 Evidence Delivery 工作流。

## 使用

```text
/evidence-model <需求描述>  # 创建 Run、记录原始输入并启动首轮建模
/evidence-model             # 重开当前问题，或显示当前模型
/evidence-model stop        # 安全停止并返回最后有效模型
```

首轮发布有效模型后，插件每次只展示一个问题。人工回答会先追加为不可变事件，再启动下一轮完整 bundle 提交。关闭问题菜单不会阻塞普通 Pi；再次执行无参数命令即可重开。

已有活动 Run 时，新需求不会覆盖它。Run 停止后创建新 Run；若已有有效模型，必须在确认框中明确把它作为新 Run 的输入来源。停止后的 Run 不可恢复。

## 持久化与边界

插件只拥有：

- `.evidence/fm-modeling/state.json`
- `.evidence/fm-modeling/runs/<runId>/events/`
- `.evidence/fm-modeling/staging/`
- `.evidence/fm-modeling/model/`

事件通过 SHA-256 摘要链保持不可变。模型先写 staging，经完整校验后以目录 rename 发布；失败或回滚保留上一有效模型。外部修改正式模型会在恢复或提交时被拒绝，不自动导入、删除或覆盖。

插件不读写 `.pi/evidence.json`、其他 `.evidence/` 状态、`artifacts/`、`reports/` 或 Gate，也不生成需求、架构、计划、代码和审核工件。它不导入 `.pi/extensions/evidence/`。

## 环境

真实 FM 校验需要：

- Python 3.10+
- `.agents/skills/evidence-fm/requirements.txt` 中的依赖

插件通过只读方式执行：

```bash
python3 .agents/skills/evidence-fm/scripts/check_fm.py <staging-directory>
```

缺少 Python 或依赖时，本轮记录真实 `model-publication-failed`，不会把未校验模型发布为有效模型。

## 验证

```bash
npm run fm-modeling:typecheck
npm run fm-modeling:test
npm run fm-modeling:format:check
npm run fm-modeling:verify
```

自动化测试覆盖插件边界、输入事件、摘要链、过期 revision、完整 bundle、no-op、校验失败、rename 回滚、单问题、回答持久化、停止、恢复、外部修改与工具租约。TUI 验收需在 Python 3.10+ 且依赖就绪的交互式 Pi 中执行中文输入、取消菜单、回答和停止流程。

## 限制

- 同一项目仅支持一个 Pi 进程和一个活动 Run，不提供跨主机锁或分布式租约。
- 不支持多 Run 浏览／切换、resume/status 子命令、外部模型自动合并或文件级 Delta。
- `model/generated/` 是可重建派生目录，不接受 Agent 直接提交。
- Session 重载只校验和恢复，不自动启动 Agent 或弹出问题。
