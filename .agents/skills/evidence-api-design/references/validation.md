# 校验、错误与保存纪律

## 运行条件

使用 Python 3.10+，安装本包 `requirements.txt`，并传入可用的 `evidence-fm` Skill 目录。CLI 通过 `sys.executable` 以参数数组调用其 `check_fm.py` 和 `compile_fm_model.py`；从本次验证的 FM 输入生成投影，不导入 FM 私有模块或复用预生成模型 JSON。

```bash
"$PYTHON" -m pip install -r "$API_SKILL_DIR/requirements.txt"
"$PYTHON" -m unittest discover -s "$API_SKILL_DIR/tests" -v
"$PYTHON" -m unittest discover -s "$FM_SKILL_DIR/tests" -v
```

## 退出码

- `0`：inspect 完成，或 check/project 的整体覆盖和全部契约没有检测到错误或 gap。
- `1`：FM/设计无效、悬空引用、确定冲突、输入变化或输出冲突。
- `2`：argparse 参数错误。
- `3`：存在整体覆盖、接口设计或 HTTP 消费流程 gap；project 不生成输出。
- `4`：FM 工具缺失、调用失败或超时等环境故障。

诊断包含稳定 `code/severity/targetRef/location/relatedRefs/message`；gap 另有 `gapKey/category`。不要根据措辞或数组位置重建 gapKey。

## 整体覆盖

输入 API 格式为 4.0，上游为已确认 FM v3；校验不重复业务确认。完整性检查始终执行，不可通过省略 Context、整个场景或某接口的 HTTP 契约得到通过。

- `MODEL_ENTITY_UNCOVERED`：整体 FM 的业务对象未对应接口或真实非接口活动。
- `MODEL_EVIDENCE_WRITE_MISSING`：仅有读取，未覆盖凭证形成。
- `MODEL_HANDLING_CONFLICT`：非接口活动重复，或与同对象写入接口冲突；未扮演责任角色导致的非 API 形成可与读取接口共存。
- `MODEL_HANDLING_BASIS`：内部／外部处理缺少对应 FM 对象或业务来源。
- `SCENARIO_UNCOVERED`：整个 FM 场景或具体步骤遗漏。
- `SCENARIO_CAPABILITY_MISMATCH`：步骤角色、凭证效果或场景依据与接口不一致。
- `SCENARIO_HANDLING_MISMATCH`：步骤内部／外部处理与整体说明不一致。
- `ACTOR_PARTY_PLAYER_MISSING`：`caller_role` 或 capability 的 Party Role 没有 `participant.party -> plays_role` 玩家；该角色不生成接口。
- `CONTRACT_LIST_PARTY_SCOPE_MISSING`：Contract 的 GET collection 读取未挂在具体 Participant Party 类型资源根下，或仍使用 `/parties`、`partyId` 这类统称作用域，无法区分合同双方角色对应的不同主体。
- `CONTRACT_OPERATION_MISSING`：业务接口缺少 HTTP 契约。
- `HTTP_FLOW_UNCOVERED`：接口没有成功消费步骤。

## 业务命名、数量与寻址复核

先复核名称是否来自业务对象与办理行为，而非 FM 分类的机械拼接。机器只检查 `businessName` 非空、segment 格式、显式数量及视图一致性，不声称理解或批准业务词汇。

- `RESOURCE_CARDINALITY_UNRESOLVED`：没有可追溯的父子数量上限，或被引用关系未声明该端点基数。
- `CARDINALITY_SCOPE_INVALID`：数量关系端点不对应当前父子业务对象，或单例缺少父实例范围。
- `RESOURCE_CARDINALITY_CONFLICT`：数量上限与单例／集合寻址不一致，或来源说明与已有 FM 数量冲突。
- `RESOURCE_IDENTITY_CONFLICT`：单例错误声明子定位参数，或集合实例缺少独立身份。
- `RESOURCE_VIEW_INVALID`：能力、表示或链接选择了资源不存在的视图。
- `CONTRACT_LIST_PARTY_SCOPE_MISSING`：Contract 列表读取必须使用具体 Participant Party 类型作为 URL 根；Contract 自身根集合或统称 `/parties` 只适合非列表入口。
- `ACTOR_PARTY_PLAYER_MISSING`：调用者角色虽是 FM Party Role，但没有 Participant Party 通过 `plays_role` 扮演；校验器不会为该角色投影接口或 HTTP 契约。

有业务数量不等于有实例归属；Context 根与 `parent_child` 仍独立检查。单例只缩短确定性定位，不允许覆盖 Evidence，不宣称实现了幂等、重复提交处理或运行时唯一性。

## 凭证依赖复核

设计复核检查必要补充证据的形成前提、实例引用、访问范围及创建路径。必需证据先存在，才可形成被证明凭证；证据创建不得依赖该尚未形成的目标。若凭证形成责任属于未被 Participant Party 扮演的 Party Role，设计必须用 `nonApiActivities` 回映该形成步骤，不能生成对应调用接口；已有读取接口仍需遵守实例和可见性约束。FM 的 `basedOn`、时间线和 CEL 场景可验证已声明的依赖；API 的 `ruleBindings` 只表达检查契约，不执行服务端前置校验。工具未覆盖的依赖判断必须由 Agent 复核并保留真实 gap，不把 `complete` 当作业务正确性证明。

## 文件纪律

默认输入为项目根下的 `.evidence/fm/` 和 `.evidence/api/api.yaml`，投影输出为 `.evidence/api/generated/<批次>/`；已有文件和用户显式指定路径优先，不自动迁移。需要留存 inspect/check 结果时，经授权在 `.evidence/checks/api/<批次>/` 写入紧凑运行清单（命令、退出码、输入摘要、文件 `sha256` 与日志指针），不复制 projection 或契约全文；只校验仍只报告结果，不写文件。

所有 CLI 路径参数使用绝对路径。`--api` 指向一份统一 API 文件，必须位于 FM 根目录之外；其中来源路径相对 project root，不得越界。FM、validation、API 和来源均只读；运行前后摘要变化时失败。

project 的 out 必须位于项目根内、父目录已存在且目标尚不存在，并且不能与 FM、设计或来源重叠。CLI 不提供覆盖参数。先在内存形成全部内容，再排他创建目录；manifest 最后原子替换。失败会清理本次新目录，不会覆盖已有输出。

上游业务确认沿用输入依据；机器检查不充当新的审核步骤，也不代表运行授权或接口验收。接口清单是交付索引，技术缺口不通过人工点击“通过”解除。
