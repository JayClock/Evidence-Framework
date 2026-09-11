# FM 候选准备与安全保存

发布命令只负责文件校验、差异和替换，不选择业务问题，也不认定来源清单完整或业务审核通过。

## 准备候选

先在项目允许的独立目录形成完整候选，再运行：

```bash
"$PYTHON" "$SKILL_DIR/scripts/publish_fm.py" prepare \
  --candidate "$CANDIDATE" \
  --target "$TARGET" \
  --source "$DISCOVERY" \
  --work-dir "$WORK_DIR"
```

`--source` 可重复。CLI 将候选冻结到工作目录，调用同包 `check_fm.py` 执行 Schema、CEL、lineage、simulation 与 canonical timeline 检查，计算候选、目标和声明来源摘要，并生成完整文件清单差异和 unified diff。`prepare` 不修改正式目标。

标准输出是 JSON。`status: prepared` 且退出码为 0 才表示准备成功；`validation_failed`、`checker_unavailable` 和路径错误均使用非零退出码。没有执行适用场景时保留 `simulationPassed: null`，不能改写成模拟通过。

`receiptPath` 指向准备结果。展示保存目标、来源／候选／目标摘要、全部增改删、检查结果、Evidence 时间线摘要与哈希、未决顺序、实际场景执行数及未决业务缺口后，才可请求保存授权。授权绑定该准备结果；候选、来源、目标或时间线摘要变化后必须重新准备。

## 文件边界

候选、目标和工作目录不能相同或互相包含；路径树不得经过符号链接或特殊文件。Skill 安装目录不能作为工作目录。默认项目位置为：

- 正式模型：`.evidence/fm/`
- 发现记录：`.evidence/discovery.md`
- 编辑候选：`.evidence/fm-candidates/<批次>/`
- 发布工作目录：`.evidence/.fm-work/`
- 检查与发布记录：`.evidence/fm-checks/`

上述路径均相对项目根；已有文件与用户显式指定路径优先，不自动迁移。默认目录按需创建，不预建空模板。编辑候选不能放进发布工作目录；后者只由 CLI 存放冻结副本和 receipt。例如：

```bash
TARGET="$PROJECT_ROOT/.evidence/fm"
DISCOVERY="$PROJECT_ROOT/.evidence/discovery.md"
CANDIDATE="$PROJECT_ROOT/.evidence/fm-candidates/$BATCH"
WORK_DIR="$PROJECT_ROOT/.evidence/.fm-work"
REPORT_DIR="$PROJECT_ROOT/.evidence/fm-checks"
```

`PROJECT_ROOT` 必须是项目绝对路径，`BATCH` 为本次候选目录名，不复用旧准备结果的授权。

## 应用候选

用户明确授权保存已经展示的准备结果后运行：

```bash
"$PYTHON" "$SKILL_DIR/scripts/publish_fm.py" apply \
  --receipt "$PREPARED_RECEIPT" \
  --report-dir "$REPORT_DIR"
```

`apply` 获取目标级本地排他锁，复核 receipt、冻结候选、声明来源和目标摘要，再把即将写入的同盘 staging 交给真实检查器，并核对 canonical timeline 摘要与 prepare 完全一致。只有复核及校验都通过才替换完整目标目录；候选中删除的文件不会残留。目标已经等于同一候选时，在重新校验后返回 `noop`。

以下变化返回 `conflict`，不会静默覆盖：

- receipt、冻结候选或声明来源被修改；
- 目标不再等于准备时的摘要；
- 准备时不存在的目标后来出现内容；
- 另一个进程持有同一目标锁。

成功报告使用 `publication-<preparationId>.json` 保留目标、候选、来源、差异和实际检查结果。报告写入失败时返回 `recovery_required`，并明确 `targetChanged: true`；不能把它描述成“目标未修改”。

## 恢复文件操作

应用进程在目录 rename 之间中断时运行：

```bash
"$PYTHON" "$SKILL_DIR/scripts/publish_fm.py" recover --target "$TARGET"
```

恢复只读取目标旁的最小事务日志。如果新目标已完整就位，则完成清理；如果旧目标已移到备份而新目标尚未就位，则恢复旧目标；无法与日志摘要匹配时保留诊断材料并返回 `recovery_required`。它不恢复访谈、不调用 Agent，也不删除无法确认归属的文件。

本地同盘两次目录 rename 避免发布半套候选，但不承诺非协作读者始终看得到目标目录，也不提供跨主机事务。准备成功不等于保存授权，机器检查也不等于具名业务审核。
