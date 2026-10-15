# Skills 测试与维护

`.agents/skills/` 是方法、运行资源及各自测试的唯一维护源。按被测职责维护，不保留集中副本。本目录检查组合入口、跨 Skill 包契约、文档协作和纯 Skill 路径；需要完整仓库，不是独立专业包的运行依赖。

## 当前覆盖与拥有者

| 位置                                                        | 检查职责                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| `test_skill_packages.py`                                    | 包完整性、链接闭合及规范名称空间                                           |
| `test_skill_documentation.py`                               | 业务入口加载边界、日常领域语言消费及跨包文档协作                           |
| `test_source_relevance.py`、`test_incremental_interview.py` | 来源相关性门槛、增量读取与恢复的静态契约                                   |
| `test_evidence_trace_workflow.py`                           | 判断—数据—凭证—深入—返回的流程图、自然追溯展示、责任与控制边界及旧模板清除 |
| `test_fm_integration.py`、`test_combined_review.py`         | 委派与聚合命令、真实双源投影、失败不发布及输入不变性                       |
| FM／API 的 `tests/`                                         | 引擎、Schema、CEL、lineage、模拟与 API 的程序回归                          |
| FM／API／Visualization 的 `tests/portability/`              | 独立安装及运行，不依赖仓库布局或维护材料                                   |
| Planning／Delivery 的 `tests/`                              | 编译与投影、状态、依赖、文件绑定、只读任务选择及执行协议                   |

凭证追溯按当前履约判断所需的数据和来源组织，程序回归检查深入与返回的流程分支及轻量展示，不锁定样例题数、退款业务或分析栏目。履约入口的程序回归检查流程图的分支与终止点，不证明真实访谈行为。责任结束与正常／争议业务推演另行验证，不随表达重构删除。

## 方法与维护材料的边界

业务入口只加载当前分支所需的方法、模板、Schema 和脚本。tests/ 仅在维护或明确测试时使用，不把合成输入当项目事实。

Discovery 维护普通对话、当前节点、问题组、控制意图及当轮模型语言核对；跨会话承接提供的理解与材料。显式要求记录过程时使用 Handoff，不维护自动访谈快照或第二份问题记录。FM 维护专业判断与正式表达；有业务依据及编辑授权即渐进保存，凭证与责任角色共同落地；范围结束及下游交付再核对完整责任与人类确认。独立 API 维护技术契约与投影，复用 FM 的有效检查。Modeling 分派这些拥有者，完整生成依次取得 FM、API 和联合审核，不替专业包执行第二套规则。

## 自动验证

使用满足相关 requirements.txt 的 Python 3.10+ 环境，在仓库根执行：

```bash
npm run skills:verify
# 使用实际 Python 解释器运行相同聚合入口
python3 .agents/skills/evidence-modeling/tests/run_skill_tests.py
# 只运行组合及跨包契约
python3 -B -m unittest discover -s .agents/skills/evidence-modeling/tests -v
```

聚合入口发现各包的 `tests/` 及 `tests/portability/`，逐套件用独立子进程隔离同名模块，任何失败返回非零。安装测试子目录不设 `__init__.py`，由聚合入口显式运行，不能漏跑。

独立安装检查复制完整包到无仓库依赖的含空格路径，运行包内测试及真实检查；移除 tests/ 后再次核对运行能力，确保维护材料不是运行依赖。源文件前后摘要用于检查输入不变性。

程序回归和文档结构不证明 Agent 访谈、生成、路由或执行质量，不代表人工批准。实际执行与未执行分别报告；历史失败日志和业务证据不在测试清理中删除。
