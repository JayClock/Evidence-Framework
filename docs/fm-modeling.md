# FM Modeling 使用指南

FM Modeling 由可移植 Skills、项目业务文件和独立 Python CLI 组成，不依赖 Evidence 扩展的阶段、状态、Gate 或发布能力。Pi 扩展只提供可选入口与界面；禁用其他扩展后仍可讨论、生成候选、校验和保存。

## 入口与意图

```text
/skill:fm-modeling <本次目标>
/fm-model <本次目标>        # 安装可选适配器时
```

`/fm-model` 只转发原生 Skill。入口支持讨论／澄清、生成候选、只校验、保存已展示候选和暂停／结束。生成候选、普通回答和机器检查通过都不是保存授权。

## 默认项目布局

```text
.evidence/
├── discovery.md          # 访谈、来源、问题与交接
├── questions.md          # 可选的独立问题记录
├── fm/                   # 正式模型、术语、场景及派生输出
├── fm-candidates/        # 按批次编辑的候选
├── .fm-work/             # CLI 冻结候选与准备结果
├── fm-checks/            # FM 检查、发布报告
└── api/
    ├── api.yaml          # fm-api-design 的唯一设计源
    ├── checks/           # 按需保存的 API 检查记录
    └── generated/        # 每批新目录：投影、OpenAPI、契约、样例、manifest
```

这四个 Skill 的新产物默认统一使用项目根的 `.evidence/`；已有文件与用户显式指定路径优先，不自动迁移。`discovery.md` 保存来源、工作理解、稳定问题标识、暂缓／停止及文件指针，不复制正式模型，也不保存宿主运行状态。共享目录不授予 `state.json`、Gate 或扩展运行记录的写权限，活动工作流的提交要求仍优先。

编辑候选使用 `.evidence/fm-candidates/<批次>/`，与正式目标及 `.evidence/.fm-work/` 互不包含。API 设计由用户另行调用 `fm-api-design`，不会自动串联；其源文件位于 FM 根之外，投影使用经确认且尚不存在的 `.evidence/api/generated/<批次>/`。

## 规范建模顺序

1. 识别 Context、双方 Role 与责任边界。
2. 建立 RFP → Proposal → Contract → Request → Confirmation 的 Evidence 主线。
3. 展开 Evidence 时间：RFP、Proposal、Request 使用 `started_at`／`expired_at`；Contract 使用 `signed_at`；Confirmation 使用 `confirmed_at`；Other Evidence 使用 `created_at`。
4. 由具体 Evidence 通过 `references` 指向 Thing；由 Other Evidence 通过 `evidences` 指向它证明的业务 Evidence。
5. 用明确 Evidence bindings 和 CEL 建立 completion、breach 与 derivation Rule。
6. 用 Evidence Instance 和只指向既有凭证的 `basedOn` 建立回放场景。

Fulfillment 只作为责任边界 Context 和时间线泳道。它不保存 Request、Confirmation、Thing、策略或违约成员索引，也不能成为 `precedes`、`references`、`evidences` 或 `derived_from` 的端点。纯领域或纯渠道模型不补造 Contract 或 Fulfillment。

已确认的关系基数可用 `sourceCardinality`／`targetCardinality` 声明，每端包含 `min` 与整数或 `many` 上界。省略表示基数未声明，而非默认无限。当前检查器验证声明结构及上下界，编译结果保留声明；由于尚无通用 Relationship Instance，单据模拟不验证运行实例数量。履约完成数量继续由 Evidence 集合 binding 和 CEL Rule 判断。

不得从文件名、ID、文件创建顺序或实现回调推断业务时间。`created_at` 不替代原事件时间，`signed_at` 不替代生效时间，`confirmed_at` 不等同于回调到达。依据不足的相对顺序保留为未决。

## 只读校验与时间线

```bash
"$PYTHON" "$SKILL_DIR/scripts/check_fm.py" "$MODEL_DIR"
"$PYTHON" "$SKILL_DIR/scripts/build_fm_timeline.py" "$MODEL_DIR"
```

`check_fm.py` 输出 Schema、CEL、lineage、simulation 和 timeline 的一致检查摘要。没有实际执行场景时 `simulationPassed` 为 `null`。`build_fm_timeline.py` 生成可重建的 `generated/timeline.json`；该文件不是源模型，不得手改或作为正式输入。

时间线只包含 Evidence Instance，按 Context 分泳道，保留 moment／interval、`precedes`、`basedOn`、来源值和未决顺序。循环、未来依赖及确定性时间冲突导致检查失败。

## 准备与查看候选

设置 `PROJECT_ROOT` 为项目绝对路径、`BATCH` 为本次候选目录名：

```bash
TARGET="$PROJECT_ROOT/.evidence/fm"
DISCOVERY="$PROJECT_ROOT/.evidence/discovery.md"
CANDIDATE="$PROJECT_ROOT/.evidence/fm-candidates/$BATCH"
WORK_DIR="$PROJECT_ROOT/.evidence/.fm-work"
REPORT_DIR="$PROJECT_ROOT/.evidence/fm-checks"

"$PYTHON" "$SKILL_DIR/scripts/publish_fm.py" prepare \
  --candidate "$CANDIDATE" \
  --target "$TARGET" \
  --source "$DISCOVERY" \
  --work-dir "$WORK_DIR"
```

`receiptPath` 绑定冻结候选、目标、来源摘要、完整增改删、真实检查、实际场景及 canonical 时间线摘要与哈希。保存前必须展示 preparation ID、目标、来源／候选／目标摘要、完整差异、Schema／CEL／lineage／simulation／timeline 结果、未决顺序和业务缺口。

`fm_ui_review` 可展示相同信息；无界面时用普通对话完整展示。取消、返回修改和暂不保存都不是保存许可。

## 保存、冲突与恢复

用户明确授权保存当前已展示准备结果后才运行：

```bash
"$PYTHON" "$SKILL_DIR/scripts/publish_fm.py" apply \
  --receipt "$PREPARED_RECEIPT" \
  --report-dir "$REPORT_DIR"
```

`apply` 在目标锁内重新核对 receipt、候选、来源和目标，并重跑同一 canonical 时间线检查。候选、来源、目标或时间线摘要变化后必须重新 `prepare` 和确认。`applied`／`noop` 是文件结果，不是业务审核。

```bash
"$PYTHON" "$SKILL_DIR/scripts/publish_fm.py" recover --target "$TARGET"
```

恢复只处理目标旁的文件事务，不恢复访谈或调用其他工作流。

## 验证

```bash
npm run fm-modeling:verify
npm test
npm run lint
npm run build
```

自动检查不能替代业务审核。模型默认保持 `draft`／`stakeholderReview: pending`，只有具名真实依据才能提升。
