---
name: evidence-task-planning
description: 从 FM 与可选 API 生成或重编译 plan.yaml、任务 DAG 和离线审核页；用于划分实施任务、检查依赖与 API 覆盖。采用模块化单体、smart-domain、MyBatis XML 与 Jersey，不改业务事实、不生成产品代码或预填执行证据。
compatibility: Python 3.10+、PyYAML；消费 FM Schema v3，可选 API Schema 5.0。
---

# Evidence 实施任务规划

FM 提供业务事实，需求决定软件职责，API 提供接口契约。`plan.yaml` 保存唯一计划，`review.html` 是可重建的只读投影；生成计划不表示业务批准或实现完成。

## 1. 定位授权与来源

从消费项目指令定位 Guides 导航，读取[任务前馈协议](references/guides.md)，按本次切片加载范围/验收、架构、质量属性、术语、实际代码与测试。只在用户要求生成或更新计划时写计划目录；只读检查只报告。FM、API、产品代码、依赖与业务审核记录保持只读。

默认输入为 `.evidence/fm/` 和可选 `.evidence/api/api.json`，输出为：

```text
docs/plans/smart-domain/
├── plan.yaml
└── review.html
```

规划前读取[设计规则](references/design-rules.md)，确认固定 profile 与项目架构相容。涉及后端组织与装配时读取[构建及测试边界](references/backend-layout.md)；需要核对框架能力、版本和真实用法时读取[依赖核对](references/upstream.md)。数据库引擎、身份与外部协议仍须项目依据，不由固定 profile 推导。

**退出条件**：授权、软件结果、来源与架构约束可定位；冲突交拥有者，只阻塞受影响规划。

## 2. 提取工作单元

读取全部 FM 源 Context、实体、关系、规则、场景及所引实例；有 API 时读取全部资源、能力与角色变体。按[切片与机器契约](references/slicing-policy.md)运行：

```bash
python3 "$SKILL_DIR/scripts/task_compiler.py" inventory --fm "$FM_ROOT"
```

有 API 时追加 `--api "$API_FILE"`。变量均为实际绝对路径，脚本只输出 JSON。sourceEdges 是业务引用，不是执行依赖；实例只作场景输入，不逐单建任务。

**退出条件**：工作单元及其来源可定位，已有行为的复用有代码与复验依据，而非仅有文件。

## 3. 实例化切片测试策略

按项目工序，在 `strategy` 记录触发/未触发工序、可观察结果的 Q2 → Q1 支撑、功能上下文与真实依赖/替身边界。每项业务结果应能指出最早可验证的交付点；任务粒度须允许单个新会话读取必要来源并完成验证。

**退出条件**：结果、边界与验证路径能解释；写不出支撑检查时先补设计，不进入分组。

## 4. 明确切片和归属

按切片协议建立 `slicing.groups`，每组只含 concern、ownerRef、operationRef、unitKeys、dependsOn。工作单元唯一拥有，其他任务通过真实依赖消费；无直接源操作的技术工作登记有来源与理由的 `design.*`。

业务切片围绕一个可观察结果，机器任务可按拥有者、操作和测试边界拆分，不强迫每个任务贯穿 UI/API/SQL。先交付最小共享契约，避免先建设完整平台才第一次验证业务。机械跨仓修改依据实际影响规划可独立验证的批次；无法单批验证时明确整体验证边界，不伪造通过证据。

**退出条件**：每组有独立可验证结果，依赖只反映真正前置，没有重复实现或无依据的数据库、权限与集成设计。

## 5. 编译计划

使用 [plan-template.yaml](assets/plan-template.yaml) 初始化或更新同一份计划，再运行：

```bash
python3 "$SKILL_DIR/scripts/task_compiler.py" compile \
  --fm "$FM_ROOT" --mapping "$PLAN_DIR/plan.yaml" --require-complete
```

有 API 时追加 `--api "$API_FILE"`。将 stdout 的完整结果原样写入 compiled；taskKey、依赖与 API 覆盖由程序计算。标题只属于任务记录，不参与身份；编译失败保留缺口，不手改计算字段制造通过。

## 6. 填充任务

每个 compiled taskKey 恰好对应一条 `tasks[taskKey]`，按前馈协议和模板保存 Guides、局部设计、文件范围、步骤、CHECK、acceptanceCriteria 和 gapRefs。依赖只读 compiled，不复制第二份图。

implementation 的 steps 体现单行为测试与实现循环；用户明确选择普通实现与回归时记录该选择。故障任务先计划症状复现。检查预期来自独立业务依据，记录稳定路径、受限操作符和保留类型的 expected；未知命令填 null 并关联 gap。

规划时 observedEvidence 为空；`tasks[*].status` 是唯一状态位置。已有状态与证据按来源新鲜度处理，不因重新编译抹去历史结果或自动提升状态。

## 7. 校验与投影

定位 delivery Skill 的实际目录，先验证，再生成：

```bash
python3 "$DELIVERY_SKILL_DIR/scripts/plan_state.py" verify --plan "$PLAN_DIR/plan.yaml"
python3 "$SKILL_DIR/scripts/render_plan.py" \
  --plan "$PLAN_DIR/plan.yaml" --output "$PLAN_DIR/review.html" \
  --state-tool "$DELIVERY_SKILL_DIR/scripts/plan_state.py"
```

结构失败先修计划。审核意见回写 YAML 后重新编译、校验与投影，禁止直接编辑 HTML。投影支持离线审核，不能反向成为状态来源。

**退出条件**：结构校验与投影实际成功；逐项复核切片可交付性、唯一归属、依赖、CHECK 证明能力及局部缺口。coverageComplete 只证明结构覆盖。

报告实际产物、命令结果、未决项与未保存内容后停止，不自动实施或审批。执行交给 evidence-delivery 消费同一计划，以小步实现、故障诊断及 Standards / Spec 双维度审查交付一个任务。
