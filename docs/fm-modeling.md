# FM Modeling 使用指南

FM Modeling 由可移植 Skills、普通项目文件和独立 Python CLI 组成。Pi 扩展只是可选界面；禁用全部扩展后仍可讨论、形成候选、校验和保存。

## 入口与意图

Pi 中显式调用：

```text
/skill:fm-modeling <本次目标>
```

安装了可选适配器时也可用：

```text
/evidence-model <本次目标>
```

入口支持五类意图：讨论／澄清、生成候选、只校验、保存已展示候选、暂停／结束。生成候选不等于保存；普通业务回答、停止和机器检查通过都不是保存授权。

## 默认文件布局

项目已有约定优先。没有约定时按需使用：

```text
docs/business/
├── discovery.md       # 来源、原话、工作理解、问题与恢复点
├── fm/                # 正式 FM 源 YAML、说明和验证场景
├── fm-checks/         # 已引用的检查与发布记录
└── .fm-work/          # 候选及冻结准备结果（忽略提交）
```

`discovery.md` 应能让新 Agent 找到当前业务对象、已消化来源、实际问题、暂缓／停止状态、正式模型、候选、检查记录和下一步选择。它不复制正式模型正文，也不保存宿主运行状态。

## 讨论和候选

`fm-modeling` 通过资源发现组合：

- `evidence-discovery`：一次一个核心业务问题，保留原话、来源、更正、稳定 Q-ID／gapKey、暂缓和停止。
- `evidence-fm`：来源追溯、业务判断、ready／support／pending 评估、完整候选、验证场景和发布规则。

没有首份模型也可以先澄清。回答返回后先写发现记录，再重新判断；写入失败必须停止。材料充分时直接形成候选，不为模板凑问题。未知事实保持 pending，不补造合同、期限、确认提供者或实例时间。

## 只读校验

准备满足 `evidence-fm/requirements.txt` 的 Python 3.10+ 环境，设置绝对路径：

```bash
"$PYTHON" "$SKILL_DIR/scripts/check_fm.py" "$MODEL_DIR"
```

命令只读模型并输出 JSON。没有实际执行场景时 `simulationPassed` 为 `null`；检查失败不能通过修改业务预期掩盖。

## 准备与查看候选

```bash
"$PYTHON" "$SKILL_DIR/scripts/publish_fm.py" prepare \
  --candidate "$CANDIDATE" \
  --target "$TARGET" \
  --source "$DISCOVERY" \
  --work-dir "$WORK_DIR"
```

`--source` 可重复。成功结果中的 `receiptPath` 绑定冻结候选、目标与声明来源摘要、完整差异、真实校验和场景执行结果。保存前展示目标、摘要、全部增改删、完整差异、检查结果和剩余缺口。

Pi 适配器的 `fm_ui_review` 可提供查看与确认界面；没有界面时在普通对话中展示相同信息。取消、返回修改和暂不保存都不是保存许可。

## 保存和冲突

用户明确授权保存当前已展示准备结果后运行：

```bash
"$PYTHON" "$SKILL_DIR/scripts/publish_fm.py" apply \
  --receipt "$PREPARED_RECEIPT" \
  --report-dir "$REPORT_DIR"
```

CLI 在目标锁内重新核对 receipt、候选、来源和目标，重新校验同盘 staging，再替换完整目录。结果包括：

- `applied`：替换并写入真实报告；
- `noop`：目标已等于同一候选，重新校验后无需替换；
- `validation_failed`：实际检查失败，目标不变；
- `conflict`：候选、来源、目标或锁发生冲突；
- `recovery_required`：文件操作或报告需要恢复／诊断。

任何摘要变化都使旧确认失效。保存结果不是具名业务审核，也不会自动启动需求或软件交付流程。

## 中断恢复

```bash
"$PYTHON" "$SKILL_DIR/scripts/publish_fm.py" recover --target "$TARGET"
```

恢复只处理目标旁的最小文件事务：完成已就位候选的清理，或在新候选尚未就位时恢复旧目标。无法与摘要匹配时保留材料并返回 `recovery_required`。它不恢复访谈或调用 Agent。

目录替换使用本地目标锁、同盘 staging 和可恢复备份，不承诺跨主机事务，也不保证非协作读者在两次 rename 之间始终看得到目标目录。

## 验证与人工检查

```bash
npm run skills:verify
npm run fm-modeling:verify
npm test
npm run lint
npm run build
```

自动测试证明 CLI、Skill 结构和 UI 适配器的程序行为。行为评测用于观察 Agent 是否遵守来源、逐问、停止和授权边界；中文输入、窄终端、主题、RPC、取消、暂缓、继续、保存确认和发布中断仍需真人体验。
