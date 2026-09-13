---
type: guide
title: 快速开始
description: 面向 Agent 的仓库入口：说明 Evidence 单仓库如何由应用切片与交付 Harness 两个并行系统构成，给出 wiki 层级导航和启动、验证入口命令；本页只路由，不复制 Guides 导航或业务来源事实。
tags: [quickstart, evidence, harness, application-slice, modular-monolith, front-feed, delivery]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-13T15:01:55.008Z
sources:
  - id: openwiki-source-9361c44d74c0e18006d0d76f
    resource: repo://.agents/skills/README.md
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-ef51fbf9e4095e23ef5d8522
    resource: repo://apps/backend/README.md
  - id: openwiki-source-13b3d297eea3b9e2876d24fc
    resource: repo://docs/architecture/overview.md
  - id: openwiki-source-0b50da64836fae5bc5e3c8a5
    resource: repo://docs/guides/index.md
  - id: openwiki-source-8ba2dbea265abb9897199bb1
    resource: repo://docs/howtos/local-development.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
generated: { by: 'openwiki/0.5.0', at: '2026-09-13T15:01:55.008Z' }
---

# 快速开始

Evidence 是一个 Nx 单仓库，内部同时存在两个并行系统：

- **应用切片**：React/TypeScript 前端 + Spring Boot/Java 模块化单体后端，当前只交付「本地用户基础切片」。
- **交付 Harness**：把业务来源转成已验证软件变更的机制——`evidence-*` Skill 集、Pi 建模扩展、Guides 链接检查器与四层前馈。

业务来源、实现依据、任务状态与真实检查结果都保存在仓库文件里，新会话可以恢复同一项工作。本页是 wiki 的入口与任务路由图：需要事实细节时按链接进入对应页；业务事实、软件范围、架构基线与计划状态的唯一权威位置不在这里重复，见 [权威来源与前馈](concepts/evidence-sources.md)。

## 两个系统如何定位

| 系统         | 组成                                                                                                                                  | 当前范围                                                           | 深入页                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 应用切片     | `apps/backend` 组合根 + `libs/backend/domain` / `api` / `persistent` 技术库；`apps/frontend` React/Vite 导航页                        | 仅本地用户 `id + displayName` CRUD，不是生产身份、数据库或资金集成 | [后端架构](architecture/backend.md)、[前端导航应用](architecture/frontend.md)             |
| 交付 Harness | `.agents/skills/` 的 evidence-\* Skill、`.pi/extensions/evidence-modeling`、`tools/guides/check.mjs`、`docs/guides/index.md` 四层前馈 | 可移植方法 + 本仓库实际范围与工程决定，二者不互相复制              | [Harness 系统](architecture/harness.md)、[证据交付工作流](workflows/evidence-delivery.md) |

应用切片与 Harness 的关系：Harness 按授权把 `.evidence/` 里的业务事实与接口设计交付成后端/前端实现，并用可重复检查证明结果。应用切片是交付对象，Harness 是交付与验证机制。

## Wiki 导航

按任务目标路由，同一来源只加载一次：

| 你想做什么                      | 先读这些页                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| 理解后端请求路径与分层          | [后端模块化单体](architecture/backend.md) → [FM 到实现映射](concepts/domain-mapping.md)      |
| 理解前端导航页与开发代理        | [前端导航应用](architecture/frontend.md)                                                     |
| 理解 Harness 四类组件与双层循环 | [Harness 系统](architecture/harness.md) → [证据交付工作流](workflows/evidence-delivery.md)   |
| 分清来源、派生结果与当前代码    | [权威来源与前馈](concepts/evidence-sources.md)                                               |
| 准备环境并启动本地服务          | [本地开发与数据库](operations/local-development.md)                                          |
| 运行质量闸门并解释结果          | [验证闸门](operations/verification.md)                                                       |
| 判断各层测试证明什么            | [后端分层测试](testing/backend-layers.md)、[Harness 与 Skill 测试](testing/harness-tests.md) |
| 理解 OpenWiki 生成页如何刷新    | [OpenWiki 集成](integrations/openwiki.md)                                                    |

仓库内对应的原始入口（本项目宪法 `AGENTS.md`、Guides 导航 `docs/guides/index.md`、架构基线 `docs/architecture/overview.md`、根 `README.md`）是这些 wiki 页的依据，不是 wiki 的替代副本。开工、恢复、来源变化或纠偏后仍按 `docs/guides/index.md` 重新装配前馈，本页只做 wiki 内路由。

## 进入命令

在仓库根执行；环境准备细节见 [本地开发与数据库](operations/local-development.md)：

```bash
npm ci
npm run dev            # 同时启动前端与后端
# 或分开：
npm run dev:backend
npm run dev:frontend
```

预期入口：

- 前端：`http://localhost:4200/`，显示用户 API 导航页。
- 后端 Root：`http://127.0.0.1:8080/api/`，返回含 users 关系的 Root 表示。
- 健康：`http://127.0.0.1:8080/actuator/health`；健康只证明进程运行，不证明业务已验收。

验证入口见 [验证闸门](operations/verification.md)：

```bash
npm run guides:verify
npm test
npm run lint
npm run build
./gradlew check
```

涉及 Java 时才需要 `./gradlew check`。命令成功、结构自洽、文件写入和缓存命中都不能替代业务批准；失败应带着真实证据回到正确层次，而不是被改写成完成。

## 下一步

- 只想理解仓库职责分工：从 [权威来源与前馈](concepts/evidence-sources.md) 开始。
- 要执行一次交付：先读 [证据交付工作流](workflows/evidence-delivery.md)，它固定 skill 交接、停止条件与「一次一个任务」的纪律。
- 要跑起来看效果：按上面命令启动，再进入 [本地开发与数据库](operations/local-development.md) 处理端口、H2 文件与故障定位。
