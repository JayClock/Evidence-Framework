# Skills 测试与维护

`.agents/skills/` 是方法、运行资源及各自测试／评测的唯一维护源。测试和评测按被测职责放回对应 Skill，不保留集中副本。本目录只维护组合入口、跨 Skill 包契约、文档协作及可选宿主集成检查；这些检查需要完整仓库，不是独立 FM／可视化包的运行依赖。

## 目录职责

| 位置                                                                 | 内容                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `.agents/skills/evidence-modeling/evals/`                            | 显式组合入口、全局追责结束准入、无 UI 与只读校验边界                            |
| `.agents/skills/evidence-discovery/evals/`                           | 通用与组合访谈、领域语言沉淀、更正／写入失败及只读边界                          |
| `.agents/skills/evidence-fm/tests/`                                  | FM 引擎、Schema、CEL、lineage、模拟与评分器的回归及夹具                         |
| `.agents/skills/evidence-fm/evals/`                                  | 20 个 FM 技术案例及合成准入来源；behavior.json 检查阻塞与满足门槛后的编辑       |
| `.agents/skills/evidence-requirements/evals/`                        | 外部材料直达需求的行为案例（原 ID 5）                                           |
| `test_skill_packages.py`                                             | 跨 Skill 包完整性、链接闭合及评测目录覆盖                                       |
| `test_skill_documentation.py`                                        | 业务入口加载边界及跨包文档协作                                                  |
| `test_contract_first_workflow.py`                                    | 合同—骨架—凭证—异常的顺序、发现记录 2.0 单一引用结构及行为案例覆盖              |
| `test_responsibility_closure.py`                                     | 递归追责、人类终点与全局结束、全部编辑入口及记录引用的静态契约                  |
| `test_fm_integration.py`                                             | 组合流程、可选宿主接入及聚合命令覆盖                                            |
| `test_combined_review.py`                                            | FM → API → 联合审核的编排契约、真实双源投影、缺 API／两源无效时保留已有页和输入 |
| `.agents/skills/evidence-fm/tests/portability/`                      | FM 独立安装、真实只读检查及包内回归                                             |
| `.agents/skills/evidence-visualization/tests/portability/`           | 可视化独立安装及生成验证                                                        |
| `.agents/skills/evidence-api-design/tests/test_api_documentation.py` | API 专属文档契约                                                                |
| `.agents/skills/evidence-task-planning/tests/`                       | 工作单元提取、切片、任务身份和 DAG 校验                                         |
| `.agents/skills/evidence-delivery/tests/`                            | 任务状态、依赖、文件绑定和只读任务选择                                          |

业务输入、原有案例 ID、FM 评分预期及测试夹具保留。独立行为案例中的特定宿主名称改为通用工具约束，含义不变。FM 生成案例与独立行为案例是不同编号空间，不合并评分。

## 方法与维护材料的边界

业务入口只指向必要方法、模板、Schema 与运行脚本；tests/ 和 evals/ 保留在各自包内，但仅在开发验证或明确评测时加载。维护指南可以链接业务材料，业务方法不反向加载测试指南，避免把合成夹具当成项目事实。

Discovery 的 interview 负责访谈机制、来源优先保存、当前对象引用与每轮术语沉淀的调用顺序，发现记录只使用当前 2.0 模板，不提供自动转换。FM 统一维护 domain-language、business-analysis、provenance、scenario-validation 专业方法及模型／场景生成；合同主线先骨架再追溯，异常新义务重复同一循环，input-review 只消费材料并返回具体缺口，不执行访谈。

Discovery 单独安装可做通用访谈，专业 FM 判断通过资源发现或用户提供的路径只读获取 FM 准则；不引入跨包相对链接、符号链接或同步副本。FM 独立安装仍须核对人类追责结束依据；无访谈包且门槛未满足时只返回缺口，不以局部职责充分放行。用户显式调用 `evidence-modeling` 时按分支组合知识；生成分支一次触发 FM、API Design 与 Visualization，联合审核必须包含当前 API；缺必需资源在编辑前停止并报告资源限制；访谈当轮加载 FM 的领域语言方法沉淀明确术语，不启动模型 JSON 生成。可选宿主适配器只提供意图入口和问答，模型差异通过普通对话展示，不是完整性前提。结构与逐字检查不能证明语义完整，组合和独立场景需分别人工评价。

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

宿主适配器自己的测试和使用说明由宿主侧维护，不随本包定义工具映射。修改任务规划或交付规则时复跑对应 Skill 的测试。资源加载测试应在不提供任何界面适配器时仍能发现并显式调用组合入口；适配器单向依赖 Skill，不复制或反向维护。`test_ui_separation.py` 检查运行文档没有宿主工具、路径或命令依赖；它不证明实际多轮访谈质量。

## 人工行为评测

读取本包的[组合入口评测](../evals/evals.json)，以及各自安装位置中 `evidence-discovery/evals/README.md`、`evidence-fm/evals/README.md`、`evidence-requirements/evals/README.md` 的操作说明。独立会话中使用同一模型与输入比较有／无 Skill 或新旧版本，不共享答案；保存原始对话、文件变化和逐项原文依据。真人补充事实，Agent 不自答。

独立行为案例 3、4、5 检查精简交接、保留唯一依据与验证版本；案例 2 加载 FM 方法沉淀术语；案例 8、9 分别检查缺少 FM 知识与缺少访谈包的边界；案例 10–14 检查首轮术语、更正、歧义、两处写入失败恢复和只聊不落盘。组合案例两组提供相同专业知识版本，避免混淆知识与访谈机制效果。FM 技术案例的正向生成输入附有明确标为合成的范围、责任图、终点及人类结束原话，须核对对应案例且不能覆盖真实遗漏。案例 13 未闭合时只返回缺口，不生成局部模型；行为案例另检验深层异常、停止不等于结束、单条终点不等于全局确认及新分支使确认失效。只更新案例说明不等于已完成行为评测。

Discovery 案例 30–34 检查合同参数归位、先骨架后追溯、异常复用、多约定引用恢复及版本不匹配时保留文件。静态顺序和模板结构检查不证明待评 Agent 已执行这些动作；新旧 Skill 对比使用相同来源，保留原始交互与文件差异。

组合案例 13–17 覆盖一体生成、API 业务缺口阻塞、联合只读、更窄仅 FM 授权和缺资源时先停；静态契约和真实投影测试不证明 Agent 已正确执行编排。行为评测在独立会话、隔离的临时项目中执行，不改真实业务文件或审核状态。

自动测试不调用语言模型，输入准备不代表生成评测通过。未执行的行为案例保持未执行；机器结果不等于访谈质量、语义完整、具名审核或 UAT。
