---
name: fm-api-design
description: 基于已生成的 FM Schema v3 YAML 模型和有来源业务场景，设计、校验并投影角色×URI×HTTP 方法×业务能力候选，同时检查资源层次、实例范围、Evidence 追加语义、超媒体链接和流程覆盖。用户提到从 FM 设计 REST API、生成 API 候选四列表、检查 docs/api/design.yaml 或 FM 到接口映射时使用；不用于修改 FM、生成 Controller/OpenAPI 或补造业务权限。
compatibility: Python 3.10+；依赖 requirements.txt；需要可定位的 evidence-fm Skill。
---

# FM → API 设计

将 FM 与已有业务场景转换为**可审查的 API 候选**。Skill 负责有依据的设计判断；CLI 只做确定性校验和投影，不批准业务事实。

## 先判断请求类型

区分以下意图后再行动：

- **讨论**：只说明方法和缺口，不写文件。
- **生成候选**：先 inspect，再形成新的设计草稿；没有明确目标时不要覆盖已有设计。
- **只校验**：只运行 check，不修改 FM、设计或输出。
- **投影**：用户明确指定新输出目录后运行 project。
- **修改已有设计**：先展示拟修改内容和依据，取得明确授权后才改指定文件。

API 设计中的新业务规则必须返回 FM 建模／发现任务处理。技术决定可以记录在 `decisions`，但不能代替角色权限、期限、实例归属或业务来源。

## 工作流

1. 定位项目根、FM 根、`evidence-fm` Skill 绝对目录、已有业务场景和 API 设计。
2. 阅读 [方法](references/method.md)；写配置时再读 [格式](references/format.md)，运行前读 [校验与保存纪律](references/validation.md)。
3. 用 Python 3.10+ 运行 `inspect`。保留真实 FM 检查摘要、模型审核状态、角色、资源线索和场景。
4. 只把有来源且影响当前范围的对象映射为资源。Context 默认是边界，不自动成为 CRUD 资源；`precedes`、一般 `references` 或单独基数不证明聚合。
5. 为每个能力说明调用 Party Role、资源视图、方法、效果、场景、实例约束和依据。Evidence Role 不是调用者；`responsibleRoleRef` 不是全局授权。
6. 运行 `check`，修复技术错误；业务、设计、表达和覆盖缺口保持为 gap，不扩大权限或削弱预期来消除诊断。
7. 用户明确要求生成时，使用一个不存在的新目录运行 `project`。展示四列表、来源、实例约束、流程覆盖和未决项后停止。

## 命令

设置绝对路径：

```bash
"$PYTHON" "$API_SKILL_DIR/scripts/fm_api.py" inspect \
  --project-root "$PROJECT_ROOT" --fm "$FM_ROOT" --fm-skill "$FM_SKILL_DIR"

"$PYTHON" "$API_SKILL_DIR/scripts/fm_api.py" check \
  --project-root "$PROJECT_ROOT" --fm "$FM_ROOT" --fm-skill "$FM_SKILL_DIR" \
  --design "$DESIGN_FILE"

"$PYTHON" "$API_SKILL_DIR/scripts/fm_api.py" project \
  --project-root "$PROJECT_ROOT" --fm "$FM_ROOT" --fm-skill "$FM_SKILL_DIR" \
  --design "$DESIGN_FILE" --out "$NEW_OUTPUT_DIR"
```

只有要求本次设计范围无 gap 时增加 `--require-complete`。它不代表完整 REST、业务批准或运行验证。

## 完整示例

需要查看 RFP → Proposal → Contract，以及支付、开票、发货三组 Request → Confirmation → Other Evidence 全链路时，使用 [商品采购协议完整示例](assets/examples/full-lifecycle/README.md)。示例补齐 Context、Role、Participant、Thing、Rule、Relationship、可执行 FM 场景和 API 候选。

## 不可越过的边界

- 不修改 FM，不把 URI、Method、DTO 或部署信息写入 FM。
- 不自动生成 CRUD、调用角色、GET 链接或“审批”端点。
- GET 只读；Evidence 只能读取或通过 POST 追加。登记合同不等于签署，提交 Confirmation 不等于 Completion Rule 已满足。
- 保持 `started_at`、`expired_at`、`signed_at`、`confirmed_at`、`created_at` 的 FM 业务含义；required 不等于客户端自由输入。
- 路径嵌套不证明实例归属。调用者范围和每层 parent-child 约束必须明确。
- `projection.json` 是唯一机器中间结果；Markdown 只能渲染它。静态 coverage 不写成 passed。
- project 只创建新目录；不使用 `--force`，不提交 Git，不修改宿主扩展或项目工作流状态。
