# 整体 API 设计流程

本流程负责将 FM 形式化业务模型严格映射并生成技术契约与投影交付物。上游是 FM 已结束确认且完整性检查有效的明确范围及必要依赖；本阶段负责技术契约与投影，不重复业务确认，不把技术决定冒充业务事实。由独立的 `evidence-api` 执行，消费 FM 检查通过的结果，不再次检查同一 FM。链路结构按当前范围与依赖实际推导，不由历史样板或既有协议选择决定。

## 权限与输入范围

定位项目根、完整 `.evidence/fm/`、当前 `.evidence/api/api.json` 及本包和 FM 包的实际绝对路径。读取已有差异；只修改本次授权的文件，保留无关改动，不自动迁移。

| 请求动作           | 必要参考与授权范围                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| 讨论设计方法       | [设计方法](api-method.md)，按问题选读 [HTTP 契约](api-contracts.md)；只解释，不写文件             |
| 生成或修改整体 API | 设计方法、[格式](api-format.md)、HTTP 契约与 [校验纪律](api-validation.md)；维护 API 源及全部交付 |
| 只校验 API         | 校验纪律；仅 check，可选 inspect，不修复、不保存项目报告                                          |
| 仅生成交付文件     | 校验纪律；完整检查后 project，不编辑设计源                                                        |
| 另行要求审核页     | 定位并读取 `evidence-visualization`；不复制展示工具                                               |

API 使用格式 5.0 的严格 JSON，上游为 FM v5；具体结构由格式参考维护。API 阶段的 FM 始终只读，API 源位于 FM 根之外。默认交付 `.evidence/api/generated/`；项目产物不写入安装目录。

## 映射推导与交付流水线

1. **承接 FM 结果与全量输入**：
   - 使用 FM 阶段已实际通过的明确范围及必要依赖的结果与当前完整模型；
   - 结果必须满足 `checkVersion: 5`、`consistent: true`、`complete: true`、明确 `scopeRefs/contextRefs`、空错误与缺口、`inputChanged: false` 且摘要匹配；适用模拟必须实际通过，无适用场景另行说明；
   - 没有结果或源已变时交回 FM 阶段，不在 API 内再跑 FM 检查、编译校验或模拟；inspect 仅用于只读索引并核对摘要。

2. **执行六阶段模型到接口映射**：
   - 严格按照设计方法遍历该明确范围及必要依赖的全部对象与场景，不默默过滤不完整对象，不以同合同局部履约切片交付；
   - **阶段 1（根定界、弹性边界与服务编排）**：确立合同前、合同与领域 Context 独立 URI 寻址根，按异步等待点确定弹性边界；将形如 `/users/{userId}/subscriptions` 的合同列表清晰定义为主体服务与合同服务的函数求值与服务编排，而非主体拥有合同；
   - **阶段 2（寻址与形态基数）**：按 FM Relationship 决断单例（`shape: singleton`）与集合（`shape: collection`）；
   - **阶段 3（三线分流与全量闭包）**：按交互线分流前台 API、经办 API 与可视线以下的 `nonApiActivities`，确保全模型具体 Evidence、Thing、Participant 构成互斥闭包；
   - **阶段 4（场景驱动直达生成）**：由 FM 验证场景步骤直接生成能力，强制校验 `participant.party -> plays_role -> role.party` 实体扮演链，严格遵循 CR 哲学（写为 POST append_evidence，读为 GET read）；
   - **阶段 5（字段纯粹性与受控查询）**：严格拦截派生字段，计算属性服务端回填，不入请求体；受控推导集合查询参数；
   - **阶段 6（超媒体接续闭环）**：组装 HAL 表示与链接，构建 `http.journeys`，确保消费者可接续性。

3. **维护唯一设计源**：
   - 将完整设计写入 `.evidence/api/api.json`；每个接口都必须有契约；
   - 形成步骤、非接口活动、全部场景和 HTTP 接续均有可追溯去向，不用“暂不实现”隐藏遗漏。

4. **自动化静态检查与投影生成**：
   - 执行统一命令行检查与投影：
     ```bash
     # 可选索引；不是重复 FM 检查：
     "$PYTHON" -B "$API_SKILL_DIR/scripts/fm_api.py" inspect \
       --project-root "$PROJECT_ROOT" --fm-skill "$FM_SKILL_DIR" \
       --fm "$FM_ROOT" --fm-check "$FM_CHECK_FILE"

     # API 整体静态检查：
     "$PYTHON" -B "$API_SKILL_DIR/scripts/fm_api.py" check \
       --project-root "$PROJECT_ROOT" --fm-skill "$FM_SKILL_DIR" \
       --fm "$FM_ROOT" --fm-check "$FM_CHECK_FILE" --api "$API_FILE"

     # 仅有交付生成授权且完整检查通过时执行：
     "$PYTHON" -B "$API_SKILL_DIR/scripts/fm_api.py" project \
       --project-root "$PROJECT_ROOT" --fm-skill "$FM_SKILL_DIR" \
       --fm "$FM_ROOT" --fm-check "$FM_CHECK_FILE" --api "$API_FILE"
     ```
   - 路径使用实际绝对路径，三个命令复用同一份 `--fm-check` 结果；project 自动生成 OpenAPI、测试向量、超媒体样例并整体原子替换交付目录。

## 复核与交接

按校验纪律复核诊断及工具未覆盖的业务依赖。检查整体对象与场景覆盖、角色与实例约束、每项 HTTP 契约、消费者可接续性及输入新鲜度；`interfaceCount` 按角色能力计数。

交付产物须能清晰定位源差异、执行命令与退出码、整体覆盖率、输出路径与未决项。`runtimeValidated` 为 false，说明产物完成静态契约与测试向量校验，运行态环境留待部署验证。技术表达错误在授权范围内修正，业务身份、权限或模型缺口交接来源拥有者，不反向修改 FM。输入变化、检查失败或 gap 保留真实诊断和已改文件，不以局部交付声称完成；不自动安装或回滚。来自 Modeling 时返回入口接续联合审核；独立调用不自动生成页面、编码或操作 Git。
