# 前馈重构检查与交接

## 改动范围

- 项目入口改为 AGENTS.md → docs/guides/index.md；README 直接描述四层前馈与双层交付循环，不保留并存方案或兼容入口。
- 项目基线分别落在 requirements、architecture；工程规范、真实范例和操作方法分别落在 engineering、howtos。
- 后端 README 只维护本地用户切片行为；架构、工程方法、启动、数据库和验证转为引用其唯一维护处。
- planning/delivery Skill、共享前馈协议和任务模板明确业务/工程来源、procedureRefs、开工检查、工程来源新鲜度与局部阻塞；保留单一 taskNotes / observedEvidence 职责。
- 清理有效指南中的冲突架构表述和失效链接，业务/API 导航不再复制业务计数或指向不存在的生成目录。
- 新增只读 Guides 检查器及 7 项回归、规划模板 3 项与交付协议 2 项结构回归，接入 npm test / lint；新增 4 个未执行的模型行为评估用例。

本次未修改 FM 源、API 设计源、业务审核状态或产品源码；保留进入本次任务之前的工作树改动。没有生成业务 DAG，没有把任何业务任务标为 done，没有 Git 提交或历史改写。

## 实际结果

命令、运行环境、退出码、日志 SHA-256 见 [results.json](results.json)。

| 检查                             | 结果                                                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| npm run guides:verify            | 通过：7 项检查器回归，34 份有效文档、232 个本地内联链接零错误，格式通过                                                                      |
| planning suite                   | 37 项通过，含 3 项前馈模板/协议回归；见 test.log                                                                                             |
| delivery suite                   | 12 项通过，含 2 项前馈/恢复协议回归；见 test.log                                                                                             |
| npm run lint                     | 通过                                                                                                                                         |
| npm run build                    | 通过                                                                                                                                         |
| ./gradlew check                  | 通过；28 个任务均 UP-TO-DATE，不声称重新执行 Java 测试                                                                                       |
| npm run evidence-modeling:verify | 通过，18 项扩展测试及类型/格式检查                                                                                                           |
| npm test                         | 失败：API 示例的 OpenAPI 文本一致性检查失败，其他已运行 suite 见日志；后置 guides:test 因命令短路未在此入口执行，已由 guides:verify 单独执行 |
| 主动 LSP                         | 两批共 36 个文件，零诊断；覆盖新脚本、测试、配置和相关文档                                                                                   |
| git diff --check                 | 退出 0                                                                                                                                       |

本机默认 Python 3.9 不满足要求；质量运行显式在 PATH 首位使用已有 `/opt/miniconda3/bin` 的 Python 3.12.3，未更改依赖文件。实际 Node 为 26.8.1，不能据此声称已在推荐 Node 24 上验证。Nx 禁用缓存，但 Gradle 仍有 UP-TO-DATE；日志保留现有 Nx Spotless 依赖推断及 npm 用户配置警告。

首轮模板结构测试有一项文字匹配错误，已修正断言为协议实际使用的等价来源表达，并通过完整 suite 复验；未削弱业务预期。可选 Python ruff 格式命令因环境未安装 ruff 未执行成功，没有为此安装全局工具；Python 主动诊断与实际回归已通过。

## 未解决的全量验证阻塞

`evidence-api-design/tests/test_full_lifecycle_example.py` 的 `test_product_procurement_lifecycle_is_valid_and_complete` 在第 55 行比较已存示例与渲染 OpenAPI 文本失败，报告包含单/双引号差异。不能仅凭该片段宣称完整差异都只有格式。

已用 `git archive HEAD .agents/skills` 在临时目录提取未包含本次改动的基线，并在相同 Python 环境独立复跑该测试，得到同一失败位置和差异摘要。基线为 `b7d079e33756347a41b4f93c3894478e35b54859`，见 [baseline-results.json](baseline-results.json)及 [基线日志](baseline-api-example.log)。这是本环境可复现的已有失败；本轮不修改该示例、生成器或测试以制造通过。

因此本次前馈变更已落盘、相关回归通过，但项目全量质量验收尚未通过，不能宣称整体完成。后续需单独定位 API 示例文本与渲染器/依赖的一致性问题，再复跑 npm test。

## 检查保证范围

Guides 检查只覆盖显式维护文档的本地内联链接文件路径、指定过期架构表述和格式；不证明外部链接、标题锚点、业务语义、任务就绪或生产安全。模板测试验证协议结构，不代替独立 Agent 行为评估。本轮未执行新增评估用例、浏览器联调或业务人工批准。
