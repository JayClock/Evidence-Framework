# Evidence Framework

> **The Pencil for Backend Architecture.**  
> 语言无关的领域履约模型设计工作台与形式化 DSL 引擎。

---

## 🎯 项目定位与核心理念

在前端领域，我们使用 **Pencil / Figma** 绘制设计稿，使用结构化的 DSL 表达 UI 布局、交互行为与组件状态。设计稿是独立的“单一真相源（Single Source of Truth）”，先于任何具体的前端框架（React / Vue / Flutter）存在。

而在后端架构中，业务模型往往从一开始就被迫与具体的代码实现绑死：

- **实现侵入模型**：领域实体直接写死在特定的 ORM（JPA / Prisma / GORM）或特定编程语言中；
- **业务因果湮灭**：业务因果拓扑与状态机淹没在繁杂的代码细节中，架构文档永远滞后；
- **缺乏形式化约束**：数据库建表与 API 接口各自为政，计算逻辑与出入参边界混乱。

### AI Coding 时代的后端确定性挑战

在 AI 辅助编程普及的今天，后端架构面临着更严峻的失控风险：
- **放手式 AI 生成的隐患**：让大模型直接生成后端业务代码时，AI 倾向于生成贫血的 CRUD 结构，极易将金额、优惠、状态等**服务端计算逻辑暴露为接口入参**，引发严重的业务与资金安全漏洞；
- **自圆其说的虚假单测**：AI 编写的测试往往基于其自身生成的代码假设，缺乏独立的业务事实约束，测试全部通过并不代表符合真实业务契约。

**Evidence 致力于成为后端领域的 Pencil 与形式化安全门禁。**

它提供了一套基于**履约建模法（Fulfillment Modeling v5）**的领域描述语言（DSL）与**桌面可视化建模工作台（Canvas & Inspector）**。确立**“宏观形式化确定，微观生成式灵活”**的设计原则：在脱离具体语言的环境中精确表达业务权责、事实凭证与派生规则，锁死架构与契约底线，为 AI Coding 提供不可伪造的外部验收基线。

### 研发范式对比

| 维度 | 传统手工 CRUD 开发 | 放手式 AI 编程 (Chat / Agent) | Evidence 履约建模驱动 |
| :--- | :--- | :--- | :--- |
| **领域抽象** | 与具体 ORM / 语言强行绑定 | 自由生成实体，容易演化为贫血 CRUD | **权责、事实证据与法定契约**（语言无关） |
| **派生与安全纪律** | 依赖开发者自觉，计算逻辑常泄漏给前端 | 极易允许入参直接覆盖金额/状态等派生值 | **CEL 声明式服务端求值**，出入参物理隔离 |
| **模型一致性** | 人肉维护文档与代码，文档永远滞后 | 随对话上下文漂移，生成逻辑前后矛盾 | **纯内存 AST 静态门禁**，按键级拓扑校验 |
| **人机协作模式** | 无 | 黑盒放手生成，人类只能逐行 Review 代码 | **人机协作门禁（Human Gate）**：画布审查 + 原子算子 |
| **验收与验证** | 手工补写测试用例，耗时且易遗漏 | AI 自己写测试验证自己的代码（假阳性高） | **规范向下投影为 Bruno HTTP 黑盒验收**与漂移告警 |

---

## 🔄 端到端 AI Coding 研发工作流（Workflow Panorama）

Evidence 不仅是一个桌面设计器，更是贯穿**业务意图澄清 ➔ 领域建模 ➔ 契约向下投影 ➔ AI 驱动多语言 TDD 编码 ➔ 运行时黑盒验收与防漂移**的完整研发闭环：

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              端到端 AI Coding 研发工作流                                │
│                                                                                        │
│  [阶段 1: 业务意图]    [阶段 2: 履约建模]    [阶段 3: 架构师门禁]    [阶段 4: 契约向下投影]    [阶段 5: AI 驱动编码]     [阶段 6: 验收与漂移]  │
│    需求澄清访谈  ──>    FM v5 形式化模型 ──>   桌面图谱与故事  ──>   OpenAPI + Bruno  ──>   多语言 TDD 实现  ──>   运行时黑盒验证   │
│   (AI Copilot)        (AST + CEL 守护)      (Human Gate)         (Evidence Export)      (Red-Green 循环)       (Bruno + oasdiff)│
│                                                                                        │
│   ── 宏观由 Evidence 门禁锁死安全边界与验收用例；微观由 AI Coding 自由探索具体语言实现 ──      │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
         【架构师 / 人机门禁 (Human Gate)】           【AI 编码助手 (Coding Agent)】
          - 桌面画布审查业务拓扑 (Canvas)             - 依据导出的 OpenAPI 编写服务
          - 检查关键数据台账 (Ledger)                 - 以 Bruno 集合为不可作弊的红灯目标
          - 回放业务演进故事 (Story Replay)           - 严格遵守服务端派生，不越界
```

### 1. 业务意图澄清（Requirement Elicitation）
架构师与 AI 助手（MCP / Agent Core）通过自然语言访谈，梳理业务上下文、参与方（Party）、主体角色（Role）与履约意图，澄清责任边界。

### 2. 领域履约建模与形式化守护（Fulfillment Modeling）
- 建立 Context、Contract、Request 与 Confirmation 原语；
- **纯内存 AST 静态门禁**：即时检测悬空引用、对称性破坏与角色权责失配；
- **CEL 严格派生纪律**：使用 Google Common Expression Language 声明式计算派生属性；
- **受控变异机制**：AI 助手通过 Universal Model Tools（`libs/evidence-tools`）的原子补丁算子修改模型，杜绝大文本重写导致的 AST 损坏。

### 3. 人机协作门禁（Human Gate: Desktop Canvas）
- 架构师启动桌面建模工作台（`pnpm desktop`），在画布上审查因果拓扑与关键数据台账（Key Data Ledger）；
- 在 **Story 回放面板** 中逐步演进事实卡片，进行 What-If 假设推演，确认无误后冻结基线。

### 4. 契约向下投影（Contract Projection）
运行统一命令行将模型编译并投影为下游工程契约：
```bash
pnpm evidence export --model b2b-escrow.evidence.json --out generated/ --verify
```
- **OpenAPI 3.1 规格**：自动导出 RESTful 接口契约，服务端派生属性已严格从 Request Input 中剔除；
- **Bruno 黑盒验收测试集**：内联样例直出验收，包含依赖捕获、金额断言与显式负向错误用例。
- **契约冻结**：契约与断言一经导出即作为不可篡改的“外部法典”，防止后续 AI 实现时私自修改测试以迁就代码。

### 5. AI 驱动多语言 TDD 编码（Polyglot Implementation via TDD）
- **Red（红灯）**：启动空服务，运行 Bruno 测试集，此时由于业务未实现全部报错。Bruno 集合充当了 **AI 无法伪造的外部 TDD 验收红灯**；
- **Green（绿灯）**：AI 编码助手（如 Cursor、Claude 等）阅读导出的 OpenAPI 契约和 Bruno 断言，编写对应语言的路由、状态机与业务逻辑，驱动测试逐个变绿；
- **实战样板**：参见 [examples/b2b-escrow](examples/b2b-escrow/README.md)，包含由契约驱动生成的 4 种独立参考实现：
  - [ts-fastify](examples/b2b-escrow/implementations/ts-fastify)（TypeScript）
  - `golang-gin`（Go）
  - `java-spring`（Java）
  - `python-fastapi`（Python）

### 6. 运行时黑盒验收与防漂移治理（Live Drift & Verification）
- **真机黑盒验收**：
  ```bash
  make -C examples/b2b-escrow verify IMPLEMENTATION=ts-fastify
  ```
  外部编排层为被测服务分配独立端口与内存账本，端到端执行真实 HTTP 红绿场景测试；
- **双向契约漂移门禁**：
  ```bash
  pnpm evidence diff baseline.evidence.json target.evidence.json
  ```
  借助内置 `oasdiff` 比对基线契约与当前实现，拦截任何未经授权的破坏性演进。

---

## ✨ 核心能力

### 1. 业务履约模型 DSL（Fulfillment Modeling v5）

抛弃贫血的 CRUD 实体思维，采用以**权责、请求、确认、事实证据**为核心的原语：

- **Context & Contract**：限定业务上下文与法定契约边界。
- **Party & Role**：严格区分业务参与方与主体角色权责。
- **Request / Confirmation**：成对的履约意图与确认动作。
- **Evidence**：由确认动作产生的不可逆事实凭证（附带业务发生时间戳）。
- **CEL Derivation Rules**：使用 Google Common Expression Language 声明式定义派生属性，杜绝将服务端计算逻辑暴露为接口入参。

### 2. 可视化建模工作台（Desktop Canvas & Inspector）

基于 Electron + 现代化 Web 画布构建的桌面端建模环境：

- **领域图谱画布**：直观拖拽实体、连线建立履约流、展示因果依赖拓扑。
- **声明式属性检查器（Inspector）**：所见即所得地配置字段契约、关键数据台账（Key Data Ledger）与派生规则。
- **双向无损格式**：支持 Git 友好的目录树结构（`.evidence/fm/`）与轻量便携的单文件 Bundle（`*.evidence.json`），零 Git churn，随时解包与打包。

### 3. 静态模型校验与标准化 HTTP 验收

- **AST 严格静态门禁**：即时检测悬空引用、派生对称性破坏、角色权责失配等致命建模缺陷。
- **内联样例直出验收**：实体 `examples[].test` 声明测试流程，编译期 CEL 求值产生派生断言，直接导出 Bruno 集合；由 Bruno CLI 对真实后端执行 HTTP 验收。静态检查通过不代表后端验收通过。
- **纯 TypeScript 原生化**：核心引擎完全在内存执行，为画布提供按键级（Keystroke-level）的实时 Lint 反馈。

### 4. AI 智能体协同建模（MCP / Agent Core）

- 原生支持 **Model Context Protocol (MCP)**。
- 允许 AI 编码助手（如 Claude、Pi SDK）作为“访谈员”和“建模副驾”，通过自然语言澄清业务权责，直接以受控工具调用的形式读写 Evidence DSL，并在静态门禁的监督下自动修正模型。

---

## 🛠️ DSL 示例：语言无关的履约事实表达

以下是 Evidence 表达的一段采购履约片段（保存为 `*.evidence.json` 或 `.evidence/fm/`）：

```jsonc
{
  "context": "ProcurementContext",
  "request": {
    "name": "PurchaseOrderRequest",
    "inputs": {
      "quantity": { "type": "Integer", "minimum": 1 },
      "unitPrice": { "type": "Decimal", "minimum": 0 },
    },
  },
  "confirmation": {
    "name": "PurchaseOrderConfirmation",
    "produces": "PurchaseContractEvidence",
    "rules": [
      // 核心纪律：服务端严格派生，不可作为前端入参传入
      {
        "field": "totalAmount",
        "expr": "request.quantity * request.unitPrice",
      },
    ],
  },
}
```

这份 DSL 不依赖任何 Java / Go / Python / Node 运行时，是纯粹的形式化业务规范基线。

---

## 💡 架构权衡与工程实践（Lessons Learned）

在 Evidence 演进过程中，我们沉淀了一套严谨的工程权衡纪律：

1. **彻底消除第二运行时，全栈纯内存 TypeScript 执行**
   早期工具链常混用外部脚本与 Node 工具，导致环境碎片化、依赖锁定脆弱且桌面端与命令行校验逻辑脱节。Evidence 全面收敛为纯内存 TypeScript 执行，不仅消除了额外运行时配置，更赋予了桌面画布**按键级（Keystroke-level）的毫秒级即时校验反馈**。
2. **服务端严格派生纪律（Server-Side Derivation Discipline）**
   AI 编程中最易犯的安全漏洞是将金额、状态等派生值交由前端计算并传入。Evidence 在 DSL 与投影层设立物理隔离：派生属性严禁出现在 Request Input 中，强制在 Confirmation / Evidence 中由服务端 CEL 规则封闭计算。
3. **投影与验收彻底解耦（Projection vs Acceptance Decoupling）**
   静态自洽不代表运行时正确。OpenAPI 导出只负责交付规格，黑盒验收完全交由导出的 Bruno 真实 HTTP 场景对运行中的后端发起网络探测。静态门禁和网络验收是两道独立关卡。
4. **零 Go/Docker 的固定原生二进制编排（Native OASDiff Provisioning）**
   为保证 CI 与本地环境具备严苛的 API 变更比对能力，不引入笨重的 Docker 或第二语言编译环境，内置轻量级预编译二进制调配方案（`pnpm api:setup`），保证跨平台一致性。
5. **受控原子算子对抗 LLM 格式雪崩（Guarded Mutation Operators）**
   直接让 LLM 读写整块 DSL 文件极易引发括号损坏或引用断裂。Evidence 将模型变更封装为原子的、强类型的 Patch 操作（`libs/evidence-tools`），每次变异即刻触发 AST 守护门禁，非法变异即时回滚。

---

## 📂 可运行的契约与多语言实战示例

- [B2B 担保采购与里程碑履约](examples/b2b-escrow/README.md)：**【AI Coding 完整实战样板】** 涵盖 4 份双边合同、三方角色、4 种独立后端框架实现（Fastify / Gin / Spring / FastAPI）、11 个真实 Bruno 红绿场景及 DoD 严格回归门禁。
- [数字广告投放](examples/digital-advertising/README.md)：单次支付确认、磋商后签署独立订单、日报异步受理。
- [产研迭代计划](examples/agile-sprint/README.md)：一个迭代窗口内追加多份故事验收凭证。
- [共享结算](examples/shared-settlement/README.md)：一笔收入核销季度及年度指标，支持从两处反向追溯。

运行 `pnpm nx build cli && pnpm examples:verify` 可对示例进行只读核验。

---

## 📦 模块架构（Monorepo）

```text
├── apps/
│   ├── cli/                             # 统一 evidence 命令行入口 (cac)
│   └── desktop/                         # 桌面可视化工作台宿主 (Electron Forge)
├── libs/
│   ├── desktop/                         # 桌面端下沉的 UI 与功能库
│   │   ├── contracts/                   # Desktop IPC 通道与强类型契约，供壳与 Feature 共享
│   │   ├── ui-kit/                      # 基础呈现组件库 (Button, Panel, Modal 等)
│   │   ├── feature-canvas/              # 画布视图、节点渲染与连线交互
│   │   ├── feature-inspector/           # 属性审查面板、CEL 代码高亮与自动补全
│   │   ├── feature-story/               # 故事回放、事实卡片与 What-If 交互
│   │   ├── feature-delivery/            # 交付中心、增量预览与导出状态
│   │   ├── feature-drift/               # 生产漂移雷达与 trace 选择
│   │   ├── feature-agent/               # Copilot 会话、补丁桥接与审查
│   │   └── testing/                     # 桌面端渲染测试夹具与 Mock 容器
│   ├── evidence-schema/                 # 领域模型 AST 定义与严格语法校验基石
│   ├── evidence-model-core/             # 纯内存图引擎、命令总线 (Undo/Redo)、CEL 仿真执行器 (Universal)
│   ├── evidence-model-io/               # 领域模型文件与便携 Bundle 序列化适配 (Node.js I/O)
│   ├── evidence-canvas-interaction/     # 纯数学画布交互计算（视口变换、泳道布局、框选）
│   ├── evidence-tools/                  # Universal 模型工具注册表：统一 Pi/MCP 算子与受控补丁入口
│   ├── evidence-agent/                  # AI Agent 运行时：会话、提示词、治理闭环、原生传感器与 Tool 扩展
│   ├── evidence-mcp/                    # Model Context Protocol (MCP) 工具与桥接协议
│   ├── evidence-api/                    # API 契约投影与 OpenAPI 3.1 规格导出（不执行验收）
│   └── evidence-acceptance/             # Bruno 生成、HTTP 验收、漂移与 oasdiff 兼容性门禁
└── docs/                                # 架构设计 RFC 与工作区规范
```

---

## 🚀 快速上手

### 依赖环境

- Node.js 22
- pnpm 12.16.1（见 `package.json` 的 `packageManager`）

### 启动桌面建模工作台

```bash
# 1. 安装工作区依赖，并单独准备 API 兼容性检查及相关测试所需的 oasdiff
pnpm install
pnpm api:setup

# 2. 运行各模块测试与静态校验
pnpm test

# 3. 启动桌面端可视化建模工作台
pnpm desktop
```

`pnpm install` 安装验收所用的固定版本 Bruno CLI，无需全局安装 `bru`。`pnpm api:setup` 则单独下载固定版本的 `oasdiff` 预编译二进制并校验归档校验和及可执行文件版本，无需 Go 或 Docker；已有匹配版本时复用缓存。删除 `node_modules` 或工具缓存后，需在 API 比对及相关测试前重新运行。详见 [ENVIRONMENT.md](ENVIRONMENT.md)。

### 统一命令行

先运行 `pnpm nx build cli`，再使用唯一入口 `pnpm evidence <command>`。各命令的参数说明由 `--help` 查看；输出路径均相对调用方的工作目录解析。

```bash
# 静态检查（不等同于 HTTP 验收）；--scope 可重复
pnpm evidence check .evidence/fm --scope context.procurement --json

# 将模型目录打包为便携 Bundle，再解包回目录树
pnpm evidence pack .evidence/fm -o procurement.evidence.json
pnpm evidence unpack procurement.evidence.json --out .evidence/fm
pnpm evidence inspect procurement.evidence.json --json

# 编译通过静态检查的模型、导出属性追溯
pnpm evidence compile .evidence/fm --out compiled.json --compact
pnpm evidence lineage .evidence/fm --out lineage.json

# 导出 OpenAPI 3.1 与 Bruno 集合
pnpm evidence export --model procurement.evidence.json --out dist/contracts
pnpm evidence export --model procurement.evidence.json --out dist/contracts --verify
pnpm evidence test --target http://localhost:8080 --scenarios dist/contracts --json

# 契约演进比较（默认 Markdown；机器消费时显式指定 JSON）
pnpm evidence diff baseline.evidence.json procurement.evidence.json --format json
```

**验收迁移**：Step CI 和 Hurl 不再支持。移除验收导出命令的 `--format` 参数，从模型重新导出，并将 `test --scenarios` 指向完整的生成目录，而不是旧测试文件。可在 Bruno Desktop 打开集合进行调试；CI 应使用 `evidence test`，以执行响应 Schema 校验与 Regression / DoD 门禁。`diff --format` 不受影响。

旧的 `evidence-model`、`evidence-api` 可执行入口暂时保留，执行时只向 **stderr** 输出弃用提示，不污染 JSON stdout。它们与统一入口复用库内执行逻辑，不反向依赖应用包。

| 旧入口                                                                                      | 推荐入口                                                         |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `evidence-model pack/unpack/inspect/check/compile/lineage`                                  | `evidence pack/unpack/inspect/check/compile/lineage`             |
| 常规契约与验收导出                                                                          | `evidence export`                                                |
| `evidence-api inspect/check/project/deliver/export-tests/diff`（含 overlay 与固定检查报告） | `evidence api <command>`（支持 `--model` 与 `-o`；验收导出不再接受 `--format`） |
| `evidence diff api <base> <target>`                                                         | `evidence diff <base> <target>`；旧写法保留 JSON 默认值          |

`model:pack`、`model:unpack`、`model:inspect`、`api:export`、`api:diff` 根脚本仍可使用，但均已转到 `apps/cli`。门禁参数、退出码与只读 `--verify` 行为保持不变。

---

## 🧭 未来规划与待办（Roadmap & TODOs）

随着 DSL、纯内存校验仿真引擎与桌面端三态视图的完备，后续待办主要聚焦于**下游实现投影**、**独立运行入口收敛**与**运行时双向闭环**：

### 1. 下游投影与交付契约（Downstream Projections）

- [x] **API 契约投影与 OpenAPI 导出**：严格遵守出入参隔离纪律，自动派生出标准 OpenAPI 3.1 交付契约（已在 `libs/evidence-api` 实现）。
- [ ] **Database Projection (SQL DDL)**：基于不可逆证据事实时间线与因果外键拓扑，自动派生标准关系型数据库（如 PostgreSQL）DDL 与版本化 Migration 迁移脚本。
- [ ] **多语言路由骨架代码生成（Code Generators）**：基于派生的 OpenAPI 契约，自动生成各后端主流语言/框架（如 Node.js / Go / Spring Boot）的强类型路由与 Controller 接口骨架。

### 2. 独立运行容器与入口收敛（Apps & Packaging）

- [x] **统一命令行工具容器 (`apps/cli`)**：基于 `cac` 提供 `evidence check/test/export/diff/pack/unpack/compile`；保留 `inspect/lineage` 与 `api` 兼容工作流，旧 Libs `bin` 入口作为弃用适配器过渡。
- [ ] **独立 MCP 服务端应用 (`apps/mcp-server`)**：将 MCP 协议服务从纯 Libs 提升为可脱离桌面端、独立以 stdio/SSE 启动的长周期服务容器。

### 3. 生产语义漂移与闭环治理（Drift & Governance）

- [ ] **生产环境双向语义漂移实时检测（Live Drift Check）**：深化本地传感器体系，实现对下游实际运行 API / 数据库表结构与 DSL 模型基线的在线语义比对和告警。
- [x] **标准场景验收导出**：从内联 `examples[].test` 直接导出 Bruno 集合，支持依赖捕获、派生断言和显式负向用例。旧 Scenario / Instance 文件格式及内存回放器已移除。

### 4. 架构与工程规范通用化（Industry Standard Refactoring）

针对现有代码实现中自研胶水层与非标准实践的重构待办，向现代前端/Node.js 开源生态通用实践演进：

- [ ] **OpenAPI 3.1 契约生成类型化重构（Type-safe OpenAPI Builder）**：替换 `libs/evidence-api` 中手写对象字典拼接 OpenAPI 规格的方式，引入 `@asteasolutions/zod-to-openapi` 或 `openapi3-ts`，直接基于 `libs/evidence-schema` 的 Zod 定义派生 OpenAPI 3.1 文档，获得编译期结构校验与自动 `$ref` 引用管理。
- [ ] **API 差异比对（oasdiff）分发与原生执行优化**：重构 `tools/oasdiff/setup.mjs` 中基于 `fetch` 下载外部二进制的逻辑，改用 npm `optionalDependencies` 平台包分发二进制，或迁移至纯 TypeScript 原生 OpenAPI Diff 引擎（如 `@openapitools/openapi-diff`），规避离线与内网 CI 环境网络阻断。
- [ ] **HTTP 验收测试引擎解耦与内存化执行**：
  - **交付与执行解耦**：保留 Bruno `.bru` 集合作为面向人类开发者的导出交付物；CLI / CI 自动化验收引擎（`libs/evidence-acceptance`）改为内存化 HTTP Runner（基于 Node 原生 `fetch` / `undici`），消除临时文件 I/O 与子进程冷启动开销。
  - **响应路径解析标准化**：使用标准 RFC 6901 `json-pointer` 或 `jsonpath-plus` 替换 `brunoRenderer.ts` 中手写的正则表达式属性路径解析器。
- [ ] **Electron 跨进程通信体系重构（Type-safe IPC）**：使用 `electron-trpc` 或 `zod-ipc` 替换 `libs/desktop/contracts` 与 `apps/desktop/src/preload` 中大量手写字符串 Channel 常量与 Preload 模板粘合代码，建立端到端强类型 RPC 与自动校验。
- [ ] **MCP 跨进程桥接协议标准化（MCP Transport & JSON-RPC 2.0）**：重构 `libs/evidence-mcp/src/bridge` 中自研的换行符 JSON 短连接协议，全面对齐 MCP 官方规范，优先采用官方标准 Transport（`StdioServerTransport` / `SSEServerTransport`），或在本地管道使用标准的 `vscode-jsonrpc` 多路复用长连接。
- [ ] **CLI 框架与工具链生态现代化**：
  - 将长期未维护的 `cac` 迁移至成熟活跃的 `commander` 或现代极简的 `citty`；
  - 优化 `prettyCanonicalJson` 等 JSON 规范化处理，避免多重反序列化/序列化损耗；
  - 统一收敛 Zod 与 Ajv 的校验职责边界，提升单一真相源一致性。

