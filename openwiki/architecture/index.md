# 文件

- [后端模块化单体架构](backend.md) - 说明 Spring Boot 后端作为模块化单体的组合根与技术库划分，以及 HTTP → Jersey 子资源 → 领域关联 → MyBatis → H2 的端到端请求路径和各层归属。
- [前端导航应用架构](frontend.md) - 说明 React/Vite 前端导航应用的入口、路由、单页范围与开发代理，以及它只通过 HTTP 契约消费后端、不共享 Java 内部对象的边界。
- [Evidence Harness 系统](harness.md) - 说明证据交付 Harness 的四类组件：可移植的 evidence-\* Skill 集、项目级 Pi 建模扩展、四层前馈路由与 Guides 链接检查器，以及它们如何发现彼此并通过 .evidence 共享产物、按双层循环交付和验证软件。
