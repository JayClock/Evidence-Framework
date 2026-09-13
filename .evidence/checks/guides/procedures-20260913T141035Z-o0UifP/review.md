# 测试工序接入：本次交付与检查

## 授权、来源与范围

- 用户授权：讨论工序设计后要求“帮我实现一下”，随后授权“提交代码变更”。本次交付项目工序指南及其前馈连接与回归，不生成实际业务 plan。
- 工作根：`/Users/zhongjie/Downloads/Github/Evidence-Framework`；基线 HEAD：`fcd1760b117e0946e93d3481a3d29a529c83b975`。
- 本次来源：[宪法](../../../../AGENTS.md)、[Guides](../../../../docs/guides/index.md)、[范围](../../../../docs/requirements/scope.md)、架构三篇、工程规范、[测试指南](../../../../docs/engineering/testing.md)、[范例索引](../../../../docs/engineering/examples.md)、planning Skill 及其参考/模板。
- 开工边界：允许新增工序文档、修改其路由/规划说明/模板及相应测试，并保存本记录。没有业务 DAG，不建立业务 taskNotes 或新的工序状态。
- 保留开工时已有的 checks/results.json 改动、课程材料与 PDF 等未跟踪资料；未暂存、提交或回滚。`git diff --name-only -- .evidence/fm .evidence/api apps libs` 无输出。
- 非目标：FM/API 编辑、范围确认、生产数据库/身份/支付集成、业务产品代码及编译器 schema 扩展。

## 交付与局部设计

- 新增 [procedures.md](../../../../docs/engineering/procedures.md)：七类工序的触发/输入、粒度/产物、测试边界/退出、前置/转向，以及按现有字段生成任务的步骤和本地用户切片反向映射。
- 项目具体工序由 docs 维护；可移植 planning Skill 只维护选择与实例化方法，不内置本仓库业务路径。
- 索引模板区分工序选择与执行模式；详情模板要求工序实例说明，并复用既有 procedureRefs、steps、checks、completionCriteria。taskKey 算法与状态归属不变。
- 工序由 Agent 应用于具体场景，不是新增的自动工序推断；编译器仍只消费显式 slicing。
- 新增三个 planning 回归（两个文档契约、一个合成编译案例）与一个项目 Guides 契约回归，锁定七类说明结构、路由、模板接入、规则唯一归属、API/SQL 分支及验收汇合；不证明 Agent 的语义判断。

## 实际检查

提交前用 [preflight 记录](../commit-preflight-20260913T143233Z-yhtjina1/results.json)重跑：`NX_SKIP_NX_CACHE=true`、`NX_DAEMON=false`、Gradle `--rerun-tasks`，解释器 `/opt/miniconda3/bin/python3`（Python 3.12.3）。下表为最终工作树的测量结果。

| 检查 | 结果 | 证据及限制 |
| --- | --- | --- |
| `./gradlew check --rerun-tasks --no-daemon` | 退出 0；28 项全部实际执行，无 UP-TO-DATE | [java-check.log](../commit-preflight-20260913T143233Z-yhtjina1/java-check.log)；不证明生产数据库或业务批准 |
| `npm run guides:verify` | 退出 0；35 份文档、272 个本地链接、0 错误，格式通过 | [guides.log](../commit-preflight-20260913T143233Z-yhtjina1/guides.log)；不是业务语义验收 |
| planning unittest | 退出 0；40 项通过 | [planning.log](../commit-preflight-20260913T143233Z-yhtjina1/planning.log)；含本次新增 3 项 |
| delivery unittest | 退出 0；12 项通过 | [delivery.log](../commit-preflight-20260913T143233Z-yhtjina1/delivery.log) |
| `npm run lint` | 退出 0；跳过 Nx 缓存实际执行 | [lint.log](../commit-preflight-20260913T143233Z-yhtjina1/lint.log)；不检查 Java 格式 |
| `npm run build` | 退出 0；跳过 Nx 缓存实际执行 | [build.log](../commit-preflight-20260913T143233Z-yhtjina1/build.log)；打包成功不等于运行验收 |
| `npm test` | 退出 1；仅既有 API 示例快照测试失败，其余 suite 通过 | [test.log](../commit-preflight-20260913T143233Z-yhtjina1/test.log)；见下节 |

实现过程中的中间证据：[planning-before.log](planning-before.log) 与 [guides-before.log](guides-before.log) 记录新增测试先失败（缺少工序说明与路由），[planning-after.log](planning-after.log)、[delivery.log](delivery.log)、[guides-verify.log](guides-verify.log)、[gradle-check.log](gradle-check.log)、[gradle-check-rerun.log](gradle-check-rerun.log)、[npm-lint.log](npm-lint.log)、[npm-build.log](npm-build.log) 记录定向复验。默认 `python3`（系统 3.9.6）缺少 jsonschema/celpy，其失败记录见 [npm-test.log](npm-test.log)；这是环境阻塞，不冒充业务结论。

本次改动文件的主动 LSP 探测（10 个文件）为零诊断；为会话实探，非缓存推定。实际 Node 为 v26.8.1、npm 11.19.0，与本地指南建议的 Node 24 LTS 不同，未据此声称已在 Node 24 验证。

## 全量验收阻塞与基线复现

`npm test` 失败项为 `test_product_procurement_lifecycle_is_valid_and_complete`（`.agents/skills/evidence-api-design/tests/test_full_lifecycle_example.py:55`），比较示例 `openapi.yaml` 与渲染文本时出现包括引号形式在内的文本差异（与 preflight 记录同一断言、同一行号）。

为区分回归与既有问题，仅将 HEAD 的 evidence-api-design 与 evidence-fm 目录用 `git archive` 读到临时目录后复跑：

```bash
/opt/miniconda3/bin/python3.12 -B -m unittest discover \
  -s "$baseline/.agents/skills/evidence-api-design/tests" \
  -p test_full_lifecycle_example.py -v
```

结果退出 1，复现相同断言；基线来源与临时路径见 [baseline-location.log](baseline-location.log)，结果见 [baseline-api.log](baseline-api.log)。未修改示例、渲染器或失败测试，也没有删检查制造通过。该问题不在本次授权范围，需独立修复并复跑全量入口。

## 语义复核（Agent 静态评审，非独立模型评测）

| 试用输入 | 按工序得到的候选处理 | 复核依据 |
| --- | --- | --- |
| 同一拥有者、同一操作有正常/边界/反例 | 合并为一个领域任务并保留各场景 CHECK；适配任务依赖契约，不再次拥有规则 | 工序粒度规则；合成图书分支测试验证单元归属与依赖，不代替场景语义判断 |
| 只改变 HTTP 表示，不改变存储 | 生成或复验 HTTP 任务并按装配风险补回归；不因此新建 SQL 任务，也不把已有 SQL 标完成 | HTTP 触发条件、最小共享复用与真实装配边界 |
| 证明取得渠道未知、纯领域规则明确 | 对应接入保持缺口；纯领域工序不自动要求 SDK、RPC 或生产数据库 | 范围/质量属性与工序局部阻塞规则；业务授权仍需核对 |
| 后端能力存在但没有页面职责 | 不自动创建表单；如获授权做前端消费者，则消费已确定 HTTP 契约，不抢占后端 API 主交付单元 | 前端触发条件与 concern/单元映射说明 |

本地用户示范核对了 UserTests 的身份与快照行为、ApiTest 的随机端口与 mock 根集合、MyBatisUsersTests 的事务回滚；本次 Gradle 无缓存复跑提供本地 Java 证据。没有运行真实浏览器、真实支付机构或生成业务候选 plan，不作这些完成声明。

## 退出

本次改动已落地并通过相关定向检查与提交前检查；总体验收仍被可在 HEAD 复现的 API 示例快照失败阻塞，不能宣称项目质量检查全部通过。提交只包含本次改动，未包含开工前已存在的无关工作树改动。停止于本次交付，不自动执行下一个业务任务或提升审核状态。
