---
name: evidence-api
description: 当用户讨论 API 设计方法，或要求基于 FM 的明确就绪范围及必要依赖 设计、修改、校验 API、生成 OpenAPI 与静态消费者流程时使用。维护唯一 API 设计源、整体覆盖、HTTP 契约和投影；消费有效 FM 检查结果，不修改 FM、不重复业务确认或实现服务。
compatibility: 讨论只需文本；校验与投影需 Python 3.10+、本包 requirements.txt，以及通过资源发现定位且满足依赖的 evidence-fm；两包无需相邻。
---

# Evidence API 设计

本包独立维护技术契约与派生产物。业务事实及 FM 校验归 `evidence-fm`，完整生成的阶段接续归 `evidence-modeling`；API 始终只读消费已结束确认且完整性检查有效的明确范围及必要依赖，不消费所有尚在生长的对象。

## Guides

先确定讨论、设计编辑、只读校验或仅生成投影。读取项目权限、实际来源、已有文件与 Git 差异，只修改本次授权的文件，保留无关改动，不自动迁移。只聊不落盘不写文件；只校验不修复、不保存项目报告。

| 当前动作           | 必要参考                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 讨论 API 方法      | [设计方法](references/api-method.md)，按问题选读 [HTTP 契约](references/api-contracts.md)                                              |
| 设计或修改整体 API | [设计流程](references/api-design.md)、设计方法、[格式](references/api-format.md)、HTTP 契约及 [校验纪律](references/api-validation.md) |
| 只校验或仅生成投影 | 校验纪律；投影必须通过完整检查，不编辑设计源                                                                                           |

首次需要链路样板时读 [商品采购基线](examples/full-lifecycle/README.md)，只按当前问题加载对应 JSON。样例不是业务事实、默认权限或 FM 编辑准入依据；tests/、evals/ 仅用于维护。

默认输入为 `.evidence/fm/` 和其外的 `.evidence/api/api.json`；输出为 `.evidence/api/generated/`，获授权紧凑检查记录为 `.evidence/checks/api/`。项目产物不写入 Skill 安装目录。通过资源发现或用户指定路径定位 FM 包，不假设兄弟目录；领域语言按 FM 的 `references/domain-language.md` 直接消费当前 Entity 及其属性的规范名称与含义，不修改 FM 或创建额外定义文件。

## Action

1. **承接输入与权限。** 定位项目、本包及 FM 包的实际绝对路径，核对允许文件与当前整体模型。消费 `checkVersion: 2`、`consistent: true`、`complete: true`、明确 `scopeRefs/contextRefs`、空错误与缺口、输入未变且摘要匹配的 FM 范围结果；适用模拟须实际通过，无适用场景单独说明。仅有 `valid: true` 不可消费；没有有效结果时交给 `evidence-fm` 的只读检查分支取得一次结果，再返回本包，不由 API 工具隐式重查或要求重新业务确认。完成时，来源、运行依赖、FM 结果与分支出口明确。
2. **维护获授权契约。** 讨论只解释判断与未知；编辑按设计流程遍历明确范围及依赖中的全部对象和场景，不默默过滤不完整对象，不以同合同局部履约切片交付；形成资源、角色能力、HTTP 契约及可接续消费者流程，维护唯一 api.json。只读校验或仅投影不编辑两源。完成时，接口与非接口活动均有依据，权限、数量及实例归属不靠技术猜测补齐。
3. **检查并交付。** 按 Sensors 消费同一 FM 结果执行 API 自身检查；通过后才按授权生成完整投影。只校验不 project、不生成页面。完成时，实际差异、整体覆盖、检查及未执行项可定位；来自 Modeling 时交回入口接续联合审核，独立调用交接后停止。

## Sensors

读取校验纪律，设置实际绝对路径与已满足依赖的 Python：

```bash
"$PYTHON" -B "$API_SKILL_DIR/scripts/fm_api.py" check \
  --project-root "$PROJECT_ROOT" --fm-skill "$FM_SKILL_DIR" \
  --fm "$FM_ROOT" --fm-check "$FM_CHECK_FILE" --api "$API_FILE"

# 仅有投影授权且完整检查通过时：
"$PYTHON" -B "$API_SKILL_DIR/scripts/fm_api.py" project \
  --project-root "$PROJECT_ROOT" --fm-skill "$FM_SKILL_DIR" \
  --fm "$FM_ROOT" --fm-check "$FM_CHECK_FILE" --api "$API_FILE"
```

inspect 是可选只读索引，不是再次 FM 准入。三个命令复用 `--fm-check`，只核对摘要和范围，不运行 FM 检查、编译校验或模拟。FM 包路径由 `--fm-skill` 或显式设置的 `EVIDENCE_FM_SKILL` 提供。

核对退出码、诊断与整体对象／场景覆盖、每项 HTTP 契约及成功消费步骤。`runtimeValidated` 恒为 false；静态流程与 E2E 向量不证明服务、授权、数据库或外部集成已运行。机器通过不等于业务批准。

## Steer

- **技术表达错误**：只在 API 授权内修正并复验，不反向修改 FM 或业务预期。
- **业务身份、权限、数量或来源缺口**：停止受影响阶段，交接来源拥有者；不自行访谈或补造事实。
- **FM 结果缺失、失败或摘要失配**：返回 FM 只读检查阶段，不隐式重跑，不扩大为模型编辑。
- **环境、保存或检查失败**：保留真实错误与已改文件，分别报告部分结果；不自动安装、回滚或重建旧页面。
- **完成**：报告文件、实际检查与未决项后停止。不自动生成页面；另行要求时定位 `evidence-visualization`。批准、需求、实施与 Git 操作保持各自授权边界。
