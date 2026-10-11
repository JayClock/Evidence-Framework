---
name: evidence-api-design
description: 当用户要求从 FM 设计或修改整体业务 API、校验 api.json、生成 OpenAPI 或静态消费者流程时使用。交付统一 HTTP 契约及整体覆盖；不用于普通接口编码、运行时调试或上游 FM 修改。
compatibility: Python 3.10+、本包 requirements.txt，以及可定位且满足依赖的 evidence-fm。
---

# Evidence 整体 API 设计

上游是整体 FM；本包负责技术契约与投影，不重复业务确认，不把技术决定冒充业务事实。

## Guides

定位项目根、完整 `.evidence/fm/`、当前 `.evidence/api/api.json` 及 FM Skill 的实际绝对路径。读取已有差异；只修改本次授权的文件，保留无关改动，不自动迁移。

| 请求               | 加载与权限                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| 讨论设计方法       | [设计方法](references/method.md)，按问题选读 [HTTP 契约](references/contracts.md)；只解释，不写文件             |
| 生成或修改整体 API | 设计方法、[格式](references/format.md)、HTTP 契约及 [校验纪律](references/validation.md)；维护 API 源及全部交付 |
| 只校验 API         | 校验纪律；仅 inspect/check，不修复、不保存报告                                                                  |
| 仅生成交付文件     | 校验纪律；检查已有完整设计后 project，不编辑设计源                                                              |
| 另行要求审核页     | 定位并读取 `evidence-visualization`；不复制展示工具                                                             |

API 使用格式 5.0 的严格 JSON，上游为 FM v4；具体结构由格式参考维护。FM 始终只读，API 源位于 FM 根之外。默认交付 `.evidence/api/generated/`，获授权的紧凑检查记录放 `.evidence/checks/api/`；不向 Skill 安装目录写项目产物。

独立生成请求和 `evidence-modeling` 的一体生成均可授权本轮 API 编辑；明确只修改 FM 不授权本包写入。tests/、evals/ 的合成案例不作为业务默认值。

## Action

1. **检查输入**：每次消费当前 FM 都执行 inspect，不依赖旧报告或 generated 模型。业务依据沿用来源，机器检查不构成批准。
2. **形成完整设计**：按设计方法遍历整体对象与全部场景，依次确定资源、角色能力、表示／超媒体、消费者流程；不是按节点类型生成 CRUD。URI、幂等、并发、缓存等技术选择说明理由，身份、权限、数量及实例归属必须有业务依据。
3. **维护唯一源**：按格式把设计写入 api.json。每个接口都必须有契约；形成步骤、非接口活动、全部场景和 HTTP 接续均有可追溯去向，不用“暂不实现”隐藏遗漏。
4. **检查并投影**：check 无错误及 gap 后才执行 project。仅生成分支跳过设计和源编辑；只校验分支不运行 project。

```bash
"$PYTHON" -B "$API_SKILL_DIR/scripts/fm_api.py" inspect \
  --project-root "$PROJECT_ROOT" --fm "$FM_ROOT" --fm-skill "$FM_SKILL_DIR"

"$PYTHON" -B "$API_SKILL_DIR/scripts/fm_api.py" check \
  --project-root "$PROJECT_ROOT" --fm "$FM_ROOT" --fm-skill "$FM_SKILL_DIR" \
  --api "$API_FILE"

# 仅有交付生成授权且完整检查通过时执行：
"$PYTHON" -B "$API_SKILL_DIR/scripts/fm_api.py" project \
  --project-root "$PROJECT_ROOT" --fm "$FM_ROOT" --fm-skill "$FM_SKILL_DIR" \
  --api "$API_FILE"
```

路径使用实际绝对路径，Python 满足依赖。project 从统一机器投影生成全部文件并整体替换输出目录，失败保留原交付；不手改投影、OpenAPI 或样例。

## Sensors

按校验纪律复核诊断及工具未覆盖的业务依赖。检查整体对象／场景覆盖、角色与实例约束、每项 HTTP 契约、消费者可接续性及输入新鲜度；`interfaceCount` 按角色能力计数，不等于 OpenAPI 的 Path＋Method 数量。

交付须能定位本轮源差异、实际命令及退出码、整体覆盖、输出路径和未决项。`runtimeValidated` 恒为 false：静态消费者流程与合成 E2E 向量不证明服务、授权、数据库或外部集成已运行。

## Steer

- 技术表达错误：在授权范围内修正并重跑；业务身份、权限、数量或来源缺口：停止并交给来源拥有者，不反向修改 FM。
- 工具缺失、输入变化、检查失败或 gap：保留真实诊断和已改文件，不以局部交付声称完成；不自动安装、不回滚源文件。
- 完成：交接实际差异、覆盖及交付路径后停止。来自 Modeling 时返回入口接续联合审核；独立调用不自动生成页面、批准、编码或操作 Git。
