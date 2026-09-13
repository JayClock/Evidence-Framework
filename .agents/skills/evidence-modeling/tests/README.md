# Skills 测试与维护

`.agents/skills/` 是方法、运行资源及各自测试／评测的唯一维护源。测试和评测按被测职责放回对应 Skill，不保留集中副本。本目录只维护组合入口、跨 Skill 包契约、文档协作及可选宿主集成检查；这些检查需要完整仓库，不是独立 FM／可视化包的运行依赖。

## 目录职责

| 位置                                                                 | 内容                                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `.agents/skills/evidence-modeling/evals/`                            | 显式组合入口、无 UI、直接编辑授权和跨宿主校验行为                    |
| `.agents/skills/evidence-discovery/evals/`                           | 通用与组合访谈、停止／恢复、来源冲突及知识包缺失（ID 1、2、3、6、8） |
| `.agents/skills/evidence-fm/tests/`                                  | FM 引擎、Schema、CEL、lineage、模拟与评分器的回归及夹具              |
| `.agents/skills/evidence-fm/evals/`                                  | 20 个完整 FM 案例、夹具、评测器；behavior.json 包含行为案例 4、9     |
| `.agents/skills/evidence-requirements/evals/`                        | 外部材料直达需求的行为案例（原 ID 5）                                |
| `test_skill_packages.py`                                             | 跨 Skill 包完整性、链接闭合及评测目录覆盖                            |
| `test_skill_documentation.py`                                        | 业务入口加载边界及跨包文档协作                                       |
| `test_fm_integration.py`                                             | 组合流程、可选宿主接入及聚合命令覆盖                                 |
| `.agents/skills/evidence-fm/tests/portability/`                      | FM 独立安装、真实只读检查及包内回归                                  |
| `.agents/skills/evidence-visualization/tests/portability/`           | 可视化独立安装及生成验证                                             |
| `.agents/skills/evidence-api-design/tests/test_api_documentation.py` | API 专属文档契约                                                     |
| `.agents/skills/evidence-task-planning/tests/`                       | 工作单元提取、切片、任务身份和 DAG 校验                              |
| `.agents/skills/evidence-delivery/tests/`                            | 任务状态、依赖、文件绑定和只读任务选择                               |

业务输入、原有案例 ID、FM 评分预期及测试夹具保留。独立行为案例中的特定宿主名称改为通用工具约束，含义不变。FM 生成案例与独立行为案例是不同编号空间，不合并评分。

## 方法与维护材料的边界

业务入口只指向必要方法、模板、Schema 与运行脚本；tests/ 和 evals/ 保留在各自包内，但仅在开发验证或明确评测时加载。维护指南可以链接业务材料，业务方法不反向加载测试指南，避免把合成夹具当成项目事实。

Discovery 的 interview 只负责访谈机制与记录。FM 统一维护 business-analysis、provenance、scenario-validation 专业知识，以及正式术语／模型／场景的生成；input-review 只消费材料并返回具体缺口，不执行访谈。

Discovery 单独安装可做通用访谈，专业 FM 判断通过资源发现或用户提供的路径只读获取 FM 准则；不引入跨包相对链接、符号链接或同步副本。FM 可独立消费充分材料，无访谈包时返回缺口即可。用户显式调用 `evidence-modeling` 时组合两包知识，缺必需资源只报告资源限制；正式统一语言与 FM 均加载 FM 入口，发现阶段不加载生成流程。可选 Pi 适配器只提供意图入口和问答，模型差异通过普通对话展示，不是完整性前提。结构与逐字检查不能证明语义完整，组合和独立场景需分别人工评价。

保留评测输入、判断标准与必要执行证据；不把每次通过的流水账、完整控制台输出或可重建结果写进维护指南。实际评测证据放入指定工作目录，汇总引用其模型／Skill 版本与运行标识，未执行的保持未执行。

## 自动验证

先使用满足 `.agents/skills/evidence-fm/requirements.txt` 的 Python 3.10+ 环境，在仓库根目录执行：

```bash
npm run skills:verify
# 或使用实际 Python 解释器运行同一聚合入口
python3 .agents/skills/evidence-modeling/tests/run_skill_tests.py
# 只运行组合检查
python3 -m unittest discover -s .agents/skills/evidence-modeling/tests -v
```

聚合入口自动发现各 Skill 的 `tests/` 及 `tests/portability/`，逐套件使用独立子进程，任何失败都返回非零，避免同名测试模块串包。安装测试子目录不设 `__init__.py`：复制后的包内顶层回归不会递归执行安装测试；聚合入口显式运行安装测试，不能因此漏跑。业务入口不加载测试或评测材料。

独立安装检查把整个 FM 包复制到无仓库依赖的含空格路径，实际运行包内回归与评测输入准备，并核对源文件未改写。还会移除复制包中的 tests/、evals/，验证纯领域检查与付款模拟不依赖维护材料；文档检查从各 SKILL.md 沿相对链接检查包内闭合及加载边界。也覆盖坏 YAML、时间缺失、错误预期、空套件、实际模拟和确定性编译；不能为迁移削弱业务预期。

修改 Pi 接入时另运行 `npm run evidence-modeling:verify`；修改任务规划或交付规则时复跑对应 Skill 的测试。资源加载测试应在禁用 FM 适配器时仍能发现并显式调用组合入口。Pi 受信任项目原生发现 `.agents/skills/`，只单向使用，不复制或反向维护。

## 人工行为评测

读取本包的[组合入口评测](../evals/evals.json)，以及各自安装位置中 `evidence-discovery/evals/README.md`、`evidence-fm/evals/README.md`、`evidence-requirements/evals/README.md` 的操作说明。独立会话中使用同一模型与输入比较有／无 Skill 或新旧版本，不共享答案；保存原始对话、文件变化和逐项原文依据。真人补充事实，Agent 不自答。

独立行为案例 3、4、5 检查精简交接、保留唯一依据与验证版本；案例 2 只读加载 FM 知识，案例 8、9 分别检查缺少 FM 知识与缺少访谈包的边界。组合案例两组提供相同专业知识版本，避免混淆知识与访谈机制效果。完整生成案例 13 保留五类结算事实缺口与 draft／pending 要求，改为返回缺口而非执行访谈。只更新案例说明不等于已完成行为评测。

在隔离的临时项目中执行行为评测，不改真实业务文件或审核状态。

自动测试不调用语言模型，输入准备不代表生成评测通过。未执行的行为案例保持未执行；机器结果不等于访谈质量、语义完整、具名审核或 UAT。
