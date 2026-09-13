# Guides：按任务装配前馈

## 四层职责

| 层                          | 唯一职责                                        | 使用方式         |
| --------------------------- | ----------------------------------------------- | ---------------- |
| [项目宪法](../../AGENTS.md) | 权限、硬约束、停止纪律                          | 每次必读         |
| 项目基线                    | 软件范围、业务与 API 来源、架构、术语、质量要求 | 按任务选择       |
| 工程指南                    | 规范、操作方法、带测试的真实范例                | 按改动类型选择   |
| 任务 Guides                 | 当前交付结果、来源、局部设计、文件范围、CHECK   | 执行当前任务必读 |

每次开工、恢复、来源变化或纠偏后重新装配。这里只路由，不保存第二份事实、任务状态或完成证据。没有读取的来源不能声称已核对。

## 来源与冲突处理

| 问题                 | 权威位置                                                                                 | 不可替代它的内容                 |
| -------------------- | ---------------------------------------------------------------------------------------- | -------------------------------- |
| 业务事实与审核状态   | [FM 源入口](../../.evidence/fm/model.yaml)、[发现记录](../../.evidence/discovery.md)     | 当前代码、生成报告、Agent 推测   |
| 接口能力与 HTTP 契约 | [api.yaml](../../.evidence/api/api.yaml)                                                 | Resource 实现、过期 OpenAPI      |
| 本次软件负责什么     | [范围](../requirements/scope.md)、[故事验收](../requirements/stories.md)                 | FM 中存在的所有活动              |
| 技术选择与模块边界   | [架构基线](../architecture/overview.md)、[模块设计](../architecture/modules.md)          | 目录名、参考产品或模板默认业务   |
| 业务术语             | [正式术语](../../.evidence/fm/01-glossary.md)                                            | 另写一份业务词典                 |
| 英文代码与字段映射   | [领域映射](../architecture/domain-mapping.md)、[通用命名](../engineering/conventions.md) | 用同义词制造新业务对象           |
| 执行顺序与状态       | 计划索引的 compiled / taskNotes                                                          | 文件名编号、聊天记忆、README     |
| 当前是否验证         | 任务 CHECK 的本次实际结果                                                                | 文件存在、上次通过或模板中的预期 |

来源冲突时，先说明各自管辖范围及差异，停止受影响行动，交由相应拥有者确认；不能按读取先后、修改时间或“代码已经这样写了”裁决。实现证据与业务批准分开记录。

## 阅读路由

先读本页和宪法，再按当前任务合并下列必要条目；同一来源只加载一次，长文件只读相关章节与实际源码符号。

| 工作                   | 必要前馈                                                                                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 业务澄清 / FM          | [建模指南](../evidence-modeling.md)、[业务概览](../../.evidence/fm/00-overview.md)、相关源 YAML、对应 Skill                                                                                        |
| 软件需求               | [范围](../requirements/scope.md)、[故事](../requirements/stories.md)、[质量属性](../requirements/quality-attributes.md)、[requirements Skill](../../.agents/skills/evidence-requirements/SKILL.md) |
| 任务规划               | 范围与相关 FM/API、架构三篇、[planning Skill](../../.agents/skills/evidence-task-planning/SKILL.md)、[测试工序](../engineering/procedures.md)、[测试指南](../engineering/testing.md)               |
| 恢复 / 执行任务        | [delivery Skill](../../.agents/skills/evidence-delivery/SKILL.md)、有效索引、当前任务、直接前置产物与本次来源                                                                                      |
| 后端领域               | [模块边界](../architecture/modules.md)、[领域映射](../architecture/domain-mapping.md)、[后端规范](../engineering/backend.md)、相关规则/场景                                                        |
| 持久化                 | 模块的数据归属与事务设计、后端规范、[数据库 howto](../howtos/database.md)、真实 SQL/XML 范例                                                                                                       |
| API                    | 对应 api.yaml 能力、[API 规范](../engineering/api.md)、[安全规范](../engineering/security.md)、独立 HTTP 测试边界                                                                                  |
| 前端                   | 对应故事/消费者流程、[前端规范](../engineering/frontend.md)、[浏览器调试](../howtos/browser-debugging.md)                                                                                          |
| 环境准备               | [本地开发](../howtos/local-development.md)、相关 howto、实际构建/运行配置                                                                                                                          |
| 鉴权 / 集成 / 质量属性 | [质量属性及缺口](../requirements/quality-attributes.md)、[安全规范](../engineering/security.md)、受影响模块和已有契约                                                                              |
| 前馈 / Harness 维护    | 本页、受影响 Skill/模板、[测试工序](../engineering/procedures.md)、[范例索引](../engineering/examples.md)、[测试指南](../engineering/testing.md)                                                   |

鉴权、审计、多语言、集成的专项方案仅在有明确需求及设计授权时建立，并加入本路由。没有方案不意味可以使用 JWT、RBAC、某个数据库或远程协议作为默认答案。

## 任务开工检查

进入 Action 前逐项核对，并在当前任务详情引用来源，不另建“前馈状态表”：

1. **授权与目标**：本次 mode、交付结果、非目标和允许改动的文件是否明确？是否保留已有无关工作树改动？
2. **来源**：需求、FM/API、规则、场景、质量属性与架构引用是否可定位？当前审核状态是否允许本次工作？
3. **前置与新鲜度**：依赖是否完成？源摘要、规范/架构变化、当前代码及 CHECK 环境是否使旧证据失效？编译器摘要不覆盖所有工程指南，仍需显式核对相关差异。
4. **设计**：行为拥有者、业务模块、公开契约、数据所有权、事务范围与必要外部边界是否明确？
5. **做法与环境**：相关规范、howto、真实范例是否已读？命令、cwd、依赖和配置是否可用？范例是否适用而非被整套复制？
6. **验证与退出**：每个完成条件是否有 CHECK，包含可观察预期及适用反例？失败后应局部修复、重规划还是澄清？

检查通过只表示本次行动依据就绪，不表示实现或业务获批。`plan_state.py` 检查任务结构，不替代以上语义检查；`guides:verify` 检查文档结构，不证明任务就绪。

## 缺口与转向

- 只读讨论/验证：报告缺口，不擅自写计划状态。
- 获授权实施：缺口关联索引 `gaps` 和受影响 `taskNotes`；阻塞时不进入 Action。
- 源业务未知：交回发现/FM/API/需求拥有者，不在代码中猜测。
- 任务局部设计不充分：修订详情；单元归属或依赖变化：返回 Plan 重编译。
- 环境不可用：记为环境阻塞，不伪装成业务失败。
- 代码问题：在本任务范围内修复并重跑；本次完成后停止。

## 维护纪律

正文直接描述当前有效约束，不保留兼容入口或过期方案说明。替换文档时同步引用它的导航、Skill、任务模板和检查；不删除业务原始材料或历史执行证据。

稳定基线由对应文档唯一维护；Skill 保存可移植的方法与固定技术 profile，项目文件记录本仓库具体取舍。任务只引用并说明局部差异，不复制整套指南。新增规范应指出对应测试/人工评估；`npm run guides:verify` 的实际覆盖见 [测试指南](../engineering/testing.md)。
