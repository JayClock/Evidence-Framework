# 确定性工作单元、任务身份与机器计划

实现入口：[task_compiler.py](../scripts/task_compiler.py)。策略为 `sd-modular-monolith-mybatis-1`。程序只输出工作清单与计划投影，不生成产品代码、计划 Markdown 或验收结果。

## 1. 输入与边界

输入为任意 FM Schema v3，可选 API Schema 5.0，以及显式 `slicing`。架构固定模块化单体、生产持久化固定 MyBatis，业务事实由源文件提供。profile 声明 `architecture: modular-monolith`、`deploymentUnit: single-backend-application`、`moduleInteraction: in-process-contracts`；数据库引擎仍为未知，不从单应用架构推导数据库数量或事务范围。

递归读取 YAML，忽略 `generated/`；拒绝重复键、重复源 ID、不可定位 FM 引用和逃出 FM 根的源链接。只消费模型、实体、关系、规则、场景、实例文档，不执行 CEL、不验证业务来源，也不替代完整 FM/API 校验。

`sourceEdges` 保存业务引用。基数、先后关系和角色扮演不是开发依赖；执行 DAG 只来自显式 `dependsOn`。

## 2. 工作单元

| 源结构                   | 单元类别                              | 稳定 key 成分                 |
| ------------------------ | ------------------------------------- | ----------------------------- |
| Context                  | context-design                        | 类型、Context ID              |
| Context.rootRefs 成员    | root-collection                       | 类型、Context ID、成员类型 ID |
| Participant/Thing 等实体 | entity                                | 类型、Entity ID               |
| Evidence                 | evidence                              | 类型、Evidence ID             |
| Party/Evidence/其他 Role | actor-role / proof-role / domain-role | 类型、Role ID                 |
| Relationship             | association                           | 类型、Relationship ID         |
| Rule                     | rule                                  | 类型、Rule ID                 |
| Scenario                 | scenario                              | 类型、Scenario ID             |
| API Resource/Capability  | api-resource / api-capability         | 类型、稳定源 ID               |
| 固定平台                 | platform                              | 类型、profile.\* ID           |
| 显式设计条目             | design                                | 类型、design.\* ID            |

固定平台包含 modular-monolith、backend-modules、smart-domain、mybatis、jersey；这些组件只各提取一个平台单元，不按 Context 数量复制。`profile.modular-monolith` 对应统一应用及业务模块边界设计，`profile.backend-modules` 对应组合根/技术库与构建隔离；XML 与子资源组织同样是技术约束，不是业务对象。编译器不自动决定业务模块数量、公开契约或表归属，也不从跨上下文引用生成 RPC/部署单元。

声明不意味着一定生成同名 Java 类；关系不自动对应表或宽写接口。具体实例只作输入，不逐单创建任务。单元可小于任务，多条规则可合入同一操作。适配工作可通过有依据的 design.\* 单元消费领域契约，不再次占有原领域单元。

## 3. 显式切片

```yaml
slicing:
  designItems: []
  groups: []
  dispositions: []
```

### designItems

```yaml
id: design.<稳定设计标识>
sourceRefs: [<inventory 源 ID>]
reason: <操作拥有者、设计边界与来源理由>
```

依据必须是 inventory 源 ID，不通过设计条目间的循环引用充当业务证明。业务模块映射、公开契约、数据所有权、数据库与本地事务决定在这里登记；具体设计在 reason 中说明来源和边界，不能覆盖固定 profile。只有已确认的外部系统或独立部署需求才增加相应协议设计条目。

### groups

每组只允许以下字段：

```yaml
concern: domain
ownerRef: <inventory 源 ID 或 design.*>
operationRef: <inventory 源 ID 或 design.*>
unitKeys: [<本任务负责的单元 key>]
dependsOn: [<前置 taskKey>]
```

关注点为 `design, platform, foundation, domain, mybatis, security, integration, api, acceptance`。排序只在依赖已满足的任务之间使用这些优先级，不生成隐含依赖。integration 可以是应用内业务模块协作，不天然表示远程调用；security 和远程相关任务都需要实际来源，不按关注点枚举凑任务。

相同 concern/ownerRef/operationRef 是同一任务，不通过制造同义 design.\* 绕过去重。每组至少拥有一个工作单元；可读标题只写入 `tasks[taskKey].title`，不参与编译。

### dispositions

```yaml
unitKey: <未分配给任务的单元 key>
kind: external
sourceRefs: [<可定位源 ID>]
reason: <外部责任或确实不适用的依据>
```

kind 只能为 external 或 not-applicable。固定平台与已有 API 能力不能排除；未决定保持未分配。机器只能核对引用存在，不能证明理由充分。

## 4. 单一任务身份

成分使用 UTF-8 百分号编码，ASCII 字母数字与 `._-` 保留，再用 `::` 连接；使用脚本 `key()`，不手拼含分隔符的源 ID。

```text
unitKey = encode(kind) :: encode(sourceRef) [:: encode(rootMemberRef)]
taskKey = encode(concern) :: encode(ownerRef) :: encode(operationRef)
```

所有任务引用均使用 taskKey：切片/编译任务的 `dependsOn`、`executionOrder`、API 覆盖的 `deliveryTaskRef/supportingTaskRefs`、`tasks` 映射键、缺口的 `affectedTaskRefs`、依赖消费的 `taskRef` 与 CHECK 的 `preparationTaskRefs`。源 ID、US/AC/Scenario 和 CHECK 标识仍使用各自来源标识。

输入摘要记录 FM/API 内容，不记录任务标题；源内容变化会改变摘要。任务身份不依赖摘要，规则变化应重验而不是创建同义任务。`tasks[taskKey].title` 只用于审核展示，修改标题不改变身份、依赖或 API 归属。

## 5. 编译结果与保证范围

每项 `compiled.tasks` 包含 `taskKey, concern, ownerRef, operationRef, unitKeys, dependsOn, apiRefs`。输出按 taskKey 排序；拓扑顺序先满足依赖，再按 concern 和 key 打破平局。

- 单元只能归一个 group 或一个有依据的 disposition；taskKey 不得重复。
- 执行依赖必须存在，无重复、自依赖或环。
- API 主交付任务来自 api-capability 单元的唯一拥有者，支持任务来自其依赖闭包；apiRefs 反向生成，不手填。
- 角色变体可以同组，但每个能力保持自己的覆盖项；稳定能力的路由改名不改变身份。
- 不完整映射保留 tasks、unassignedUnitKeys 和 diagnostics，不假装覆盖完成。

`coverageComplete` 不证明最佳分组、设计充分、SQL/事务正确、任务语义完整、运行通过或业务批准。`plan_state.py` 另行校验 compiled 与机器任务记录一一对应、CHECK/gap 引用和状态约束；语义仍需审核。

## 6. 命令

```bash
python3 "$SKILL_DIR/scripts/task_compiler.py" inventory --fm "$FM_ROOT"
python3 "$SKILL_DIR/scripts/task_compiler.py" compile \
  --fm "$FM_ROOT" --mapping "$PLAN_DIR/plan.yaml" --require-complete
```

可选 `--api "$API_FILE"`。mapping 必须是 YAML 文件，可直接传含 `slicing` 的 `plan.yaml`；Markdown 不再是编译输入。程序输出 JSON 到 stdout，严格覆盖模式在 diagnostics 或未分配项非空时返回非零。

将输出原样写入 `plan.yaml.compiled`。执行模式、状态、Guides、设计、步骤、CHECK 和证据维护在同一文件的 `tasks` 映射中，不混入计算字段；人通过重新生成的 `review.html` 审核，不直接编辑投影。
