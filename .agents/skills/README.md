# Evidence Skills

本仓库的 Evidence Skills 统一放在 `.agents/skills/`，使用 `evidence-<职责>` 命名，目录名与 frontmatter `name` 一致。项目行动从 [宪法](../../AGENTS.md)和 [Guides 导航](../../docs/guides/index.md)进入：宪法、项目基线、工程指南、当前任务按需加载。

Skill 保存可移植方法，项目文档保存实际范围与工程决定；不在两者复制业务知识或状态。交付采用外层 PDCA、内层 Guides → Action → Sensors → Steer。Guides 在开始、恢复、纠偏和来源变化时重新核对，不只是会话开头的一段提示词。

| Skill                                                     | 用途               | 输入与输出                                                                               | 运行依赖                                                       |
| --------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [evidence-modeling](evidence-modeling/SKILL.md)           | 显式组合建模入口   | 目标／已有记录 → 澄清、直接编辑当前模型、校验与差异交接                                  | 组合 Discovery 与 FM；界面扩展可选                             |
| [evidence-discovery](evidence-discovery/SKILL.md)         | 访谈与澄清         | 材料／具体缺口 → 原话、来源、工作理解、问题与控制状态                                    | 通用访谈只需对话和文件；FM 专业判断需读取 FM 参考              |
| [evidence-fm](evidence-fm/SKILL.md)                       | 建模准则与正式产物 | 充分材料／访谈记录 → 正式术语、源 JSON、验证场景与实际结果；不足则返回缺口               | 读取准则只需文本；执行校验需 Python 3.10+                      |
| [evidence-visualization](evidence-visualization/SKILL.md) | 离线可视化审核     | 当前 FM／已有 API → 关系图、时间线、规则追溯、接口矩阵与 JSON 原文                       | Python、可定位的 FM／API Skill；浏览器回归需 Node.js 与 Chrome |
| [evidence-requirements](evidence-requirements/SKILL.md)   | 收敛软件职责       | 充分材料或 FM → 范围、MVP、故事与验收                                                    | 对话与文本文件                                                 |
| [evidence-api-design](evidence-api-design/SKILL.md)       | 整体 API 设计      | 已确认 FM → HTTP 契约、OpenAPI、超媒体与消费者流程                                       | Python、可定位的 evidence-fm                                   |
| [evidence-task-planning](evidence-task-planning/SKILL.md) | 通用 FM 实施任务   | 任意 FM／可选 API → 模块化单体、业务模块边界、MyBatis XML 与 Jersey 子资源的可读任务计划 | Python 3.10+、PyYAML；不执行产品实现                           |
| [evidence-delivery](evidence-delivery/SKILL.md)           | 双层循环交付       | 任务 DAG → 当前任务实施、检查证据与转向                                                  | Python 3.10+、PyYAML、项目工具链                               |

## 安装

本仓库统一在 `.agents/skills/` 本地维护。支持该目录自动发现的宿主可直接加载，无需在本项目重复安装。需要安装到其他位置时，在仓库根目录执行：

```bash
npx skills@latest add ./.agents/skills --skill evidence-discovery
```

完整组合流程可选 `evidence-modeling`，并同时安装 `evidence-discovery` 与 `evidence-fm`；也可按需只安装单项或 `evidence-requirements`。需要离线审核页时安装 `evidence-visualization`，已有 API 时同时提供 `evidence-api-design`；保留生成器、assets 和浏览器测试，不需要向业务项目复制工具。安装器需要 Node.js 和网络；根据提示选择目标 Agent 与安装位置。

也可以把某个完整目录复制到宿主支持的位置，如目标项目的 `.agents/skills/evidence-discovery/`。保留 references，以及 FM 包的 scripts、schemas、requirements.txt；不能只复制 SKILL.md。已有同名目录时先比较和备份，不直接覆盖，也不要同时加载两个同名版本。

使用宿主原生 Skill 入口，或让 Agent 读取安装目录里的 SKILL.md。Discovery 单独安装可做通用访谈；专业 FM 访谈通过已安装的 FM 包或用户提供的路径只读获取准则，不假设兄弟目录，也不自动启动模型生成。缺少准则时说明限制，不能宣称完整专业审查。

FM 单独安装可消费充分材料生成模型；输入不足时返回具体缺口，不复制访谈机制。Requirements 仍可直接使用充分的外部材料。无需为了独立使用而在两个包中保留同一套建模知识。

## 使用示例

`evidence-modeling` 设置为仅用户显式调用；支持的宿主可使用 `/skill:evidence-modeling <目标>`。它只负责编排，通过资源发现定位专业 Skill，不假设兄弟目录，也不依赖界面扩展。

```text
用 evidence-discovery 梳理业务：客户手机号不是唯一身份，导入时经常误合。
今天先停止问答，只整理已有信息。
继续讨论，但先保留之前暂缓的期限问题。
用 evidence-fm 根据这份材料直接生成当前模型并校验，保留未知责任。
/skill:evidence-modeling 根据现有发现修改 .evidence/fm/，校验后展示实际差异。
用 evidence-requirements 收敛这份说明的软件范围，不需要先建 FM。
用 evidence-visualization 为当前 FM 和已有 API 生成离线审核页，不修改模型。
用 evidence-task-planning 根据 .evidence/fm/ 生成模块化单体 + MyBatis 的总索引和可读任务文件；有 API 时一并读取。明确业务模块公开接口、数据所有权和本地事务，通过程序计算工作单元、taskKey 和覆盖，不修改模型和业务代码。
```

可以顺序组合，也可以从已有成果直接进入某一步：

```text
业务材料 → Discovery 访谈 ← 只读 FM 建模准则
                    ↓ 用户明确要求生成／更新
充分材料 ─────────→ 直接编辑当前 FM → 校验／修正 → 展示差异
                    ↓ 必要业务依据仍缺失
                 返回具体缺口，由访谈承接
```

专业 Skill 不自动串联；只有用户显式调用 `evidence-modeling` 时才按当前意图组合。生成／修改请求授权本次范围内的直接编辑；普通回答或“停止”不授权修改模型。编辑成功与校验通过不等于业务批准，不自动进入 API、需求或开发。

## 文件交接

`evidence-modeling`、`evidence-discovery`、`evidence-fm`、`evidence-api-design` 和 `evidence-visualization` 的新产物默认统一放在项目根的 `.evidence/`。沿用已有文件与用户显式指定位置，不自动迁移；告知默认路径并按需创建：

```text
.evidence/
├── discovery.json        # 来源、原话、工作理解、问题与恢复点
├── questions.json        # 可选：需拆分时保存已提问题及回答
├── fm/                   # 当前模型、术语、说明、validation 与 generated
├── views/index.html      # 用户要求时生成的自包含离线只读审核页
├── api/
│   ├── api.yaml          # 唯一 API 设计源，位于 FM 根之外
│   └── generated/        # 当前投影、OpenAPI、样例、流程与 manifest；Git 管理历史
└── checks/
    ├── fm/               # 按需授权保存的 FM 检查记录
    └── api/              # 按需授权保存的 inspect/check 结果
```

各 Skill 只修改本次授权的文件，不自动批准。`evidence-requirements` 默认使用 `docs/requirements/scope.md` 和 `docs/requirements/stories.md`。`evidence-task-planning` 默认输出 `docs/plans/smart-domain/plan.yaml` 和 `review.html`：YAML 是机器可读的唯一计划记录，保存显式切片、编译 DAG/API 覆盖、任务 Guides/设计、状态、CHECK、证据与缺口；HTML 是可重建的离线只读审核投影。任务标题不参与 taskKey 或排序。实体和规则从任意 FM 提取，不包含项目专用案例。`evidence-delivery` 消费同一 `plan.yaml`，执行前核对授权/范围、业务与工程来源、前置新鲜度、设计边界、环境、CHECK 与退出条件。`next` 只提供结构候选，不证明语义就绪；FM/API 摘要不覆盖架构、规范、howto 或代码变化。真实结果写入任务 `observedEvidence`，状态只在同一任务的 `status` 维护，不从审核页反向更新。任务支持 implementation、verify、design、setup、manual。

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
- 机器结果不提升也不推断业务确认。

可对 [测试夹具](evidence-fm/tests/fixtures/README.md) 直接只读检查。需要修改或生成输出时，先复制到用户允许的工作目录；不要把夹具中的金额、时长和角色当作业务默认值。

更多模型规则和命令见 [FM 指南](evidence-fm/references/README.md)。

## 测试与评测

各 Skill 的评测与自身方法一起维护：[业务发现](evidence-discovery/evals/README.md)、[正式 FM](evidence-fm/evals/README.md)、[软件需求](evidence-requirements/evals/README.md)、[smart-domain 任务规划](evidence-task-planning/evals/README.md)。FM 同时包含[功能回归](evidence-fm/tests/README.md)与夹具，完整复制后仍可独立运行。

这些目录只在开发验证时按需使用，不是普通业务任务的必读材料。自动回归与人工行为评价分开，没有执行的评测不能记为通过。
