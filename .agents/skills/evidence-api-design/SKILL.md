---
name: evidence-api-design
description: 从整体 FM Schema v3 直接设计全部业务 API，维护统一 api.json，生成完整 HTTP 契约、OpenAPI 3.1、分布式超媒体及可追溯消费者流程。用户要求 FM 到 REST API、整体接口设计、HAL、HATEOAS、幂等、缓存、API 校验、消费者流程或 OpenAPI 生成时使用；不修改上游 FM，不生成 Controller，不虚构权限。
compatibility: Python 3.10+；依赖 requirements.txt；需要可定位的 evidence-fm Skill。
---

# Evidence 整体 API 设计

上游是整体 FM。沿用其业务事实、责任、角色和规则，直接完成技术设计及交付，不重复业务确认，也不设置人工接口筛选或发布关卡。接口清单是最终设计索引；Party Role 只有被 `participant.party` 通过 `plays_role` 明确扮演时才可成为 API 调用角色。

## 执行边界

- 讨论：只解释方法和缺口，不写文件。
- 生成／修改：用户请求就是本次编辑和生成授权。读取当前文件及已有差异，直接维护 `api.json`、校验并生成全部交付文件，不停在草稿或再次请求输出目录确认。
- 只校验：只运行 inspect/check 并报告真实结果，不修改 FM、API、发现记录或报告。
- 仅生成交付文件：校验现有完整设计后运行 project，不重写设计源。
- 另行要求可视化审核页：通过资源发现定位 `evidence-visualization` 并读取其 `SKILL.md`，复用其生成器；不重复维护展示工具，也不为展示修改 FM 或 API。普通 API 设计结束不自动生成视图。

整体 FM 合法不表示所有技术细节均可机械推导。URI、表示、幂等、缓存等技术选择由本任务形成并记录理由；权限、业务数量、实例归属或关键数据来源若确实缺失，报告具体阻塞，不补造业务规则、不修改 FM 来通过校验。API 设计源使用严格 JSON：拒绝注释、尾部逗号、重复 JSON key、`NaN`/`Infinity`、非对象根和多文档，不再接受 YAML。

## 项目产物位置

默认位置相对项目根：

- FM 输入：`.evidence/fm/`，始终只读。
- 唯一 API 设计源：`.evidence/api/api.json`，采用 API 格式 `5.0`，位于 FM 根目录之外；上游仍为 FM v3。文件按严格 JSON 解析，不用 YAML 表达设计。
- API 交付：`.evidence/api/generated/`，包含机器投影、OpenAPI、表示样例、合成 E2E 测试向量、可追溯 HTTP 流程、消费者覆盖、导航图和 manifest；每次完整校验后直接更新，历史由 Git 管理。人工审核统一使用 `evidence-visualization` 生成的页面，不再生成重复的 Markdown 报告。
- 按需保存的检查记录（紧凑运行清单，不复制投影或契约全文）：`.evidence/checks/api/<批次>/`；只校验请求不落盘。

沿用已有文件与用户显式指定路径，不自动迁移其他布局。默认直接更新 `generated/`：先在同一父目录生成完整临时结果，再切换整个目录并删除过期产物；失败恢复原目录。Git 保存版本历史，不按生成批次累积目录。只修改本次授权的文件；`.evidence/` 不授予其他文件或业务确认记录的修改权限。

## 工作流

1. 定位项目根、完整 FM 根、`evidence-fm` Skill 绝对目录、场景及现有 API 文件；读取 [设计方法](references/method.md)、[格式](references/format.md) 和 [校验纪律](references/validation.md)。
2. 每次消费当前 FM 都运行 `inspect`，检查结构、规则、证据与时间线一致性，保留输入摘要及上游状态元数据。这是技术完整性检查，不是再次确认业务；不得仅凭旧报告判断当前输入有效。
3. 按“资源结构 → 角色能力 → 表示/超媒体 → 消费流程”设计全部模型：遍历全部 Context、具体 Evidence、Thing、Participant、责任角色及全部 FM 场景。为整体模型支持且调用角色已由 `participant.party` 扮演的每项业务交互设计接口；不是按节点类型生成 CRUD。Context 和角色本身不自动成为业务资源，未被 Participant Party 扮演的 Party Role 不产生 API capability。Contract 的 GET 列表接口必须以具体 Participant Party 类型为 URL 根，不能暴露无主体范围的全局合同集合或统称 `/parties` 集合。
4. 直接声明资源、业务名称、URI、实例归属与数量，以及所有接口的角色、方法、效果、场景、实例约束和规则。无玩家 Party Role 负责形成的对象，用有 FM／业务依据的 `nonApiActivities` 回映其形成步骤；内部及外部活动不以技术决定或“暂不实现”隐藏遗漏。
5. 为每个接口填写同一文件 `http` 中的完整契约：资源表示、字段来源、HAL 链接、幂等、并发、缓存、分页、类型化入口和响应/Location 接续，遵循 [HTTP 契约](references/contracts.md)。每个接口都必须有契约；不能用空 HTTP 文档或自由文本入口代替交付。
6. 回映全部 FM 场景及其每一步，并将 HTTP journey 的每个请求绑定到业务步骤或明确的 API-only 读取流程。首步必须引用有依据的 `entryPointRef`，后续步骤只能通过返回的 HAL `rel`、`self`/`next` 或 `Location` 接续；检查角色、凭证效果、实例关联、证据先后、非接口活动和跨角色交接。整体对象遗漏、整个场景遗漏、错配接口或不可接续流程均为诊断。
7. 运行 `check`，修正技术问题并重跑。全部接口和整体覆盖无检测到的错误或缺口后运行 `project`；未完成时明确报告，不能生成一套局部文件声称完整交付。
8. 展示实际差异、接口数、整体覆盖、契约及交付路径后停止。不自动进入编码，不自动暂存、提交或回滚。

## HTTP 与业务边界

- 所有能力自动要求 HTTP 契约；`http.operations[].capabilityRef` 复用顶层接口定义，不重复维护 URI、Method 或角色。
- 字段白名单保留 client/reference/server/derived 口径；required 不等于客户端输入。模型业务时间不替换成服务器当前时间、入库或回调到达时间。
- Evidence 通过 POST 追加，不覆盖删除。登记合同不等于签署，形成 Confirmation 不等于履约完成。
- 必需补充证据必须先存在、可见且属于本业务实例。外部玩家结果仍属于其外部责任；不虚构支付回调或第三方接口。
- 角色及访问范围沿用上游；只有存在 `participant.party -> plays_role -> role.party` 的 Party Role 才生成调用接口。Contract 列表读取按具体 Participant Party 类型根过滤，例如 `/users/{userId}` 或 `/customers/{customerId}`，避免把同一合同的两方角色混成全局列表或统称 `/parties`。岗位、经办主体和 Evidence Role 不自动成为调用角色或获得额外权限。
- `http.journeys` 是静态消费者流程：必须声明 `scenarioRefs`；第一步使用有依据的 `entryPointRef`，后续步骤引用已映射前序响应的超媒体链接或 `Location`。`sourceStepRefs` 将请求与 FM 业务步骤精确关联；没有 FM 形成步骤的读取流程可以为空，但仍须有能力成功覆盖。静态流程不执行真实服务，`runtimeValidated` 恒为 false。

## 命令

设置实际绝对路径；默认输出固定为项目的 `.evidence/api/generated/`：

```bash
FM_ROOT="$PROJECT_ROOT/.evidence/fm"
API_FILE="$PROJECT_ROOT/.evidence/api/api.json"

"$PYTHON" "$API_SKILL_DIR/scripts/fm_api.py" inspect \
  --project-root "$PROJECT_ROOT" --fm "$FM_ROOT" --fm-skill "$FM_SKILL_DIR"

"$PYTHON" "$API_SKILL_DIR/scripts/fm_api.py" check \
  --project-root "$PROJECT_ROOT" --fm "$FM_ROOT" --fm-skill "$FM_SKILL_DIR" \
  --api "$API_FILE"

"$PYTHON" "$API_SKILL_DIR/scripts/fm_api.py" project \
  --project-root "$PROJECT_ROOT" --fm "$FM_ROOT" --fm-skill "$FM_SKILL_DIR" \
  --api "$API_FILE"
```

完整性检查始终执行；存在 gap 时 check/project 返回非零且不改现有交付目录。结果中的 `interfaceCount` 按角色能力计数；同路由角色变体在 OpenAPI 合并，因此不等于 Path＋Method 数量。

`projection.json` 是唯一机器中间结果，OpenAPI、表示样例、流程、消费者覆盖、导航图、E2E 测试向量和 manifest 从它生成，不回写 API 设计，不手改生成文件。接口清单、覆盖和 HTTP 契约由 `evidence-visualization` 直接消费当前投影展示，不再维护派生 Markdown。检查通过不替代运行时授权和接口验收。`e2e-test-vectors.json` 只提供确定性的合成请求、预期响应与来源场景；数据库装载、认证身份和外部系统 Stub 仍由实现及验收任务决定。

## 测试案例

商品采购协议完整生命周期测试案例（Skill 维护材料，位于包内 `tests/fixtures/full-lifecycle/`，不随业务入口加载）覆盖整体 FM：询价、报价、采购协议、支付、开票、发货及商品读取，共 13 个角色接口与完整 HTTP 契约；微信支付与经办主体均在整体覆盖中说明其处理方式。案例字段、时间、请求响应和协议策略是合成数据，不是生产业务默认值。
