# 校验、错误与保存纪律

## 运行条件

使用 Python 3.10+，安装本包 `requirements.txt`，并传入可用的 `evidence-fm` Skill 目录。CLI 通过 `sys.executable` 以参数数组调用其 `check_fm.py` 和 `compile_fm_model.py`；从本次验证的 FM 输入生成投影，不导入 FM 私有模块或复用预生成模型 JSON。

```bash
"$PYTHON" -m pip install -r "$API_SKILL_DIR/requirements.txt"
"$PYTHON" -m unittest discover -s "$API_SKILL_DIR/tests" -v
"$PYTHON" -m unittest discover -s "$FM_SKILL_DIR/tests" -v
```

## 退出码

- `0`：命令有效；普通模式可包含清楚标出的 gap。
- `1`：FM/设计无效、悬空引用、确定冲突、输入变化或输出冲突。
- `2`：argparse 参数错误。
- `3`：`--require-complete` 下仍有范围内 gap。
- `4`：FM 工具缺失、调用失败或超时等环境故障。

诊断包含稳定 `code/severity/targetRef/location/relatedRefs/message`；gap 另有 `gapKey/category`。不要根据措辞或数组位置重建 gapKey。

## 业务命名、数量与寻址复核

先复核名称是否来自业务对象与办理行为，而非 FM 分类的机械拼接。机器只检查 `businessName` 非空、segment 格式、显式数量及视图一致性，不声称理解或批准业务词汇。

- `RESOURCE_CARDINALITY_UNRESOLVED`：没有可追溯的父子数量上限，或被引用关系未声明该端点基数。
- `CARDINALITY_SCOPE_INVALID`：数量关系端点不对应当前父子业务对象，或单例缺少父实例范围。
- `RESOURCE_CARDINALITY_CONFLICT`：数量上限与单例／集合寻址不一致，或来源说明与已有 FM 数量冲突。
- `RESOURCE_IDENTITY_CONFLICT`：单例错误声明子定位参数，或集合实例缺少独立身份。
- `RESOURCE_VIEW_INVALID`：能力、表示或链接选择了资源不存在的视图。

有业务数量不等于有实例归属；Context 根与 `parent_child` 仍独立检查。单例只缩短确定性定位，不允许覆盖 Evidence，不宣称实现了幂等、重复提交处理或运行时唯一性。

## 凭证依赖复核

设计复核检查必要补充证据的形成前提、实例引用、访问范围及创建路径。必需证据先存在，才可形成被证明凭证；证据创建不得依赖该尚未形成的目标。FM 的 `basedOn`、时间线和 CEL 场景可验证已声明的依赖；API 的 `ruleBindings` 只表达检查契约，不执行服务端前置校验。工具未覆盖的依赖判断必须由 Agent 复核并保留真实 gap，不把 `complete` 当作业务正确性证明。

## 文件纪律

默认输入为项目根下的 `.evidence/fm/` 和 `.evidence/api/api.yaml`，投影输出为 `.evidence/api/generated/<批次>/`；已有文件和用户显式指定路径优先，不自动迁移。需要留存 inspect/check 结果时，经授权写入 `.evidence/checks/api/<批次>/`；只校验仍只报告结果，不写文件。

所有 CLI 路径参数使用绝对路径。`--api` 指向一份统一 API 文件，必须位于 FM 根目录之外；其中来源路径相对 project root，不得越界。FM、validation、API 和来源均只读；运行前后摘要变化时失败。

project 的 out 必须位于项目根内、父目录已存在且目标尚不存在，并且不能与 FM、设计或来源重叠。CLI 不提供覆盖参数。先在内存形成全部内容，再排他创建目录；manifest 最后原子替换。失败会清理本次新目录，不会覆盖已有输出。

机器通过不是业务批准、运行授权或接口测试。`--require-complete` 只检查声明范围，不要求 unselected 的所有组合都有场景。
