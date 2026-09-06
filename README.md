# Evidence PoC

基于 Nx 的全栈 monorepo，包含 React 前端与 Java 后端。

## 技术栈

- Nx 23
- React 19 + TypeScript + Vite
- Java 17 + Spring Boot 4 + Gradle
- Vitest + JUnit

## 项目结构

```text
apps/
├── frontend/  # React 应用，端口 4200
└── backend/   # Spring Boot API，端口 8080
```

开发环境中的 `/api` 请求由 Vite 代理到 Spring Boot。示例接口为
`GET /api/hello`。

## 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本
- JDK 17 或更高版本
- Python 3.10 或更高版本（仅在 Evidence 统一 FM 建模或执行扩展自测时需要）

Gradle Wrapper 已包含在后端项目中，无需单独安装 Gradle。

## 开始使用

安装依赖：

```bash
npm install
```

同时启动前后端：

```bash
npm run dev
```

启动后访问：

- 前端：<http://localhost:4200>
- 后端接口：<http://localhost:8080/api/hello>
- Actuator 健康检查：<http://localhost:8080/actuator/health>

也可以分别启动：

```bash
npm run dev:frontend
npm run dev:backend
```

## 常用命令

```bash
npm run build   # 构建所有项目
npm test        # 测试所有项目
npm run lint    # 检查前端代码
npm run graph   # 查看 Nx 项目依赖图
```

直接使用 Nx：

```bash
npx nx serve @evidence-poc/frontend
npx nx serve backend
npx nx build @evidence-poc/frontend
npx nx build backend
npx nx test @evidence-poc/frontend
npx nx test backend
```

## Evidence 工程工作流

仓库内置了一个项目级 Pi Extension，通过本地 TUI 驱动以下流程：

```text
需求分析 → 统一建模（统一语言 + FM Schema v3）
        → 架构设计（按需 DDD 映射）→ Sprint 计划 → 逐故事真实 TDD → 独立审查 → 完成
```

首次使用：

```bash
npm install
pi
```

信任项目并重启 Pi 后执行：

```text
/evidence-init
```

初始化后直接从原始需求生成用户画像、问题陈述/MVP 和用户故事地图，不设置前置访谈或单独的基线确认。Modeling 是唯一建模入口，按统一语言 → 统一 FM → 阶段 Gate 推进，支持纯领域、纯渠道及履约混合范围，不因没有合同而跳过。DDD 边界和战术设计按需并入架构工件，不再独立生成四篇文档，也不把设计取舍当成自动计算。假设和待决策项记录在工件中，通过阶段 Gate 集中审核；就绪任务用 `/evidence-run` 继续，审核用 `/evidence-review`，修订用 `/evidence-revise`。

当前工作流状态版本为 5，不兼容版本 1/2/3/4。产物路径为 `artifacts/02-modeling/`，旧运行先备份，将配置中的 `models.domain` / `gates.domain` 改为 `modeling`，再 `/reload`、`/evidence-reset`、`/evidence-init`；不自动迁移或复用 Gate。配置文件和测试契约仍为版本 1；FM 仍为 Schema v3，Domain Context 语义不改名。不要手改状态或模型版本号绕过迁移。

扩展会按阶段限制模型工具、校验 Markdown 与机器测试契约、记录逐任务多循环 TDD 和验收结果、重跑全部计划检查及测试/lint/build，并将状态保存到 `.evidence/state.json`。完整说明见 [docs/evidence.md](docs/evidence.md)。

扩展自身检查：

```bash
npm run evidence:verify
```
