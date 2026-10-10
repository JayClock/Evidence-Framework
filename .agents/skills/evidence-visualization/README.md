# Evidence Visualization

离线只读业务对象工作台。使用入口见 [SKILL.md](SKILL.md)，展示契约见 [工作台设计](references/visual-review.md)，环境及故障处理见 [运行说明](references/operations.md)。

```text
evidence-visualization/
├── SKILL.md
├── scripts/generate.py
├── assets/workbench.html
├── assets/workbench.css
├── assets/workbench.js
├── assets/business-graph.js
├── references/
├── tests/
└── evals/
```

生成器使用 Python 标准库，调用已安装的 FM/API 正式 CLI。完整复制 Skill 即可复用，不向业务项目复制工具，不携带第三方页面实现。

在本仓库根运行：

```bash
node tools/python/python.mjs -B .agents/skills/evidence-visualization/scripts/generate.py \
  --project-root "$PWD" \
  --fm-skill "$PWD/.agents/skills/evidence-fm" \
  --api-skill "$PWD/.agents/skills/evidence-api-design"
node .agents/skills/evidence-visualization/tests/review-browser.mjs .evidence/views/index.html
```

首页用一张完整全局图展示全部凭证、参与者、角色及真实关系，按合同—请求—确认／证明组织位置，不以边界入口卡片代替对象。仅角色扮演保留箭头，先于语义移至详情；不显示流程列标题和图内统计；领域和合同使用上下文边界框，权责履约使用合约内结构框，仍在同一张画布上，外部玩家不移入消费方边界。支持简化／标准图、责任角标、缩放、原始大小和详情跳转；标准图只补充已声明的类型、时间字段与基数，属性、场景实例与 API 不成为主图节点。左侧仅业务结构、验证场景、API 三组，API 下为接口能力、接口资源、调用流程。独立参与者归入业务结构；场景凭证从场景进入，响应表示和实例绑定从接口进入，关系从图上连线或搜索进入。Context 作为左侧折叠组及图上边界；Fulfillment 作为合同内履约分组，不构成上下文，不重复列为对象，不提供详情和属性；上下文搜索、引用及图边界点击只定位展开分组，不切换当前正文。凭证、参与者和角色的详情仅保留名称、ID、所属上下文与业务属性；属性在所属对象内高亮定位，派生字段旁默认展示业务解释，CEL 与输入绑定收进可展开的“表达式与变量说明”，可跳到输入对象并返回字段；不再单列派生规则或提供完整规则按钮，其搜索和场景/API 引用统一定位目标字段，源文件、ID 与引用保留；没有派生引用时显示空态，不把判断规则当作字段计算。判断类规则、关系、场景和 API 保留专用详情与引用，全局搜索仍覆盖所有对象。图上分别展示证明角色与具体玩家，场景反例不误报为失败。HTML 不携带原始文件、路径、来源记录、执行命令或历史快照。

悬停对象可追踪一跳关联，上下文只高亮内部对象及连线，责任角标按角色处理；键盘焦点优先，移出／失焦恢复，不改变详情和关系语义。完整规则见工作台设计。

画布上方可展开图形图例，按业务对象、上下文边界、权责履约、连线说明符号，并使用当前模型的真实名称和责任角标作示例。未建模的类型不加入；原单画布保持不变。

开发检查与隔离安装测试见运行说明。`evals/evals.json` 是待执行的 Agent 行为评测，不是检查通过记录。
