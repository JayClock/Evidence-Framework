# Evidence：用双层循环驾驭 FM 到 smart-domain 交付

本仓库以**双层循环（Dual-Loop Model）**为主轴，把业务发现、FM 建模、任务规划和 smart-domain 实施组织成一个可恢复、可检查的本地 Harness。

核心思想不是让 Agent 一次做对，也不是把所有工作无限拆小，而是用两种不同的循环控制不同层次的问题：

- **外层 PDCA**管理任务分解与进度：现在做什么、做到哪里、何时检查、何时调整计划；
- **内层操控循环（Steering Loop）**管理单个任务的执行质量：行动前提供依据，行动后取得反馈，再由 Agent 自我纠正。

```text
外层：PDCA —— 管方向、分解、依赖和进度

Plan ──> Do ──> Check ──> Act
  ^                          │
  └──────── 下一轮计划 ──────┘
             │
             │ 每次只下发一个边界明确的任务
             ▼
内层：Steering Loop —— 管当前任务如何做对

Guides ──> Action ──> Sensors ──> Steer
   ^                                  │
   └──── 未达标且可局部修正时重试 ────┘
```

## 1. 为什么需要两层循环

一个完整的软件交付无法只靠更长的提示词完成。

对于整体工作，Agent 会受到上下文长度、注意力漂移和复杂推理下降的影响，因此需要外层 PDCA 把目标拆成有依赖、可验收的任务，并持续追踪状态。对于边界已经明确的单个任务，继续机械拆分通常不能提高质量；真正需要的是清楚的业务依据、执行规则、自动检查和纠偏路径，因此使用内层操控循环。

```text
复杂项目失控
  ├── “下一步做什么不清楚” ──> 外层 PDCA
  ├── “当前任务依据不充分” ──> Guides
  ├── “Agent 声称完成但未验证” ──> Sensors
  └── “检查失败后不知道去哪” ──> Steer / 外层 Act
```

外层循环不代替内层质量控制，内层循环也不擅自改变项目方向。二者通过仓库中的计划、状态和真实证据衔接。

## 2. 外层循环：从 FM 到任务 DAG

本项目的外层 PDCA 以 FM 为业务事实源，以 smart-domain 计划为实施状态源。

### Plan：建立事实并编译计划

```text
业务材料
   ↓
发现与澄清
   ↓
FM Schema v3
   ↓
可选 API Schema 4.0
   ↓
工作单元 inventory
   ↓
Agent 显式 slicing
   ↓
确定性 compiled 任务 DAG
```

对应组件：

- `evidence-modeling`：组合业务澄清、FM 编辑和校验；
- `evidence-discovery`：保存业务材料、回答、问题和交接；
- `evidence-fm`：维护 FM Schema v3、规则、场景和校验；
- `evidence-api-design`：从已确认 FM 设计整体 API；
- `evidence-task-planning`：提取工作单元，由 Agent 设计切片，再由程序计算稳定 `taskKey`、依赖、执行顺序和覆盖。

语义切片交给 Agent，确定性身份和图校验交给代码。`task_compiler.py` 不替 Agent 判断业务边界，也不把结构覆盖冒充业务批准。

### Do：一次执行一个就绪任务

`evidence-delivery` 从 `compiled.executionOrder` 中选择满足以下条件的任务：

- 状态为 `planned`；
- 所有 `dependsOn` 已经 `done`；
- 没有影响当前任务的未决阻塞；
- 任务文件、业务事实和检查定义有效。

它只加载当前任务、直接前置产物和相关 FM/API 切片，不把整份项目上下文塞给 Agent。任务完成后停止，等待下一次明确的继续动作，不自动推进整个 DAG。

### Check：检查任务和计划

外层检查汇总三类真实反馈：

1. 当前任务文件声明的 CHECK；
2. 计划结构、状态、依赖和证据一致性；
3. 项目的测试、lint 和 build 等质量命令。

只读状态检查：

```bash
python3 .agents/skills/evidence-delivery/scripts/plan_state.py verify \
  --index docs/plans/smart-domain/index.md

python3 .agents/skills/evidence-delivery/scripts/plan_state.py next \
  --index docs/plans/smart-domain/index.md
```

`verify` 检查：

- task、taskNotes 和任务文件一一对应；
- `taskKey`、`planRef`、路径及 CHECK ID 有效且唯一；
- 执行顺序满足依赖；
- `blocked` 任务关联已登记 gap；
- 空检查命令关联明确 gap；
- `done` 任务具有完成条件和真实 `observedEvidence`；
- 编译覆盖完整且没有遗留 compiler diagnostics。

`next` 只计算可执行任务，不写状态、不调用任务、不自动批准。

### Act：继续、阻塞或重规划

| 检查结果             | 外层动作                        |
| -------------------- | ------------------------------- |
| 当前实现错误         | 留在当前任务，进入内层修复      |
| 前置、命令或环境缺失 | 登记 gap，只阻塞受影响任务      |
| 任务切片或依赖错误   | 修订 slicing，重新编译 DAG      |
| FM/API 业务事实变化  | 停止使用旧证据，返回 Plan       |
| 完成条件和检查均满足 | 记录证据并将当前任务设为 `done` |

Act 的目标不是让所有失败都变成通过，而是把反馈送回正确层次。

## 3. 内层循环：让一个任务做对

每个 `docs/plans/smart-domain/tasks/*.md` 都定义一个可独立恢复的任务操控循环。

### Guides：行动前提供依据

Agent 只读取当前任务所需内容：

- taskKey、业务事实、规则和场景；
- 行为拥有者、业务模块和公开契约；
- 文件范围及非目标；
- 前置产物的使用方式；
- CHECK、完成条件和合法执行模式。

Guides 负责提高第一次行动正确的概率，并阻止 Agent 越过业务边界、重复共享工作或补造未知事实。

### Action：在边界内实施

Agent 根据任务的 `mode` 行动：

- `implementation`：普通实现和回归；
- `verify`：定位并复跑已有行为；
- `design`、`setup`、`manual`：执行对应的设计、环境或人工工序。

领域行为归领域对象和已明确的业务角色，不因为使用 MyBatis、Jersey 或 smart-domain 就把业务规则搬到 Mapper、Resource 或无业务语义的 Service。

### Sensors：取得可重复反馈

计算型反馈交给工具：

- 单元测试、集成测试和验收测试；
- 编译、静态分析和架构测试；
- HTTP、SQL、事务回滚和模块边界检查；
- taskKey、依赖、覆盖和状态一致性检查。

需要语义理解的判断留给 Agent：

- 实现是否忠于 FM；
- 测试是否真正证明业务结果；
- 模块切分是否符合业务内聚性；
- 失败属于代码、任务设计、计划切片还是业务事实缺口。

机器命令成功只能证明它实际检查的内容，不能自动证明业务正确或获得人工批准。

### Steer：根据反馈纠偏

```text
代码问题       → 当前任务内修复并重跑检查
任务设计问题   → 修订任务详情，不改变业务事实
切片/依赖问题  → 上抛外层 Plan，重新编译
业务事实问题   → 回到 FM 澄清，不猜测实现
环境问题       → 标记 blocked，如实记录未验证
当前任务通过   → 记录证据，回到外层 Check/Act
```

Steer 不允许通过删除失败测试、削弱场景或修改 FM 来制造“通过结果”。

## 4. 状态连接两层循环

状态是前馈与反馈之间、内层与外层之间的桥梁。本项目采用“仓库即规范”，不在扩展中维护隐藏工作流状态。

```text
.evidence/
├── discovery.md                     # 业务材料、回答、问题和交接
├── fm/                              # 唯一当前 FM 业务事实
├── api/api.yaml                     # 可选 API 设计事实
└── checks/                          # 获授权保存的真实检查记录

docs/plans/smart-domain/
├── index.md                         # slicing、compiled、taskNotes、gaps
└── tasks/
    └── <具体交付结果>.md            # 局部设计、CHECK、observedEvidence
```

关键追溯链：

```text
FM/API source ID
  → unitKey
  → taskKey
  → task file
  → CHECK
  → observedEvidence
  → taskNotes.status
```

状态职责严格分离：

- `compiled` 是程序从当前输入计算的投影，不手填；
- `taskNotes` 是任务状态的唯一维护位置；
- `observedEvidence` 只保存真实执行结果；
- `gaps` 如实保存未知和阻塞，不用无依据的 N/A 隐藏；
- 文件存在、写入成功、旧测试通过和 Agent 自评都不等于当前完成。

## 5. Harness 的四个子系统

双层循环是概念模型，真正让它稳定运行的是 Instructions、Tools & Skills、Environment 和 State 四个子系统。四者必须协同：Instructions 决定如何行动和检查，Tools & Skills 提供可执行能力，Environment 保证反馈可信，State 把反馈带入下一轮。

### Instructions：驾驭 Agent 的内置循环

指令既包含前馈，也包含反馈规则：

- `AGENTS.md` 保存项目级边界、权限和不变量；
- `SKILL.md` 封装一类任务的 Guides、Action、Sensors 和 Steer；
- `index.md` 描述外层任务图、状态和缺口；
- `tasks/*.md` 描述当前任务的局部设计、步骤、检查和退出条件。

指令采用渐进式信息披露。Agent 先读取项目规则，再读取匹配的 Skill，最后只加载当前任务及其直接依赖，避免无关上下文稀释注意力。

### Tools & Skills：封装行动与计算型控制

Skill 是可复用的操控循环，工具负责确定、重复的计算：

| 能力                     | 责任                                   |
| ------------------------ | -------------------------------------- |
| `evidence-modeling`      | 串联业务澄清、模型编辑、校验和停止条件 |
| `evidence-task-planning` | 提取工作单元、设计任务切片并编译 DAG   |
| `evidence-delivery`      | 选择就绪任务并驱动外层 PDCA 与内层纠偏 |
| `task_compiler.py`       | 计算稳定身份、依赖顺序和结构覆盖       |
| `plan_state.py`          | 检查计划状态并只读计算可执行任务       |
| 测试与校验器             | 产生编译、规则、场景和行为反馈         |

确定性逻辑不交给大模型估算；需要业务语义理解的切片、判断和转向不硬编码成脆弱规则。

### Environment：保证行动和反馈可复现

同一个检查只有在一致环境中才有意义。环境子系统负责：

- 固定运行时和依赖版本；
- 使用仓库内的命令、配置和 Wrapper；
- 明确每个 CHECK 的工作目录、输入和前置条件；
- 区分环境失败、实现失败和业务失败；
- 让新会话或另一台机器能够重跑同一检查。

环境不可用时任务进入 `blocked`，安装失败、命令错误或配置缺失不代表业务行为已经得到验证。

### State：连接前馈、反馈和两层循环

State 是 Harness 的核心连接器：

- 外层通过 `compiled` 和 `taskNotes` 向内层下发任务、依赖和状态；
- 内层通过 CHECK 结果、`observedEvidence` 和 gap 向外层反馈；
- 下一轮从仓库恢复，而不是依赖聊天记忆；
- 状态变化必须对应真实行动或观察，不由扩展后台推进。

状态同时支持三种转向：当前任务内修复、返回计划重新切片、回到 FM 澄清业务事实。没有持久状态，这些反馈就无法进入下一轮 Guides。

### 四个子系统如何协同

```text
Instructions
  给出目标、边界、检查和停止条件
        ↓
Tools & Skills ──在 Environment 中执行──> Action / Sensors
        │                                      │
        └──────── 读写明确的 State <───────────┘
                              │
                              ├─ 内层 Steer：修复当前任务
                              └─ 外层 Act：完成、阻塞或重规划
```

`.pi/extensions/evidence-modeling/` 只是交互适配器：它提供 `/evidence-model` 和单问题 UI，但不读写模型、不持有状态、不注册自动推进、不发布模型，也不操作 Git。

最终分工是：扩展负责交互，Skill 负责流程，脚本负责确定性检查，环境保证反馈可复现，仓库文件负责状态。

## 6. 从建模到交付的完整路径

Evidence Harness 包含两个可独立进入的工作流：**建模工作流**由 `evidence-modeling` 组合专业能力；**交付工作流**由 `evidence-task-planning` 与 `evidence-delivery` 协作。工作流是职责分组，双层循环指交付中的外层 PDCA 与单任务内层操控循环。

```text
1. /evidence-model 讨论业务
   └─ 保存业务材料、理解、问题和回答

2. /evidence-model 生成或修改 FM
   └─ 编辑 .evidence/fm/，执行 Schema/CEL/lineage/simulation/timeline

3. 可选：使用 evidence-api-design
   └─ 生成并校验 .evidence/api/api.yaml

4. 使用 evidence-task-planning
   └─ inventory → slicing → compile
   └─ 生成 docs/plans/smart-domain/index.md 与 tasks/*.md

5. 使用 evidence-delivery
   └─ verify → next → 执行一个任务的内层操控循环
   └─ 记录真实证据并停止

6. 再次明确继续
   └─ 外层 Check/Act 后选择下一任务或返回上游重规划
```

整个流程不要求多 Agent 编排；Skill 编排加仓库状态即可形成外层循环。人工输入集中在真正需要判断的地方：业务事实、范围调整、设计取舍和批准，而不是每次重复检查格式、依赖和命令结果。

## 7. 快速开始

准备 Node.js 24 LTS、npm 10+、Python 3.10+ 和 JDK 17：

```bash
npm install
npx pi
```

信任项目扩展与 Skills 并重启 Pi，然后显式启动 FM 工作：

```text
/evidence-model 讨论订阅退款业务并整理发现记录
/evidence-model 根据现有发现生成或修改 FM，并执行完整校验
/evidence-model 只读校验当前 FM，不修改文件
```

讨论、模型编辑和只读校验是不同授权。普通业务回答不等于允许修改正式模型；模型写入、机器校验通过和业务批准也是三个不同结论。

建模完成后，在对话中明确要求：

```text
用 evidence-task-planning 根据当前 FM 和 API 生成实施计划
用 evidence-delivery 检查下一项并继续实施
用 evidence-delivery 恢复交付进度
```

## 8. Harness 项目结构

```text
.pi/extensions/evidence-modeling/      # 建模命令与单问题 UI
.agents/skills/evidence-modeling/      # 建模工作流组合入口
.agents/skills/evidence-task-planning/ # 外层 Plan：工作单元、切片和 DAG
.agents/skills/evidence-delivery/      # 外层 PDCA 与单任务操控循环
.evidence/                            # 业务事实和检查记录
docs/plans/smart-domain/               # 任务 DAG、状态和任务详情
AGENTS.md                             # 项目级边界和工作约束
docs/evidence-modeling.md              # 建模工作流使用指南
```

README 只描述 Harness、模型与交付循环。尚未成为已确认任务产物的应用代码、模块和接口不在这里声明；具体代码范围、技术选择与检查命令应来自当前任务计划及其真实证据。

## 9. Harness 维护验证

```bash
npm run evidence-modeling:verify

python3 -m unittest discover \
  -s .agents/skills/evidence-task-planning/tests -v

python3 -m unittest discover \
  -s .agents/skills/evidence-delivery/tests -v
```

详细建模说明见 [Evidence Modeling 指南](docs/evidence-modeling.md)，Skills 测试入口见 [测试指南](.agents/skills/evidence-modeling/tests/README.md)。

自动化检查是 Sensors，不是最终裁判。结构校验、场景模拟和命令成功不能替代业务核对、设计判断或人工批准。
