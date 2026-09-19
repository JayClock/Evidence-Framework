---
name: evidence-task-planning
description: 基于任意 FM Schema v3 规划机器可执行的 smart-domain 实施任务，并生成离线可视化审核投影；固定采用模块化单体、业务模块边界与组合根/实现库分离、MyBatis XML 领域映射和 Jersey 子资源。用户要求从 .evidence/fm/ 划分任务、生成 plan.yaml、编译任务 DAG、检查 API 覆盖或审核计划视图时使用；不生成产品代码、不改写 FM，也不把 HTML 当作状态来源。
compatibility: Python 3.10+，PyYAML；消费 FM Schema v3，可选 API Schema 4.0。
---

# Evidence 实施任务规划

**业务事实来自 FM，`plan.yaml` 面向机器，`review.html` 面向人。** 显式声明切片，程序计算身份、依赖和覆盖；审核页只是可重建投影，不保存状态或审核结论。

## 固定范围

- 架构固定为模块化单体 `modular-monolith`：统一构建发布，模块通过进程内公开契约协作；不默认拆服务或增加模块间 RPC。
- 业务模块与 domain/api/persistent 技术分层分别设计；FM Context 不机械对应 Gradle 模块。记录行为、数据、公开契约、允许依赖和本地事务边界。
- 生产持久化固定 MyBatis；数据库引擎、方言、数据源和隔离级别仍需依据。MyBatis XML 直接映射领域对象，不无故增加 Row/PO 转换层。
- 完整采用 smart-domain BOM、Core、官方 MyBatis Starter 和 Jersey/HATEOAS/HAL-FORMS 集成，Boot 目标 3.5.x。固定上游源码版本并核对真实依赖。
- `apps/<应用>` 为组合根，`libs/<后端>/{domain,api,persistent}` 为构建模块；用公开接口、依赖约束和架构测试验证业务封装。
- 领域行为归实体、Description、Context 接口暴露的角色对象和拥有者关联；Context 实现在适配层独立文件中通过依赖注入提供，不增加业务 Service 接管规则。
- Jersey 从 Root API 导航到根集合和实体子资源。复用 smart-domain `Pagination`，不另造分页算法、Page DTO 或只包装链接的公共表示基类。
- API 模块保留真实 HTTP + mock 领域测试；app 保留真实持久化与装配测试。

## 输入、权限与产物

默认读取 `.evidence/fm/`，可选读取 `.evidence/api/api.json`、需求、架构、测试契约与现有代码。只在用户要求生成或更新计划时写计划目录；FM、API、产品代码、依赖和审核记录只读。

```text
docs/plans/smart-domain/
├── plan.yaml    # 唯一可编辑、可执行的计划记录
└── review.html  # 从 plan.yaml 重建的离线只读投影
```

不生成任务 Markdown、索引 Markdown或额外状态文件。任务标题只是 `tasks[taskKey].title` 的展示属性，不参与身份。

## 必读资源

- [任务前馈装配协议](references/guides.md)
- [固定架构与设计规则](references/design-rules.md)
- [工作单元与切片规则](references/slicing-policy.md)
- [后端组织与分层测试](references/backend-layout.md)
- [固定上游依据](references/upstream.md)
- `assets/plan-template.yaml`：机器计划模板

资源路径相对 Skill 目录；命令使用实际绝对路径。

## 工作流

### 1. 读取来源与项目前馈

从项目指令定位 Guides 导航，按前馈协议读取软件范围/验收、架构与模块设计、质量属性、术语、规范、howto 和真实范例。读取全部 FM 源 Context、实体、关系、规则、场景及引用实例；生成目录只作参考。业务活动不自动等于已批准软件范围。

读取实际模块、构建、测试、数据库与运行配置，区分技术层和业务模块；记录 FM 到模块的映射、公开契约、内部实现、表/迁移归属及本地事务边界。有 API 时读取资源、稳定能力 ID、角色变体及非接口活动。无法确认已有行为时，不标为已实现或已复用。

### 2. 提取工作单元

```bash
python3 "$SKILL_DIR/scripts/task_compiler.py" inventory \
  --fm "$PROJECT_ROOT/.evidence/fm"
```

有 API 时增加 `--api "$PROJECT_ROOT/.evidence/api/api.json"`。程序只向 stdout 输出 JSON，不写业务文件。

`sourceEdges` 是业务引用，不是执行依赖。源图可有环，任务 DAG 不可有环。具体实例作为场景输入，不逐单建任务，不按字段生成 CRUD。

### 3. 实例化切片测试策略

先在 `strategy` 记录触发/未触发工序、可观察结果的 Q2 → Q1 支撑、功能上下文与替身边界。写不出对应 Q1 或替身限制时先补设计，不进入分组。

### 4. 明确切片和归属

从可验收业务结果出发，按项目工序展开候选任务。识别最小共享基础与实现工作，将来源和做法放入任务记录的 `guides`、`procedureRefs`、`checks` 和 `acceptanceCriteria`。每组只含机器编译所需字段：

```yaml
concern: domain
ownerRef: <拥有者源 ID>
operationRef: <操作源 ID>
unitKeys: [<本任务唯一拥有的工作单元 key>]
dependsOn: [<前置 taskKey>]
```

- 工作单元只实现一次，其他任务通过依赖消费。
- 无源操作 ID 的技术工作在 `slicing.designItems` 登记稳定 `design.*`、源引用及理由。
- 模块不访问其他模块的 Mapper、内部实体或私有表；共享数据库不授予跨模块读写权。
- 按业务不变条件明确事务入口、参与者、数据源/事务管理器和失败回滚范围。
- 只有已确认外部调用或独立部署需求才规划协议、重试、幂等或补偿。

### 5. 编译身份、依赖和覆盖

把映射写入 `plan.yaml.slicing`，然后运行：

```bash
python3 "$SKILL_DIR/scripts/task_compiler.py" compile \
  --fm "$PROJECT_ROOT/.evidence/fm" \
  --mapping "$PLAN_DIR/plan.yaml" \
  --require-complete
```

有 API 时增加 `--api`。将 stdout 的完整结果原样写入 `plan.yaml.compiled`，不手改计算字段。

```text
taskKey = encode(concern) :: encode(ownerRef) :: encode(operationRef)
```

编译器校验任务去重、工作单元归属、引用、依赖环和 API 覆盖。它不读取 `tasks` 的标题、状态或实施详情，也不替 Agent 判断切片是否合理。

### 6. 填充机器任务记录

`tasks` 是以 `taskKey` 为键的映射。每个编译任务恰好有一条记录，集中保存：

- `title/mode/status/outcome`：展示、执行模式与唯一状态；
- `guides/design`：当前任务的来源、新鲜度、工序实例和局部设计；
- `procedureRefs/dependencyUsage/files/steps`：实施输入与动作；
- `checks/acceptanceCriteria`：可执行验证，以及以稳定路径、操作符和有类型 `expected` 表达的具体验收数据；
- `observedEvidence`：只记录真实观察，规划时为空。

`compiled` 是计算投影，`tasks[*].status` 是状态唯一位置，`observedEvidence` 是结果唯一位置。不要复制依赖图到任务记录；依赖只从 `compiled.tasks[*].dependsOn` 读取。

### 7. 结构校验与可视化审核

先使用 delivery 状态检查器验证机器契约：

```bash
python3 "$DELIVERY_SKILL_DIR/scripts/plan_state.py" verify \
  --plan "$PLAN_DIR/plan.yaml"
```

再生成离线审核投影：

```bash
python3 "$SKILL_DIR/scripts/render_plan.py" \
  --plan "$PLAN_DIR/plan.yaml" \
  --output "$PLAN_DIR/review.html" \
  --state-tool "$DELIVERY_SKILL_DIR/scripts/plan_state.py"
```

审核页展示概览、执行顺序、状态筛选、依赖、任务 Guides/设计/CHECK、缺口、来源和原始 YAML。它带 CSP、无外部请求、原子替换且拒绝覆盖非本工具生成文件。审核意见应回写 `plan.yaml` 对应字段后重新编译/校验/投影；禁止直接编辑 HTML。

### 8. 检查与停止

检查需列明目的/Q1–Q4、被测行为、真实依赖或 Fake、固定事实和业务时间、正常/边界/反例、失败不变性、测试文件、cwd、命令、准备依赖及证据要求。未知命令填 `null` 并关联 gap。每条 `acceptanceCriteria` 必须引用本任务 CHECK，并用 `assertions[{path, operator, expected}]` 保存具体、保留类型的预期数据；不得用“测试通过”“符合要求”等句子代替。

最终核对来源、授权、依赖新鲜度、局部设计、CHECK 与停止条件；所有编译任务都有且只有一条任务记录，CHECK ID 全局唯一，引用可解析，未决事实未隐藏。`coverageComplete` 只表示工作单元结构覆盖，不表示业务批准、实现完成或测试通过。

输出 `plan.yaml` 和 `review.html` 后停止，不自动实施或审批。后续执行交给 `evidence-delivery`，它消费同一份 `plan.yaml`，不建立私有状态。
