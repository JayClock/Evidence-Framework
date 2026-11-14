# Evidence Framework

> **The Pencil for Backend Architecture.**  
> 语言无关的领域履约模型设计工作台与 DSL 引擎。

---

## 🎯 项目定位

在前端领域，我们使用 **Pencil / Figma** 绘制设计稿，使用结构化的 DSL 表达 UI 布局、交互行为与组件状态。设计稿是独立的“单一真相源（Single Source of Truth）”，先于任何具体的前端框架（React / Vue / Flutter）存在。

而在后端架构中，业务模型往往从一开始就被迫与具体的代码实现绑死：

- 领域实体直接写死在特定的 ORM（JPA / Prisma / GORM）或特定编程语言中；
- 业务因果拓扑与状态机淹没在繁杂的代码细节中，架构文档永远滞后；
- 数据库建表与 API 接口各自为政，缺乏形式化的一致性约束（例如金额、状态等派生属性被前端作为入参传入导致业务漏洞）。

**Evidence 致力于成为后端领域的 Pencil。**

它提供了一套基于**履约建模法（Fulfillment Modeling）**的领域描述语言（DSL）与**桌面可视化建模工作台（Canvas & Inspector）**。架构师、业务专家乃至 AI Agent 能够在脱离具体编程语言的纯净环境中，精确表达业务权责、证据事实、履约流与派生规则，并通过内置的仿真引擎验证业务闭环。

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

### 3. 内存级确定性校验与场景仿真引擎

- **AST 严格静态门禁**：即时检测悬空引用、派生对称性破坏、角色权责失配等致命建模缺陷。
- **CEL 场景实例仿真**：在内存中直接编译求值规则表达式，导入测试用例（Scenarios）断言履约状态，无需启动数据库或编写测试代码即可验证业务闭环。
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

这份 DSL 不依赖任何 Java / Go / Python / Node 运行时，是纯粹的业务规范基线。

---

## 📦 模块架构（Monorepo）

```text
├── apps/
│   └── desktop/                         # 桌面可视化工作台宿主 (Electron Forge)
├── libs/
│   ├── desktop/                         # 桌面端下沉的 UI 与功能库
│   │   ├── ui-kit/                      # 基础呈现组件库 (Button, Panel, Modal 等)
│   │   ├── feature-canvas/              # 画布视图、节点渲染与连线交互
│   │   ├── feature-inspector/           # 属性审查面板、CEL 代码高亮与自动补全
│   │   └── testing/                     # 桌面端渲染测试夹具与 Mock 容器
│   ├── evidence-schema/                 # 领域模型 AST 定义与严格语法校验基石
│   ├── evidence-model-core/             # 纯内存图引擎、命令总线 (Undo/Redo)、CEL 仿真执行器 (Universal)
│   ├── evidence-model-io/               # 领域模型文件与便携 Bundle 序列化适配 (Node.js I/O)
│   ├── evidence-canvas-interaction/     # 纯数学画布交互计算（视口变换、泳道布局、框选）
│   ├── evidence-agent/                  # AI Agent 运行时：会话、提示词、治理闭环、原生传感器与 Tool 扩展
│   ├── evidence-mcp/                    # Model Context Protocol (MCP) 工具与桥接协议
│   ├── evidence-api/                    # API 契约投影与 OpenAPI 3.1 规格导出
│   └── evidence-visualization/          # 离线单文件 Review 工作台构建与 CSP 签名发布
└── docs/                                # 架构设计 RFC 与工作区规范
```

---

## 🚀 快速上手

### 依赖环境

- Node.js >= 20.0.0
- pnpm >= 9.0.0

### 启动桌面建模工作台

```bash
# 1. 安装依赖
pnpm install

# 2. 运行各模块测试与静态校验
pnpm test

# 3. 启动桌面端可视化建模工作台
pnpm desktop
```

### 命令行打包与检查模型

```bash
# 将模型目录打包为便携 Bundle
pnpm model:pack .evidence/fm --out procurement.evidence.json

# 静态检查与审查关键数据台账
pnpm model:inspect procurement.evidence.json

# 解包 Bundle 回目录树
pnpm model:unpack procurement.evidence.json --out .evidence/fm
```

---

## 🧭 未来规划与待办（Roadmap & TODOs）

随着 DSL、纯内存校验仿真引擎与桌面端三态视图的完备，后续待办主要聚焦于**下游实现投影**、**独立运行入口收敛**与**运行时双向闭环**：

### 1. 下游投影与交付契约（Downstream Projections）
- [x] **API 契约投影与 OpenAPI 导出**：严格遵守出入参隔离纪律，自动派生出标准 OpenAPI 3.1 交付契约（已在 `libs/evidence-api` 实现）。
- [x] **单文件离线审查工作台**：编译生成包含图谱投影、内联资产与 CSP 安全签名的独立审查 HTML（已在 `libs/evidence-visualization` 实现）。
- [ ] **Database Projection (SQL DDL)**：基于不可逆证据事实时间线与因果外键拓扑，自动派生标准关系型数据库（如 PostgreSQL）DDL 与版本化 Migration 迁移脚本。
- [ ] **多语言路由骨架代码生成（Code Generators）**：基于派生的 OpenAPI 契约，自动生成各后端主流语言/框架（如 Node.js / Go / Spring Boot）的强类型路由与 Controller 接口骨架。

### 2. 独立运行容器与入口收敛（Apps & Packaging）
- [ ] **统一命令行工具容器 (`apps/cli`)**：将目前散落在各 Libs 中的 `bin` 命令（`evidence-model`, `evidence-api`, `evidence-workbench`）收敛为统一命名的 `evidence <command>` 脚手架工具。
- [ ] **独立 MCP 服务端应用 (`apps/mcp-server`)**：将 MCP 协议服务从纯 Libs 提升为可脱离桌面端、独立以 stdio/SSE 启动的长周期服务容器。

### 3. 生产语义漂移与闭环治理（Drift & Governance）
- [ ] **生产环境双向语义漂移实时检测（Live Drift Check）**：深化本地传感器体系，实现对下游实际运行 API / 数据库表结构与 DSL 模型基线的在线语义比对和告警。
- [ ] **交互式复杂场景时序回放（Interactive Timeline Visualization）**：在桌面端将验证用例（Scenarios）的 CEL 求值过程与时间线渲染为可交互缩放的时序图。
