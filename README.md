# Evidence：以可追溯前馈驱动双层交付循环

Evidence 是 Nx 单仓库中的业务建模与交付 Harness，配有 React/TypeScript 前端和 Spring Boot/Java 后端。它把业务来源、实现依据、任务状态与真实检查结果保存在仓库中，使新会话能恢复同一项工作。

## 从这里开始

- Agent：[项目宪法](AGENTS.md) → [Guides 导航与开工检查](docs/guides/index.md)。
- 理解产品：[软件范围](docs/requirements/scope.md) → [业务模型](.evidence/fm/00-overview.md) → [API 设计](.evidence/api/README.md)。
- 理解实现：[架构基线](docs/architecture/overview.md) → [模块边界](docs/architecture/modules.md) → [领域映射](docs/architecture/domain-mapping.md)。
- 运行工程：[本地开发](docs/howtos/local-development.md)、[数据库](docs/howtos/database.md)、[浏览器调试](docs/howtos/browser-debugging.md)。
- 使用工作流：[建模指南](docs/evidence-modeling.md)、[Skills 索引](.agents/skills/README.md)。

## 前馈结构

```text
项目宪法                 AGENTS.md：权限、不变量、阅读入口
    ↓
项目基线                 范围、FM/API、架构、术语、质量属性
    ↓ 按当前任务选择
工程指南                 规范、howtos、真实源码与测试范例
    ↓
任务 Guides              来源、局部设计、文件边界、CHECK、停止条件
```

[Guides 导航](docs/guides/index.md) 是项目级阅读路由，不保存另一份模型、任务图或执行状态。任务文件消费来源而不复制来源；生成报告不能覆盖源文件；现有代码也不能反向定义期望业务。

## 双层循环

```text
外层 PDCA：Plan → Do → Check → Act
                  │          ↑
                  │ 一个就绪任务与它的来源
                  ↓          │ 结果、缺口与重验范围
内层：         Guides → Action → Sensors → Steer
                  ↑                            │
                  └──── 局部修正后重装前馈 ────┘
```

- **Plan**：从真实业务与软件范围设计切片，编译稳定 taskKey、依赖及覆盖。架构和模块方案约束实现，不替业务决定权限或义务。
- **Do / Guides**：核对工作树、当前来源与直接前置证据；通过开工检查后才开始一个任务。
- **Sensors / Check**：执行任务 CHECK、测试、静态分析与构建；区分结构校验、运行验证和人工业务判断。
- **Steer / Act**：代码错误局部修复；任务设计问题修订详情；切片或依赖变化返回 Plan；业务未知交回来源拥有者。完成当前任务后停止。

## 仓库中的唯一职责

| 位置                                 | 职责                                                 |
| ------------------------------------ | ---------------------------------------------------- |
| `.evidence/discovery.md`             | 业务材料、回答与控制状态                             |
| `.evidence/fm/`                      | 当前 FM、正式业务术语、规则与回放场景                |
| `.evidence/api/api.yaml`             | 当前 API 设计源                                      |
| `docs/requirements/`                 | 软件职责、故事验收与质量属性                         |
| `docs/architecture/`                 | 项目技术基线、模块/数据边界与领域映射                |
| `docs/engineering/`、`docs/howtos/`  | 按工作类型加载的规范、范例与操作说明                 |
| `docs/plans/smart-domain/index.md`   | 生成计划后保存 slicing、compiled、taskNotes、gaps    |
| `docs/plans/smart-domain/tasks/*.md` | 生成计划后保存局部 Guides、CHECK 和 observedEvidence |
| `.evidence/checks/`                  | 获授权留存的实际检查记录                             |

计划路径是工作流输出约定，不表示仓库已经有可执行计划。没有有效索引时先规划，不根据代码存在或聊天记忆跳到实施。

## 当前范围与边界

[FM 源](.evidence/fm/model.yaml) 当前标记为 `draft`，业务审核为 `pending`。专栏订阅、退款与恢复的业务模型和 API 设计不等于已上线业务系统。

现有 [用户基础切片](apps/backend/README.md) 只提供本地用户 ID 与显示名称接口；前端是导航页，不是完整业务 UI。生产身份权限、数据库与外部资金集成尚需依据。已有实现可以作为候选工程范例，但必须在当前工作树重跑相关测试后再复用其证据。

## 操作入口

在仓库根执行，环境准备见 [本地开发](docs/howtos/local-development.md)：

```bash
npm ci
npm run dev
```

按目标显式进入工作流，不自动跨阶段：

```text
/evidence-model 讨论业务并保存发现记录
/evidence-model 根据充分材料修改当前 FM 并校验
用 evidence-requirements 明确软件职责与验收
用 evidence-api-design 根据已确认 FM 设计 API
用 evidence-task-planning 根据当前来源生成实施计划
用 evidence-delivery 检查前馈就绪情况并执行一个任务
```

质量入口见 [测试指南](docs/engineering/testing.md)：

```bash
npm run guides:verify
npm test
npm run lint
npm run build
./gradlew check
```

结构自洽、文件写入和命令成功不能替代业务批准。失败应带着真实证据回到正确层次，而不是被改写成完成。

## 实践总结

项目实践总结保存在 [docs/adoption/](docs/adoption/)：

- [需求模糊：Agent 不知道“好”长什么样](<docs/adoption/需求模糊：Agent 不知道“好”长什么样.md>)
- [隐式约定：规则只存在于人的脑子里](docs/adoption/隐式约定：规则只存在于人的脑子里.md)
- [信息散落：知识来源不唯一且更新不及时](docs/adoption/信息散落：知识来源不唯一且更新不及时.md)
- [虚假胜利：Agent 以为自己做完了，其实没有](<docs/adoption/虚假胜利：Agent 以为自己做完了，其实没有.md>)
- [指令文件腐化：AGENTS.md 越来越长，Agent 反而变笨了](<docs/adoption/指令文件腐化：AGENTS.md 越来越长，Agent 反而变笨了.md>)
