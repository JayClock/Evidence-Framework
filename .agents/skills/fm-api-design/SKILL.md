---
name: fm-api-design
description: 基于 FM Schema v3 和有来源场景维护统一 api.yaml，设计角色×URI×HTTP 方法×业务能力候选、资源表示、超媒体、缓存分页及消费者流程契约。用户提到 FM 到 REST API、API 契约、HAL、幂等、校验 api.yaml 或生成 OpenAPI 3.1 时使用；不用于修改 FM、生成 Controller 或补造权限。
compatibility: Python 3.10+；依赖 requirements.txt；需要可定位的 evidence-fm Skill。
---

# FM → API 设计

以 FM 为业务依据，以项目中的一份 `api.yaml` 保存 API 设计选择。Skill 负责有依据的判断，CLI 负责确定性校验和静态投影，不批准业务事实，不执行服务端授权。

## 执行边界

- 讨论：只说明方法和缺口，不写文件。
- 生成设计：先 inspect，再形成新的 `api.yaml` 草稿；没有明确目标不覆盖已有文件。
- 只校验：只运行 check，不修改 FM、API 或输出。
- 投影：用户明确指定新目录后运行 project。
- 修改设计：展示拟修改内容和依据，按明确授权修改指定 `api.yaml`。

API 设计中的新业务规则返回 FM 建模／发现任务处理。技术决定不能代替角色权限、期限、实例归属或关键数据来源。

## 项目产物位置

新产物默认统一放在项目根的 `.evidence/`：

- FM 输入：`.evidence/fm/`，始终只读。
- API 设计源：`.evidence/api/api.yaml`，位于 FM 根目录之外。
- 需留存的 inspect/check 结果：`.evidence/api/checks/<批次>/`；仅在请求保存检查记录时写入，只校验不落盘。
- API 投影：`.evidence/api/generated/<批次>/`，包含 projection、报告、HTTP 契约、OpenAPI、样例与 manifest；每次选择尚不存在的新目录。

沿用已有文件与用户显式指定路径，不自动迁移，不因默认目录存在而覆盖内容。投影前展示并确认具体的新输出目录；默认路径不是执行授权。`.evidence/` 不授予宿主状态写权限，不改宿主拥有的 `state.json`、审批或运行记录；项目文件权限与提交要求仍优先。

## 工作流

1. 定位项目根、FM 根、`evidence-fm` Skill 绝对目录、已有业务场景和 `api.yaml`。API 文件在 FM 根目录之外。
2. 阅读 [方法](references/method.md)；写配置时读 [格式](references/format.md)，运行前读 [校验纪律](references/validation.md)。
3. 运行 `inspect`，保留真实 FM 检查摘要、审核状态、角色、资源线索和场景。
4. 检查凭证形成依赖：谁提供什么补充证据，目标凭证形成前是否已存在、可见并属于本业务实例。依据不足返回缺口，不用接口成功响应代替业务证据。
5. 声明有来源的资源名称、路径、实例归属和业务数量；逐层选择 singleton 或 collection。Context 是边界，不自动成为 CRUD 资源；一般引用、precedes 或单独基数不证明聚合。
6. 为能力说明调用 Party Role、视图、方法、效果、场景、实例约束和依据。Participant、岗位、经办人和 Evidence Role 不自动成为调用角色。同一合同责任范围内的凭证使用 Contract 绑定角色，角色复用不合并不同 Context 的 URI 根。
7. 顶层 `representations` 记录有来源的字段与导航草图，`journeys` 回映 FM 场景。涉及完整 HTTP 交互时填写同一文件的 `http`，遵循 [HTTP 契约](references/contracts.md)。本次未选择 HTTP 设计范围时显式写 `http: null`。
8. 运行 `check`，修复技术错误；业务、设计、表达和覆盖缺口保持 gap，不扩大权限或削弱预期来消除诊断。
9. 用户要求生成时，在指定的新目录 `project`，展示候选、契约、来源、实例约束、覆盖和未决项后停止。

## HTTP 设计

`api.yaml.http` 用 `scopeCapabilityRefs` 指向本文件的已选能力，不重复声明 API 身份、格式版本、URI 或 Method。

- 字段采用白名单，保留 FM 来源及 client/reference/server/derived 口径。required 不等于客户端输入。
- 链接与动作具有明确的参数来源、角色和条件。未求值的条件保留 gap，不假定可执行。
- 明确成功／失败响应、201／202 定位、幂等并发、缓存分页，不套固定 TTL 或业务期限。
- HTTP journey 描述入口、前序响应字段／头和链接导航；它不是 FM 签发步骤的复制，不为读取伪造 Evidence。
- `runtimeValidated` 恒为 false。静态样例检查不替代真实业务、授权、前置条件或接口执行验证。

## 命令

设置绝对路径；新项目采用以下默认值，`BATCH` 为已确认的本次输出目录名。按需创建输出父目录，不预先创建 `NEW_OUTPUT_DIR`：

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

要求本次声明范围无 gap 时增加 `--require-complete`；它不表示完整 REST、业务批准或运行验证。

`projection.json` 是唯一机器中间结果，所有 Markdown、样例和 `openapi.yaml` 均从它渲染。输出固定包含投影、四列表、设计报告、HTTP 契约、OpenAPI 3.1、表示样例、HTTP 流程和 manifest。OpenAPI 是交付投影，不回写 API 设计，也不把角色直接解释为认证配置。没有 HTTP 范围时生成空 paths 并标记 unselected，不声称完成了契约。

## 示例

[商品采购协议示例](assets/examples/full-lifecycle/README.md) 以一份 [api.yaml](assets/examples/full-lifecycle/api.yaml) 声明询价、报价、采购协议及支付、开票、发货能力，并细化商品读取的 HTTP 契约。合成字段和协议选择不是生产业务批准。

## 业务语义与文件纪律

- FM 只读，不把 URI、Method、DTO 或部署信息写入业务模型。
- GET 只读；Evidence 通过 POST 追加，不覆盖。单例省略冗余定位参数，不取消凭证身份和审计记录。
- 登记合同不等于签署，提交 Confirmation 不等于 Completion Rule 已满足。
- 保留六类 Evidence 的时间含义；形成、签署、确认不等于入库或回调到达。
- 每层 parent-child 关系和调用者实例范围必须明确；`responsibleRoleRef` 与 `plays_role` 不授予全局权限。
- Evidence Role 是证据玩家插槽，不生成提交接口；外部活动保持 external，不猜回调或接入 API。
- project 只创建新目录，不覆盖、不提交 Git、不修改扩展或项目工作流状态。
