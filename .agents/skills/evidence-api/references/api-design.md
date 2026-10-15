# 整体 API 设计流程

上游是 FM 已结束确认且完整性检查有效的明确范围及必要依赖；本阶段负责技术契约与投影，不重复业务确认，不把技术决定冒充业务事实。由独立的 `evidence-api` 执行，消费 FM 检查通过的结果，不再次检查同一 FM。首次需要完整链路样板时，读 [商品采购表达基线](../examples/full-lifecycle/README.md)；只有当前判断涉及该结构时才读对应 JSON，不照抄样例的身份、权限或协议选择。

## 按权限加载

定位项目根、完整 `.evidence/fm/`、当前 `.evidence/api/api.json` 及本包和 FM 包的实际绝对路径。读取已有差异；只修改本次授权的文件，保留无关改动，不自动迁移。

| 请求               | 加载与权限                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| 讨论设计方法       | [设计方法](api-method.md)，按问题选读 [HTTP 契约](api-contracts.md)；只解释，不写文件             |
| 生成或修改整体 API | 设计方法、[格式](api-format.md)、HTTP 契约及 [校验纪律](api-validation.md)；维护 API 源及全部交付 |
| 只校验 API         | 校验纪律；仅 check，可选 inspect，不修复、不保存项目报告                                          |
| 仅生成交付文件     | 校验纪律；完整检查后 project，不编辑设计源                                                        |
| 另行要求审核页     | 定位并读取 `evidence-visualization`；不复制展示工具                                               |

API 使用格式 5.0 的严格 JSON，上游为 FM v5；具体结构由格式参考维护。API 阶段的 FM 始终只读，API 源位于 FM 根之外。默认交付 `.evidence/api/generated/`，获授权的紧凑检查记录放 `.evidence/checks/api/`；不向 Skill 安装目录写项目产物。tests/、evals/ 的合成案例不作为业务默认值。

## 设计与投影

1. **承接 FM 结果**：使用 FM 阶段已实际通过的结果与当前完整模型。结果须为 `checkVersion: 4`、`consistent: true`、`complete: true`、明确 `scopeRefs/contextRefs`、空错误与缺口、`inputChanged: false` 且摘要匹配；适用模拟必须实际通过，无适用场景另行说明，不能只看 `valid`；没有结果或源已变时交回 FM 阶段，不在 API 内再跑 FM 检查、编译校验或模拟。需要对象索引时可执行 inspect，但它只读取当前源并核对摘要。
2. **形成完整设计**：按设计方法遍历该明确范围及必要依赖的全部对象与场景，不默默过滤不完整对象，不切开同合同付款和退款放行，依次确定资源、角色能力、表示／超媒体、消费者流程；不是按节点类型生成 CRUD。URI、幂等、并发、缓存等技术选择说明理由，身份、权限、数量及实例归属必须有业务依据。
3. **维护唯一源**：按格式把设计写入 api.json。每个接口都必须有契约；形成步骤、非接口活动、全部场景和 HTTP 接续均有可追溯去向，不用“暂不实现”隐藏遗漏。
4. **检查并投影**：保留 API 自身的整体覆盖与契约检查；check 无错误及 gap 后执行 project。仅生成分支跳过设计和源编辑；只校验分支不运行 project。

```bash
# 可选索引；不是重复 FM 检查：
"$PYTHON" -B "$API_SKILL_DIR/scripts/fm_api.py" inspect \
  --project-root "$PROJECT_ROOT" --fm-skill "$FM_SKILL_DIR" \
  --fm "$FM_ROOT" --fm-check "$FM_CHECK_FILE"

"$PYTHON" -B "$API_SKILL_DIR/scripts/fm_api.py" check \
  --project-root "$PROJECT_ROOT" --fm-skill "$FM_SKILL_DIR" \
  --fm "$FM_ROOT" --fm-check "$FM_CHECK_FILE" --api "$API_FILE"

# 仅有交付生成授权且完整检查通过时执行：
"$PYTHON" -B "$API_SKILL_DIR/scripts/fm_api.py" project \
  --project-root "$PROJECT_ROOT" --fm-skill "$FM_SKILL_DIR" \
  --fm "$FM_ROOT" --fm-check "$FM_CHECK_FILE" --api "$API_FILE"
```

路径使用实际绝对路径，Python 满足依赖；三个命令复用同一份 FM 结果，不触发 FM 校验。project 从统一机器投影生成全部文件并整体替换输出目录，失败保留原交付；不手改投影、OpenAPI 或样例。

## 复核与交接

按校验纪律复核诊断及工具未覆盖的业务依赖。检查整体对象／场景覆盖、角色与实例约束、每项 HTTP 契约、消费者可接续性及输入新鲜度；`interfaceCount` 按角色能力计数，不等于 OpenAPI 的 Path＋Method 数量。

交付须能定位本轮源差异、实际命令及退出码、整体覆盖、输出路径和未决项。`runtimeValidated` 恒为 false：静态消费者流程与合成 E2E 向量不证明服务、授权、数据库或外部集成已运行。

技术表达错误在授权范围内修正并重跑 API 检查；业务身份、权限、数量或来源缺口交给来源拥有者，不反向修改 FM。输入变化、检查失败或 gap 保留真实诊断和已改文件，不以局部交付声称完成；不自动安装或回滚。来自 Modeling 时返回入口接续联合审核；独立调用不自动生成页面、批准、编码或操作 Git。
