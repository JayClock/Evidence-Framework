# 文件

- [后端分层测试](backend-layers.md) - 说明后端 domain/api/persistent/app 四层测试与前端 Vitest 测试各自的测试边界、真实依赖与 Fake、证明什么、不证明什么，以及 BackendArchitectureTests 的 ArchUnit 层隔离规则；各层证据不能互相冒充。
- [Harness 与 Skill 测试](harness-tests.md) - 说明 Evidence Harness 自身维护回归的四类入口：Python unittest 聚合的 FM/API/规划/交付/可视化 Skill 套件、Pi 建模扩展的 Vitest 测试、Guides 检查器的 node --test 回归，以及人工评测 evals 与自动回归、业务来源之间的边界。
