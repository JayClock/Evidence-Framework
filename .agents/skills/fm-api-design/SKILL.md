---
name: fm-api-design
description: 从已确认的整体 FM Schema v3 直接设计全部业务 API，维护统一 api.yaml，生成完整 HTTP 契约、OpenAPI 3.1、超媒体及消费者流程。用户要求 FM 到 REST API、整体接口设计、HAL、幂等、API 校验或 OpenAPI 生成时使用；不修改上游 FM，不生成 Controller，不虚构权限。
compatibility: Python 3.10+；依赖 requirements.txt；需要可定位的 evidence-fm Skill。
---

# FM → 完整 API 设计

上游是已确认的整体 FM。沿用其业务事实、责任、角色和规则，直接完成技术设计及交付，不重新组织业务确认，也不设置接口筛选或发布关卡。接口清单是最终设计索引。

## 执行边界

- 讨论：只解释方法和缺口，不写文件。
- 生成／修改：用户请求就是本次编辑和生成授权。读取当前文件及已有差异，直接维护 `api.yaml`、校验并生成全部交付文件，不停在草稿或再次请求输出目录确认。
- 只校验：只运行 inspect/check 并报告真实结果，不修改 FM、API、发现记录或报告。
- 仅生成交付文件：校验现有完整设计后运行 project，不重写设计源。

FM 已确认不表示所有技术细节均可机械推导。URI、表示、幂等、缓存等技术选择由本任务形成并记录理由；权限、业务数量、实例归属或关键数据来源若确实缺失，报告具体阻塞，不补造业务规则、不修改 FM 来通过校验。

## 项目产物位置

默认位置相对项目根：

- FM 输入：`.evidence/fm/`，始终只读。
- 唯一 API 设计源：`.evidence/api/api.yaml`，采用 API 格式 `4.0`，位于 FM 根目录之外；上游仍为 FM v3。
- API 交付：`.evidence/api/generated/<批次>/`，包含投影、接口清单、完整 HTTP 契约、OpenAPI、样例、流程和 manifest。
- 按需保存的检查记录：`.evidence/checks/api/<批次>/`；只校验请求不落盘。

沿用已有文件与用户显式指定路径，不自动迁移。没有指定输出目录时，在 generated 下选取尚不存在的批次目录并告知，不为路径再设确认步骤。只创建父目录，不预建批次目录，不覆盖旧输出。`.evidence/` 不授予宿主状态写权限，不改 `state.json`、审批或运行记录；项目文件权限仍优先。

## 工作流

1. 定位项目根、完整 FM 根、`evidence-fm` Skill 绝对目录、场景及现有 API 文件；读取 [设计方法](references/method.md)、[格式](references/format.md) 和 [校验纪律](references/validation.md)。
2. 每次消费当前 FM 都运行 `inspect`，检查结构、规则、证据与时间线一致性，保留输入摘要及上游状态元数据。这是技术完整性检查，不是再次确认业务；不得仅凭旧报告判断当前输入有效。
3. 遍历全部 Context、具体 Evidence、Thing、Participant、责任角色及全部 FM 场景。为整体模型支持的每项业务交互设计接口；不是按节点类型生成 CRUD。Context 和角色本身不自动成为业务资源。
4. 直接声明资源、业务名称、URI、实例归属与数量，以及所有接口的角色、方法、效果、场景、实例约束和规则。内部及外部活动用有 FM／业务依据的 `nonApiActivities` 明确表达，不以技术决定或“暂不实现”隐藏遗漏。
5. 为每个接口填写同一文件 `http` 中的请求、响应、字段来源、表示、超媒体、幂等、并发、缓存及成功消费流程，遵循 [HTTP 契约](references/contracts.md)。每个接口都必须有契约；不能用空 HTTP 文档代替交付。
6. 回映全部 FM 场景及其每一步，检查角色、凭证效果、实例关联、证据先后和非接口活动。整体对象遗漏、整个场景遗漏、错配接口均为诊断。
7. 运行 `check`，修正技术问题并重跑。全部接口和整体覆盖无检测到的错误或缺口后运行 `project`；未完成时明确报告，不能生成一套局部文件声称完整交付。
8. 展示实际差异、接口数、整体覆盖、契约及交付路径后停止。不自动进入编码，不自动暂存、提交或回滚。

## HTTP 与业务边界

- 所有能力自动要求 HTTP 契约；`http.operations[].capabilityRef` 复用顶层接口定义，不重复维护 URI、Method 或角色。
- 字段白名单保留 client/reference/server/derived 口径；required 不等于客户端输入。模型业务时间不替换成服务器当前时间、入库或回调到达时间。
- Evidence 通过 POST 追加，不覆盖删除。登记合同不等于签署，形成 Confirmation 不等于履约完成。
- 必需补充证据必须先存在、可见且属于本业务实例。外部玩家结果仍属于其外部责任；不虚构支付回调或第三方接口。
- 角色及访问范围沿用上游，岗位、经办主体和 Evidence Role 不自动成为调用角色或获得额外权限。
- HAL 链接引用实际接口；条件未求值不等于可用。静态消费流程不执行真实服务，`runtimeValidated` 恒为 false。

## 命令

设置实际绝对路径；`BATCH` 为尚不存在的输出批次名：

```bash
FM_ROOT="$PROJECT_ROOT/.evidence/fm"
API_FILE="$PROJECT_ROOT/.evidence/api/api.yaml"
NEW_OUTPUT_DIR="$PROJECT_ROOT/.evidence/api/generated/$BATCH"

"$PYTHON" "$API_SKILL_DIR/scripts/fm_api.py" inspect \
  --project-root "$PROJECT_ROOT" --fm "$FM_ROOT" --fm-skill "$FM_SKILL_DIR"

"$PYTHON" "$API_SKILL_DIR/scripts/fm_api.py" check \
  --project-root "$PROJECT_ROOT" --fm "$FM_ROOT" --fm-skill "$FM_SKILL_DIR" \
  --api "$API_FILE"

"$PYTHON" "$API_SKILL_DIR/scripts/fm_api.py" project \
  --project-root "$PROJECT_ROOT" --fm "$FM_ROOT" --fm-skill "$FM_SKILL_DIR" \
  --api "$API_FILE" --out "$NEW_OUTPUT_DIR"
```

完整性检查始终执行；存在 gap 时 check/project 返回非零，project 不写交付目录。结果中的 `interfaceCount` 按角色能力计数；同路由角色变体在 OpenAPI 合并，因此不等于 Path＋Method 数量。

`projection.json` 是唯一机器中间结果，其余七份交付文件从它生成，不回写 API 设计，不手改生成文件。检查通过不替代运行时授权和接口验收。

## 示例

[商品采购协议示例](assets/examples/full-lifecycle/README.md) 覆盖整体 FM：询价、报价、采购协议、支付、开票、发货及商品读取，共 13 个角色接口与完整 HTTP 契约；微信支付与经办主体均在整体覆盖中说明其处理方式。示例字段、时间、请求响应和协议策略是合成数据，不是生产业务默认值。
