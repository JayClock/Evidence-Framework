# 校验、错误与保存纪律

## 运行条件

使用 Python 3.10+，安装本包 `requirements.txt`，并传入可用的 `evidence-fm` Skill 目录。CLI 通过 `sys.executable` 以参数数组调用其 `check_fm.py` 和 `compile_fm_model.py`；不导入 FM 私有模块，不读取旧 `generated/model.json`。

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
- `4`：Python、依赖、FM 工具或超时等环境故障。

诊断包含稳定 `code/severity/targetRef/location/relatedRefs/message`；gap 另有 `gapKey/category`。不要根据措辞或数组位置重建 gapKey。

## 文件纪律

所有 CLI 路径参数使用绝对路径。设计中的来源路径相对 project root，默认不得越界。FM、validation、设计和来源均只读；运行前后摘要变化时失败。

project 的 out 必须位于项目根内、父目录已存在且目标尚不存在，并且不能与 FM、设计或来源重叠。CLI 不提供覆盖参数。先在内存形成全部内容，再排他创建目录；manifest 最后原子替换。失败会清理本次新目录，不会覆盖旧输出。

机器通过不是业务批准、运行授权或接口测试。`--require-complete` 只检查声明范围，不要求 unselected 的所有组合都有场景。
