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
