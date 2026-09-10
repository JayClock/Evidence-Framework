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

`--source` 可重复。CLI 将候选冻结到工作目录，调用同包 `check_fm.py` 执行真实检查，计算候选、目标和声明来源摘要，并生成完整文件清单差异和 unified diff。`prepare` 不修改正式目标。

标准输出是 JSON。`status: prepared` 且退出码为 0 才表示准备成功；`validation_failed`、`checker_unavailable` 和路径错误均使用非零退出码。没有执行适用场景时保留 `simulationPassed: null`，不能改写成模拟通过。

`receiptPath` 指向准备结果。展示保存目标、候选摘要、全部增改删、检查结果、实际场景执行数及未决业务缺口后，才可请求保存授权。授权绑定该准备结果；候选、来源或目标变化后必须重新准备。

## 文件边界

候选、目标和工作目录不能相同或互相包含；路径树不得经过符号链接或特殊文件。Skill 安装目录不能作为工作目录。默认项目位置为：

- 正式模型：`docs/business/fm/`
- 发现记录：`docs/business/discovery.md`
- 工作目录：`docs/business/.fm-work/`
- 检查记录：`docs/business/fm-checks/`

项目已有约定优先，默认目录按需创建，不预建空模板。

## 应用与恢复

应用和恢复命令、冲突规则及文件事务见本文后续章节。准备成功不等于保存授权，机器检查也不等于具名业务审核。
