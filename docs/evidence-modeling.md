# Evidence Modeling 使用指南

Evidence Modeling 由可移植 Skills、项目文件与独立校验 CLI 组成。可选 Pi 扩展仅提供入口与问答界面，不依赖其他扩展。

从 [项目宪法](../AGENTS.md)与 [Guides 导航](guides/index.md)进入，按本次讨论、模型编辑或只读验证加载来源。本文只维护建模操作方法；软件职责、架构、工程规范和任务状态分别由对应来源维护，不因进入建模工作流自动授予下游实施权限。

## 入口与权限

```text
/skill:evidence-modeling <目标>
/evidence-model <目标>
```

`/evidence-model` 不带参数时选择“讨论业务／生成或修改模型／只校验模型／返回”。

- **讨论**：保存业务发现，不修改模型。普通回答与停止不授权建模。
- **生成或修改**：用户请求即授权直接编辑本次范围内的 FM，随后校验并展示差异。
- **只校验**：只报告结果，不写模型、场景、发现记录或报告文件。

编辑授权不是业务确认。模型文件不保存审核状态；确认依据由项目侧的发现记录与 PDCA 计划／任务记录承载。

## 项目布局

```text
.evidence/
├── discovery.json        # 业务来源、回答、问题、状态及交接
├── questions.json        # 可选的独立问题记录
├── fm/                   # 唯一当前模型，直接编辑
│   ├── model.json
│   ├── entities/
│   ├── relationships/
│   ├── rules/
│   ├── validation/
│   ├── generated/        # 可重建派生结果
│   └── *.md              # 术语和说明
├── api/
│   ├── api.yaml          # 唯一 API 设计源，位于 FM 根之外
│   └── generated/        # 当前投影、OpenAPI、样例、流程与 manifest
└── checks/
    ├── fm/               # 获授权留存的 FM 检查记录
    └── api/              # 获授权留存的 API 检查记录
```

默认路径相对项目根，按需创建。用户显式指定路径优先。只修改本次授权的文件，不改变业务确认记录。

## 工作流程

```text
讨论业务 → 保存发现记录
               ↓ 用户要求生成／修改
          直接编辑 fm/
               ↓
          校验 → 修正 → 再校验
               ↓
          展示差异、结果与未决项
               ↓
              停止
```

编辑前读取当前文件和已有差异，保留用户的无关修改。修改即落盘，不保证 `fm/` 在编辑过程中始终有效。校验失败就明确“当前模型未通过”，报告已经修改的文件与错误，不自动回滚或继续下游。

Git 用于查看差异和按用户要求恢复版本，不自动暂存、提交或回滚；未跟踪的新文件需要单独展示，不能只展示 `git diff`。

## 规范建模顺序

1. 识别 Context、双方 Role 与责任边界。
2. 建立适用的 RFP → Proposal → Contract → Request → Confirmation 证据主线；纯领域／合同前不补造合同或履约。
3. 展开 Evidence 时间：RFP、Proposal、Request 为 `started_at`／`expired_at`；Contract 为 `signed_at`；Confirmation 为 `confirmed_at`；Other Evidence 为 `created_at`。
4. Evidence 通过 `references` 指向 Thing；Other Evidence 归属形成并管理它的非履约 Context，并通过 `evidences` 指向它证明的业务 Evidence。
5. 用有来源的 Evidence bindings 与 CEL 建立 completion、breach、derivation Rule。
6. 用 Evidence Instance 和只引用既有凭证的 `basedOn` 建立回放场景。

Fulfillment 只是责任边界 Context 与时间线泳道，不作为 Evidence 关系端点。业务名称、关系基数、关键值及时间顺序均需依据；不从文件名、ID 或回调到达推断业务先后。签约不等于生效，凭证创建不替代原事件时间。无依据的顺序保持未决。

## 校验与留存结果

将变量设为实际绝对路径，Python 需满足 FM 包的 requirements.txt：

```bash
MODEL_DIR="$PROJECT_ROOT/.evidence/fm"
"$PYTHON" "$SKILL_DIR/scripts/check_fm.py" "$MODEL_DIR"
```

检查覆盖 Schema、CEL、lineage、适用模拟与时间线。没有实际执行场景时 `simulationPassed` 为 null，不宣称模拟通过。

结果包含 `modelDigest`，绑定模型相对文件路径和字节内容，排除 generated 与 Python 字节码。`inputChanged` 为 true 表示检查期间输入变动，`valid` 为 false。该机制不是文件锁；模型、业务来源、场景或校验器变化后必须重新检查，旧记录不能证明当前版本有效。

用户要求留存结果时，将紧凑运行清单写到 `.evidence/checks/fm/<运行标识>.json`（命令、退出码、环境、来源摘要与日志指针），不复制完整输出。不要覆盖已有运行记录，也不要手改检查结果。只校验请求不落盘。

## 派生结果与 API

用户要求生成派生输出时再执行：

```bash
"$PYTHON" "$SKILL_DIR/scripts/build_fm_timeline.py" "$MODEL_DIR"
"$PYTHON" "$SKILL_DIR/scripts/compile_fm_model.py" "$MODEL_DIR" --output "$MODEL_DIR/generated/model.json"
```

时间线只包含 Evidence Instance，按 Context 分泳道；保留区间／时刻、`precedes`、`basedOn` 及未决顺序。循环、未来依赖或确定性时间冲突不能忽略。派生结果不是源模型，不手改。

用户另行调用 `evidence-api-design` 才进入 API 设计。API 任务以整体 FM 为上游，直接设计全部业务接口与完整 HTTP 契约，不重复业务确认或接口筛选。API 配置使用格式 4.0，上游 FM 仍为 v3。每次消费当前 FM 都执行技术完整性检查；无效模型或输入变化时停止，不复用旧通过标记。所有接口、整体业务对象及全部场景都须覆盖，缺口默认阻止交付。API 投影完整校验后直接更新 `.evidence/api/generated/`，由 Git 管理历史；更新失败保留原目录。获授权留存的检查结果放到 `.evidence/checks/api/`。

## 开发验证

```bash
npm run evidence-modeling:verify
npm run skills:verify
# 使用满足依赖的 Python：
"$PYTHON" -m unittest discover -s .agents/skills/evidence-api-design/tests -v
```

自动检查不能替代业务审核。完成当前任务后停止，不自动进入其他软件交付流程。
