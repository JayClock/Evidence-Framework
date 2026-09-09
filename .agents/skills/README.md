# Evidence Skills

本仓库的 Evidence Skills 统一放在 `.agents/skills/`。业务技能从事实发现推进到正式建模和软件需求收敛；交付技能承接架构、计划、编码与审查阶段。

| Skill                                                   | 用途               | 输入与输出                                                                 | 运行依赖                                          |
| ------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------- | ------------------------------------------------- |
| [evidence-discovery](evidence-discovery/SKILL.md)       | 访谈与澄清         | 材料／具体缺口 → 原话、来源、工作理解、问题与控制状态                      | 通用访谈只需对话和文件；FM 专业判断需读取 FM 参考 |
| [evidence-fm](evidence-fm/SKILL.md)                     | 建模准则与正式产物 | 充分材料／访谈记录 → 正式术语、源 YAML、验证场景与实际结果；不足则返回缺口 | 读取准则只需文本；执行校验需 Python 3.10+         |
| [evidence-requirements](evidence-requirements/SKILL.md) | 收敛软件职责       | 充分材料或 FM → 范围、MVP、故事与验收                                      | 对话与文本文件                                    |
| [evidence-architecture](evidence-architecture/SKILL.md) | 架构与测试策略     | 批准的模型和需求 → 架构、接口、数据与测试契约                              | 项目仓库与 Evidence 工作流                        |
| [evidence-planning](evidence-planning/SKILL.md)         | Sprint 计划        | 批准的故事和架构 → Backlog、任务、检查与 DoD                               | 项目仓库与 Evidence 工作流                        |
| [evidence-tdd](evidence-tdd/SKILL.md)                   | TDD 实现           | 已批准任务 → Red-Green-Refactor 实现与验证证据                             | 项目工具链与 Evidence 工作流                      |
| [evidence-review](evidence-review/SKILL.md)             | 独立交付审查       | 工件、代码和验证记录 → 只读审查结论与风险                                  | 项目仓库与 Evidence 工作流                        |

## 安装

本仓库统一在 `.agents/skills/` 本地维护。支持该目录自动发现的宿主可直接加载，无需在本项目重复安装。需要安装到其他位置时，在仓库根目录执行：

```bash
npx skills@latest add ./.agents/skills --skill evidence-discovery
```

按需另选 `evidence-fm` 或 `evidence-requirements`，无需全部安装。安装器需要 Node.js 和网络；根据提示选择目标 Agent 与安装位置。

也可以把某个完整目录复制到宿主支持的位置，如目标项目的 `.agents/skills/evidence-discovery/`。保留 references、assets，以及 FM 包的 scripts、schemas、requirements.txt；不能只复制 SKILL.md。已有同名目录时先比较和备份，不直接覆盖，也不要同时加载两个同名版本。

使用宿主原生 Skill 入口，或让 Agent 读取安装目录里的 SKILL.md。Discovery 单独安装可做通用访谈；专业 FM 访谈通过已安装的 FM 包或用户提供的路径只读获取准则，不假设兄弟目录，也不自动启动模型生成。缺少准则时说明限制，不能宣称完整专业审查。

FM 单独安装可消费充分材料生成模型；输入不足时返回具体缺口，不复制访谈机制。Requirements 仍可直接使用充分的外部材料。无需为了独立使用而在两个包中保留同一套建模知识。

## 使用示例

```text
用 evidence-discovery 梳理业务：客户手机号不是唯一身份，导入时经常误合。
今天先停止问答，只整理已有信息。
继续讨论，但先保留之前暂缓的期限问题。
用 evidence-fm 根据这份材料生成本批次模型，保留未知责任。
用 evidence-requirements 收敛这份说明的软件范围，不需要先建 FM。
```

可以顺序组合，也可以从已有成果直接进入某一步：

```text
业务材料 → Discovery 访谈 ← 只读 FM 建模准则
                    ↓ 用户明确要求生成／更新
充分材料 ─────────→ FM 正式产物 → 软件需求
                    ↓ 必要业务依据仍缺失
                 返回具体缺口，由访谈承接
```

不自动串联三个 Skill。生成／更新正式 FM 是单独的用户意图；普通回答或“停止”不授权更新，模型更新也不自动进入需求或开发。

## 文件交接

优先采用项目已有布局，否则告知并按需创建：

```text
docs/
├── business/
│   ├── discovery.md       # 来源、原话、工作理解与恢复点
│   ├── questions.md       # 已提问题、回答、暂缓与解决依据
│   └── fm/                # 明确请求正式产物时由 FM 创建
│       ├── glossary.md    # 正式业务术语，不与访谈另维护同步副本
│       ├── model.yaml     # 源类型模型及其他 YAML 分片
│       └── validation/    # 正式验证场景与实例
└── requirements/
    ├── scope.md           # 软件职责与范围建议／决定
    └── stories.md         # 稳定 US／AC 与业务追溯
```

已有业务目录、词汇表和案例沿用原路径，不自动迁移或删除。工作术语、关系与讨论案例在访谈中只是材料，正式内容由对应任务消费来源形成。

跨会话读取文件恢复焦点、已知事实、暂缓及停止状态。没有文件写入权限时提供可复制的交接文本，并明确未保存。遵守项目已有权限与审核要求；普通文档不提供身份认证或不可篡改保证。

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
- 机器结果不提升 `modelStatus` 或 `stakeholderReview`。

可对 [合成示例](evidence-fm/assets/examples/README.md) 直接只读检查。需要修改或生成输出时，先复制到用户允许的工作目录；不要把示例金额、时长和角色当作业务默认值。

更多模型规则和命令见 [FM 指南](evidence-fm/references/README.md)。

## 测试与评测

各 Skill 的评测与自身方法一起维护：[业务发现](evidence-discovery/evals/README.md)、[正式 FM](evidence-fm/evals/README.md)、[软件需求](evidence-requirements/evals/README.md)。FM 同时包含[功能回归](evidence-fm/tests/README.md)与夹具，完整复制后仍可独立运行。

这些目录只在开发验证时按需使用，不是普通业务任务的必读材料。自动回归与人工行为评价分开，没有执行的评测不能记为通过。
