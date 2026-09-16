# 检查、覆盖与真实证据

## 项目质量入口

以下命令均在仓库根执行。声明命令不是执行结果；运行前核对 [package.json](../../package.json)、根 Gradle 配置和当前环境。

| 命令                               | 实际覆盖                                                                             | 不证明什么                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `npm run guides:verify`            | 前馈检查器回归、维护范围内 Markdown 本地内联链接与过期架构表述检查、前馈相关文件格式 | 不检查外部 URL 可达性、标题锚点或业务语义；不证明任务就绪 |
| `npm test`                         | Nx 应用/库 test、建模扩展测试、Skills 回归、Guides 检查器回归                        | 具体 suite/缓存及环境以输出为准，不证明生产环境           |
| `npm run lint`                     | 前端 ESLint 与前馈文档检查                                                           | 不检查 Java 格式或业务授权                                |
| `npm run build`                    | Nx build 与建模扩展 TypeScript 检查                                                  | 打包成功不等于运行验收                                    |
| `./gradlew check`                  | Java 测试、Spotless 及模块已配置检查                                                 | 不证明生产数据库、真实支付机构或业务批准                  |
| `npm run evidence-modeling:verify` | 建模扩展类型、测试及其配置的格式范围                                                 | 不替代产品 HTTP/SQL 检查                                  |

`guides:verify` 由 [检查器](../../tools/guides/check.mjs)定义扫描范围：项目宪法/README、docs、后端切片 README、业务/API 导航、Skills 索引及 planning/delivery 的正文、参考与模板。生成产物、业务源 YAML、历史证据和第三方材料不重写为前馈。代码块中的示例路径、模板变量、远程链接不作为实际本地文件链接检查。检查器仅验证文件路径，不是完整 Markdown 解析器。

## 按任务选择检查

先按[测试工序](procedures.md)从业务变化确定测试边界、任务粒度和退出条件，再从下表选择命令并落实到具体 CHECK。工序不等于技术层清单；每个场景不必生成所有层的任务，领域、独立 HTTP、SQL 与真实装配证据不能互相冒充。

| 层 / 工作  | 命令                                                                                | 关键依赖与预期                                                                 |
| ---------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| domain     | `./gradlew :backend-domain:test`                                                    | 纯领域行为与固定边界；不证明 HTTP/SQL                                          |
| api        | `./gradlew :backend-api:test`                                                       | 真实随机端口 HTTP + mock 领域；不需要数据库，不 mock 被测 Resource/分页/序列化 |
| persistent | `./gradlew :backend-persistent:test`                                                | 真实 H2/MyBatis/XML/Flyway、行数与事务回滚                                     |
| app        | `./gradlew :backend:test`                                                           | 真实 HTTP + SQL、配置、profile 隔离及架构检查                                  |
| frontend   | `npx nx test @evidence-poc/frontend`                                                | Vitest/jsdom/Testing Library；真实浏览器另行检查                               |
| planning   | `python3 -B -m unittest discover -s .agents/skills/evidence-task-planning/tests -v` | 确定性身份、切片、依赖、覆盖、工序分支/汇合与前馈模板契约                      |
| delivery   | `python3 -B -m unittest discover -s .agents/skills/evidence-delivery/tests -v`      | 只读状态检查及执行/恢复前馈协议                                                |
| Guides     | `npm run guides:test`                                                               | 本地链接检查器的正常、缺失、模板、扫描范围、只读回归与项目工序路由/说明结构    |

工序路由/说明结构与模板回归只检查文档契约，合成切片测试只证明显式映射的编译行为；它们不证明 Agent 自动选对工序。业务适用性与例外按[工序维护检查](procedures.md#工序维护的检查与退出)人工复核。

## CHECK 的最低证据

每个任务 CHECK 明确目的、被测行为、真实依赖/Fake、固定输入与业务时间、正常/边界/反例、失败不变性、测试文件、cwd、精确命令、环境准备与完成条件。命令未知填 null 并关联局部 gap，不写“运行相关测试”冒充可执行。

实际执行后记录：

- 命令、cwd、工具/环境与运行标识；必要时记录源摘要及工作树差异。
- 退出码、真实输出或日志路径、断言覆盖与未执行项。
- Nx/Gradle 的缓存命中、UP-TO-DATE、实际执行分别说明。需要复验时使用 `npx nx ... --skip-nx-cache` 或 `./gradlew ... --rerun-tasks`，不能把缓存描述为新运行。
- 环境失败与实现失败区分；历史检查只有输入、环境和依赖仍有效时才能作为有限的前置证据。

任务结果和状态都写入唯一 `plan.yaml`：`tasks[taskKey].observedEvidence` 记录真实观察，`tasks[taskKey].status` 记录状态；`review.html` 只是可重建审核投影。获授权的 `.evidence/checks/` 运行目录只保存紧凑运行清单（命令、退出码、环境、输入摘要、日志 `sha256` 与指针），不复制完整输出。Harness 文档维护没有业务 DAG 时可以保存独立检查记录，但不能制造业务任务 done 或审核通过。

## 反馈转向

代码错误留在当前任务修复；CHECK 不能证明业务预期则修检查设计；切片/依赖变化返回 Plan；业务事实或权限缺失返回来源拥有者；环境不可用则局部阻塞。修正后重装 [Guides](../guides/index.md)并重跑受影响检查。

自动检查不是最终裁判：链接可达不等于指南正确，结构覆盖不等于业务批准，测试成功不等于生产保证。不得删失败测试、改业务预期或手改机器报告制造通过。
