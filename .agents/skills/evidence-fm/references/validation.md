# 独立 FM 校验

## 环境

只讨论业务无需安装依赖。执行校验需要 Python 3.10+；先检查已有 Python 是否可导入 yaml、jsonschema 和 celpy。没有合适环境时，经用户允许在缓存或临时目录创建 venv：

```bash
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/python" -m pip install -r "$SKILL_DIR/requirements.txt"
```

Windows 使用该环境下的 `Scripts/python.exe`。路径均由当前环境解析，使用本包绝对路径与隔离的 Python 环境。不要覆盖已有环境，也不要为校验上传业务材料。

## 统一只读入口

```bash
"$PYTHON" "$SKILL_DIR/scripts/check_fm.py" "$MODEL_DIR"
```

输出 JSON，退出 0 表示本次适用检查无错误，退出 1 表示模型／场景校验失败。命令不会写回模型或报告文件：需要保存时由调用者选择获授权的报告路径。

- `valid`：类型、语义、CEL、lineage 和提交的 validation 套件没有检测到错误，且检查前后输入摘要一致。
- `modelDigest`：模型目录中文件相对路径与内容的 SHA-256 摘要，包含源 YAML、说明及 validation，不包含 generated 和 Python 字节码；不依赖绝对路径或 Git 提交。
- `inputChanged`：检查前后模型摘要是否变化；为 true 时 `valid` 为 false，本次结果不可用于当前版本。它不是文件锁或事务保证，检查结束后再修改同样需要重跑。
- `modelValidated`：类型、语义及关键属性追溯的结果。
- `simulationPassed`：有实际执行场景时为 true／false，没有执行则为 null；空目录不算模拟成功。
- `scenarioCount` 与 `executedScenarioCount`：声明场景数和实际执行数。
- `modelStatus`、`stakeholderReview`：只反映模型源文件，不自动提升。
- `errors`：错误列表；无模型、坏 YAML、坏引用或预期不匹配都不能当作不适用。

脚本不能判断业务来源是否充分、模型是否忠实或人工身份是否真实。命令退出 0 不等于业务批准。非派生时间不强制生成公式，但同样须按[来源映射](./provenance.md)核对业务来源；类型字段或 lineage 通过不能消除真实来源缺口。

## 最小验证记录

默认直接编辑 `.evidence/fm/`。用户要求留存检查结果时，把真实输出保存到项目根的 `.evidence/checks/fm/<运行标识>.json`，同时记录实际命令、环境和来源版本指针。报告位于模型目录之外，不覆盖已引用记录。只校验请求不写任何项目文件，临时排错可以只查看输出。没有保存授权时在回复中给出结果并说明未保存。

`modelDigest` 只绑定模型目录内容，不认证外部业务来源或校验器版本；这些依据仍按下表独立记录。不得通过重写摘要或 `valid` 使旧报告冒充当前检查。

| 必要内容       | 记录要求                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 模型与输入版本 | 目标路径、源 YAML 和 validation 输入的可恢复版本／快照或内容摘要；仅有 Git 提交不能覆盖未提交变化                       |
| 执行环境       | 校验器版本或实际脚本快照／摘要，以及本次使用的 Python 与依赖环境定位；不复制完整环境清单                                |
| 实际执行       | 具体命令、参数、工作目录及真实运行时间（可取得时），每个已执行命令的退出码；未执行明确写未执行                          |
| 结果与覆盖     | 类型／CEL／lineage／编译的实际检查范围、声明及实际执行场景数、simulationPassed、错误与未覆盖项；无需逐字段复写完整 JSON |
| 原始结果指针   | 已保存报告或执行记录的路径／运行标识；未保存写未保存，不编造日志位置                                                    |

业务审核状态及具名依据仍以模型／审核记录为准，交接只引用；机器结果不补造审核。失败时保留能解释判断的错误或报告定位，不默认把整段控制台输出抄入业务文档，敏感信息按授权脱敏。

同一运行结果只维护一处，更新说明和交接链接它。模型、场景输入、业务来源或校验器变化后，旧记录仍可证明旧版本的执行事实，但不能证明当前版本有效；相应检查应重跑。修订后的预期须有来源，不为通过修改。

generated 中的编译与 lineage 是可重建产物；已被审核或交接引用的具体运行证据不能因“可重跑”而覆盖或删掉。需要清理派生产物时先保留该运行的结果及版本关联。原始长日志只在故障定位、审计约定或用户明确要求时另存。

## 按需派生输出

下列命令仅在用户要求生成派生输出时执行，默认 `MODEL_DIR="$PROJECT_ROOT/.evidence/fm"`；只校验不执行这些写入命令。源 YAML 才是模型事实源。

```bash
"$PYTHON" "$SKILL_DIR/scripts/build_fm_lineage.py" "$MODEL_DIR" --output "$MODEL_DIR/generated/traceability.json"
"$PYTHON" "$SKILL_DIR/scripts/compile_fm_model.py" "$MODEL_DIR" --output "$MODEL_DIR/generated/model.json"
```

存在实际适用单据场景时可另外保存完整模拟报告：

```bash
"$PYTHON" "$SKILL_DIR/scripts/simulate_fm_model.py" "$MODEL_DIR" --output "$MODEL_DIR/generated/simulation.json"
```

不要对空场景套件调用底层模拟命令再以其布尔结果宣称业务模拟通过；统一入口会明确区分未执行。存在真实业务复用主张及 `business-patterns` 源 YAML 时，可用 `build_fm_business_patterns.py` 的 `--output` 生成说明；没有复用主张不凑模式。

## 编辑后的核对

- 来源、关键值口径、必要事实依赖与模型一致，未知部分仍留在评估中。
- 纯领域／渠道未虚构合同；有履约时父子 Context、双方 Role、请求区间、确认凭证与业务规则完整。
- 所有六类 Evidence 的 required/keyData timestamp 和 snake_case 属性显式存在，具体场景时间充分。
- 正常、边界、异常预期有来源，合成数据明确标记。改模型修表达，不倒改预期通过测试。
- 源 YAML 检查、关键属性 lineage、编译和适用单据模拟分别报告。领域操作、状态机和关系基数未被运行验证时明示。
- 编辑前读取现有内容，避免覆盖用户或并发修改；校验失败明确当前目录未通过，列出已修改文件，不自动回滚。需要恢复时由用户明确选择 Git 版本操作；不保证当前目录始终有效。
- 人工审核与机器校验分别记录，不自动提交 Git 或开始后续开发。
