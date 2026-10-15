# Evidence Skills

本仓库的 Evidence Skills 统一放在 `.agents/skills/`，使用 `evidence-<职责>` 命名，目录名与 frontmatter `name` 一致。项目行动从 [宪法](../../AGENTS.md)和 [Guides 导航](../../docs/guides/index.md)进入：宪法、项目基线、工程指南、当前任务按需加载。

Skill 保存可移植方法，项目文档保存实际范围与工程决定；不在两者复制业务知识或状态。编排入口按意图选择分支，专业方法由对应拥有者唯一维护；引用写明何时读取，每一步以可观察的退出条件收束。交付采用外层 PDCA、内层 Guides → Action → Sensors → Steer。Guides 在开始、恢复、纠偏和来源变化时重新核对，不只是会话开头的一段提示词。

| Skill                                                     | 用途               | 输入与输出                                                                                     | 运行依赖                                                                    |
| --------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [evidence-modeling](evidence-modeling/SKILL.md)           | 显式一体建模入口   | 目标／已有记录 → 讨论或访谈；FM 渐进维护；范围结束后完整性检查 → 范围 API → 联合审核 → Handoff | 生成需 FM、API、Visualization；访谈需 Discovery 和 FM，自动交接还需 Handoff |
| [evidence-discovery](evidence-discovery/SKILL.md)         | 访谈与澄清         | 经营材料 → 混合上下文导航、合同履约／领域／协商分析、人类分支结束依据、模型语言                | 通用访谈只需对话；FM 专业判断需读取 FM 参考                                 |
| [evidence-handoff](evidence-handoff/SKILL.md)             | 建模过程交接       | 显式请求或分支结束自动交接 → Markdown 进展、未澄清上下文、决定及下一轮建议                     | 当前会话上下文与文件写入权限                                                |
| [evidence-fm](evidence-fm/SKILL.md)                       | 建模准则与正式产物 | 业务依据与编辑授权 → 渐进 FM、场景与一致性；范围结束 → 完整性结果                              | 读取准则只需文本；执行校验需 Python 3.10+                                   |
| [evidence-api](evidence-api/SKILL.md)                     | 独立 API 设计      | 整体 FM 与有效检查 → API 契约、OpenAPI、静态消费者流程与投影                                   | Python 3.10+、可定位的 FM Skill；两包无需相邻                               |
| [evidence-visualization](evidence-visualization/SKILL.md) | 离线可视化审核     | 当前 FM／已有 API → 对象树、业务详情、场景判断与双向引用；不携带来源信息                       | Python、FM Skill；有 API 时另需 API Skill；浏览器回归需 Node.js 与 Chrome   |
| [evidence-requirements](evidence-requirements/SKILL.md)   | 收敛软件职责       | 充分材料或 FM → 范围、MVP、故事与验收                                                          | 对话与文本文件                                                              |
| [evidence-task-planning](evidence-task-planning/SKILL.md) | 通用 FM 实施任务   | 任意 FM／可选 API → 模块化单体、业务模块边界、MyBatis XML 与 Jersey 子资源的可读任务计划       | Python 3.10+、PyYAML；不执行产品实现                                        |
| [evidence-delivery](evidence-delivery/SKILL.md)           | 单任务交付         | 任务 DAG → 小步实现／复验、故障诊断、Standards / Spec 审查与真实证据                           | Python 3.10+、PyYAML、项目工具链                                            |

## 安装

本仓库统一在 `.agents/skills/` 本地维护。支持该目录自动发现的宿主可直接加载，无需在本项目重复安装。需要安装到其他位置时，在仓库根目录执行：

```bash
npx skills@latest add ./.agents/skills --skill evidence-discovery
```

完整一体流程使用 `evidence-modeling`，同时提供 `evidence-fm`、`evidence-api`、`evidence-visualization`，访谈还需 `evidence-discovery`，合同级自动交接还需 `evidence-handoff`。仅访谈或明确仅 FM 时只加载对应分支依赖；也可独立安装单项或 `evidence-requirements`。保留生成器、assets 和浏览器测试，不需要向业务项目复制工具。安装器需要 Node.js 和网络；根据提示选择目标 Agent 与安装位置。

也可以把某个完整目录复制到宿主支持的位置，如目标项目的 `.agents/skills/evidence-discovery/`。保留 references，以及 FM／API 包各自的 scripts、schemas、requirements.txt；不能只复制 SKILL.md。已有同名目录时先比较和备份，不直接覆盖，也不要同时加载两个同名版本。

使用宿主原生 Skill 入口，或让 Agent 读取安装目录里的 SKILL.md。Discovery 单独安装可做通用访谈；模型语言与专业 FM 判断通过已安装的 FM 包或用户提供的路径获取方法，不假设兄弟目录。独立访谈直接读取相关 Entity 及其属性的名称与定义，尚无模型时承接实际材料，不自动启动模型 JSON 生成；来自 Modeling 的获授权合同或领域／协商结束信号交回入口，按其协议接续建模与交接。缺少准则时说明资源限制，不能宣称完整专业审查。

FM 单独安装按业务依据及编辑授权渐进维护唯一模型，直接识别双方主要请求—确认交互并配对包裹为履约项，不先列责任清单或保存空履约；每批检查一致性；范围结束和下游交付再核对完整责任及人类确认，独立调用只交付 FM；API 设计使用独立的 `evidence-api`，完整接续由 Modeling 编排；未闭合时保留已知保存与具体缺口，不复制访谈机制或交付受影响下游。Requirements 仍可直接使用充分的外部材料。无需为了独立使用而在两个包中保留同一套建模知识。

## 使用示例

`evidence-modeling` 设置为仅用户显式调用；支持的宿主可使用 `/skill:evidence-modeling <目标>`。它只负责编排，通过资源发现或用户提供的路径定位专业 Skill，不假设兄弟目录。建模只使用 Skill，普通对话是完整交互路径；Discovery 唯一维护混合上下文选择、当前节点的依赖前沿、成组问答与控制意图。

```text
用 evidence-discovery 访谈并沿用模型语言：客户手机号不是唯一身份，导入时经常误合。
今天先停止问答，只整理已有信息。
/skill:evidence-handoff 记录建模过程，下一轮继续退款完成证明。
继续讨论，但先保留之前暂缓的期限问题。
用 evidence-fm 按已知业务增量维护当前模型并检查一致性，未知不补造。
用 evidence-api 基于当前完整 FM 和有效检查设计整体 API，生成 OpenAPI；保持 FM 只读。
/skill:evidence-modeling 核对人类追责结束依据后修改模型与 API，校验并生成联合审核页。
/skill:evidence-modeling 只修改 FM，不设计 API，不生成审核页。
/skill:evidence-modeling 只校验当前 FM 与 API，不写任何项目文件。
用 evidence-requirements 收敛这份说明的软件范围，不需要先建 FM。
用 evidence-visualization 为当前 FM 和已有 API 生成离线审核页，不修改模型。
用 evidence-task-planning 根据 .evidence/fm/ 生成模块化单体 + MyBatis 的 plan.yaml 和 review.html；有 API 时一并读取。明确业务模块公开接口、数据所有权和本地事务，通过程序计算工作单元、taskKey 和覆盖，不修改模型和业务代码。
```

业务分析只在 [FM 方法](evidence-fm/references/business-analysis.md)维护，渐进编辑与范围交付分别核对 [最小保存单元与范围结束](evidence-fm/references/responsibility-closure.md)。Discovery 管一轮交互，FM 管专业判断与正式表达，Modeling 管授权和阶段接续，不在每层复述分析过程。

先选择 Skill，再按 Guides / Action / Sensors / Steer 执行：加载当前分支来源，完成授权动作，核对实际证据，修正或停止。独立调用不扩大权限；显式一体生成依次完成 FM、整体 API 和联合审核。入口建模访谈默认随已知业务增量维护 FM，不因普通回答自动生成 API；有效单合同或独立领域／协商分支结束确认后检查范围完整性并接续下游与 Handoff，相关未澄清合同使用 Context Role；必要证明缺口仍阻塞当前合同，具体接续见 [文件交接](evidence-modeling/references/workflow.md)。只聊不落盘、只校验及仅 FM 等限制优先。保存、一致性、范围完整性、模拟、人类确认与业务批准互不替代，不自动进入需求、规划或开发。

## 文件交接

`evidence-modeling`、`evidence-discovery`、`evidence-fm`、`evidence-api` 和 `evidence-visualization` 的新产物默认统一放在项目根的 `.evidence/`。沿用已有文件与用户显式指定位置，不自动迁移；告知默认路径并按需创建：

```text
.evidence/
├── handoffs/             # 显式请求或分支结束自动保存的建模过程 Markdown 交接
├── fm/                   # 当前模型、说明、validation 与 generated
├── views/index.html      # 一体生成或单独要求时更新的联合只读审核页
├── api/
│   ├── api.json          # 唯一 API 设计源，位于 FM 根之外
│   └── generated/        # 当前投影、OpenAPI、样例、流程与 manifest；Git 管理历史
└── checks/
    ├── fm/               # 按需授权保存的 FM 检查记录
    └── api/              # 按需授权保存的 API 检查记录
```

FM 与 API 为独立 Skill，由 Modeling 按授权接续；API 阶段复用同一次 FM 检查结果并核对摘要，不再跑 FM 检查，保留 API 自身契约与覆盖校验。各 Skill 只修改本次授权的文件，不自动批准。`evidence-requirements` 默认使用 `docs/requirements/scope.md` 和 `docs/requirements/stories.md`。`evidence-task-planning` 默认输出 `docs/plans/smart-domain/plan.yaml` 和 `review.html`：YAML 是机器可读的唯一计划记录，保存显式切片、编译 DAG/API 覆盖、任务 Guides/设计、状态、CHECK、证据与缺口；HTML 是可重建的离线只读审核投影。任务标题不参与 taskKey 或排序。实体和规则从任意 FM 提取，不包含项目专用案例。`evidence-delivery` 消费同一 `plan.yaml`，执行前核对授权/范围、业务与工程来源、前置新鲜度、设计边界、环境、CHECK 与退出条件。`next` 只提供结构候选，不证明语义就绪；FM/API 摘要不覆盖架构、规范、howto 或代码变化。真实结果写入任务 `observedEvidence`，状态只在同一任务的 `status` 维护，不从审核页反向更新。任务支持 implementation、verify、design、setup、manual。

已有业务目录和案例沿用原路径，不自动迁移或删除。Entity 及其属性即统一语言：名称和定义直接维护在模型的 `label/notes` 与属性的 `label/meaning`，其他阶段只引用，不另设术语表或定义索引。尚未建模的共同理解用于继续澄清，不为保存名称创建占位 Entity；新增或更正按业务依据、最小保存单元与编辑权限执行，不等全部澄清结束。

访谈围绕当前履约判断开展凭证追溯：沿必要关键数据找来源，直接来源不足再深入，取得依据后返回原判断。用简短故事说明证明关系，不用操作流程或字段问卷代替。主动寻找全部可同时澄清的独立问题，共同前提与其他独立问题同轮提出；只有用户要求逐问或查找后确实只有一个可问项时才单问。跨会话承接提供的焦点、原问题、各题已答／未答／暂缓情况及控制意图。人类结束确认覆盖范围、完整责任图、终点与实际推演；关键上下文不足时说明限制。未获模型编辑权限时只交接概念的待改影响，不把讨论表述成定义已保存。

## 独立 FM 校验

只做发现或需求不必安装 Python 包。以下是 POSIX 示例；变量须设为实际绝对路径，Windows 使用 venv 的 `Scripts/python.exe`：

```bash
SKILL_DIR="/absolute/path/to/project/.agents/skills/evidence-fm"
VENV_DIR="/absolute/path/to/new/fm-venv"
MODEL_DIR="/absolute/path/to/your/model"

python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/python" -m pip install -r "$SKILL_DIR/requirements.txt"
"$VENV_DIR/bin/python" "$SKILL_DIR/scripts/check_fm.py" "$MODEL_DIR"
```

环境路径选未使用的位置，或复用已经满足依赖的环境，不需要全局 pip 安装。检查在本地执行，不上传业务材料。

`check_fm.py` 不写模型，输出 JSON，失败退出非零：

- 没有 validation 套件的纯领域模型可以通过，`simulationPassed: null`。
- 声明了但为空／损坏的套件会失败，不当作不适用。
- 有适用场景时实际执行并比较既有预期，不能倒改预期取得成功。
- 机器结果不提升也不推断业务确认。

可对 [测试夹具](evidence-fm/tests/fixtures/README.md) 直接只读检查。需要修改或生成输出时，先复制到用户允许的工作目录；不要把夹具中的金额、时长和角色当作业务默认值。

更多模型规则和命令见 [FM 指南](evidence-fm/references/README.md)。

## 测试与维护

各 Skill 的程序回归与自身方法一起维护。FM 包含[功能回归](evidence-fm/tests/README.md)与夹具，可独立运行；API 的[功能回归](evidence-api/tests/README.md)通过显式路径消费已安装 FM 包。组合入口、跨包契约和聚合命令见 [Skills 测试说明](evidence-modeling/tests/README.md)。

测试目录只在开发验证时按需使用，不是普通业务任务的必读材料。程序回归和文档结构不证明 Agent 的实际访谈、设计、路由或执行质量，也不代表人工批准。
