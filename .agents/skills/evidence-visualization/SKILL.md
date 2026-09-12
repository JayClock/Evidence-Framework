---
name: evidence-visualization
description: 将当前 FM 与已有 API 生成可离线打开的只读可视化审核页，展示业务关系图、场景时间线、规则追溯、接口矩阵及 YAML 原文。用户要求模型可视化、视觉展示、生成或更新审核页，以及排查审核页空白、没有节点时使用；不用于修改业务模型、设计接口或实现业务系统。
compatibility: Python 3.10+ 与 requirements.txt；需要可定位的 evidence-fm，已有 API 时还需 fm-api-design 及其依赖；浏览器回归需要 Node.js 22+ 和本机 Chrome。
---

# Evidence 可视化审核

这是 FM／API 的只读展示能力，不是新的模型、业务事实源或审核关卡。生成方法、输出界面与可复用提示词见 [可视化审核](references/visual-review.md)；空白页排查见 [运行与故障排查](references/operations.md)。

## 执行边界

- 只讨论展示方式时给建议，不写文件；普通建模或 API 设计结束后不自动生成视图。
- 用户要求生成／更新页面时，使用本 Skill 自带生成器，不在项目中重新实现或复制一套工具。
- 读取项目约定和当前文件。默认输入是 `.evidence/fm/` 和可选的 `.evidence/api/api.yaml`；输出是 `.evidence/views/index.html`。已有布局不自动迁移；当前生成器不支持的布局应说明限制，不为展示移动业务文件。
- 通过宿主资源发现或用户提供的绝对路径定位本 Skill、`evidence-fm` 和需要时的 `fm-api-design`，不假设它们互为兄弟目录。项目根与安装目录分别传入。
- 资源或依赖缺失时说明执行限制，不把环境问题改写成业务问题，不自动安装软件。FM 不通过时报告真实错误，不修改事实、规则或场景预期来取得成功。
- 没有 API 时只生成 FM 视图，不创建接口、合同或确认凭证；纯领域模型不补造履约场景。
- 不修改 FM／API 源 YAML、历史 generated／checks、业务审核状态或宿主拥有的 `state.json`、审批和运行记录；项目权限仍优先。页面含原始业务数据，不上传或对外部署。

## 生成

设置实际路径及满足依赖的 Python，不使用示例机器上的环境路径：

```bash
"$PYTHON" -B "$VISUAL_SKILL_DIR/scripts/generate.py" \
  --project-root "$PROJECT_ROOT" \
  --fm-skill "$FM_SKILL_DIR" \
  --api-skill "$API_SKILL_DIR"
```

没有 API 文件时可以省略 `--api-skill`。两个依赖参数未提供时，CLI 只尝试项目 `.agents/skills/` 下的同名包；不要把该便利默认值当作安装发现机制。

生成器调用正式 CLI 重新校验、编译模型、构建追溯和时间线、运行适用场景；有 API 时重新生成投影。临时结果在 views 内隔离并清理；前后核对摘要，只原子替换带本工具标记的 HTML。失败保留旧页面，旧页面不代表当前输入有效。

## 视觉语义

页面首先服务于业务沟通，再逐层展开模型细节：

- 默认使用简化业务图，沿 Evidence 责任链阅读，并保留当前责任直接关联的 Party、Thing 与 Role；标准建模图展开全局 Participant、Role、类型时间和关系基数，完整对象图只用于排查。简化不等于删除三类核心元素。
- 使用固定的 FM 图例：Evidence、Participant、Role 分别采用 `#ef5b78`、`#70a17b`、`#d58a00` 的视觉强调，Context 使用虚线边界。色彩必须同时配合名称、类型和形状，不能成为模型分类依据或唯一语义。
- Evidence 卡片显示业务名称、`<rfp|proposal|contract|request|confirmation|evidence>` 以及相应时间类型；不把签署、确认和回调到达混成同一个时刻。
- 合同与履约视图按 Contract → Fulfillment → Request／Confirmation 展开，显示责任角色、完成／违约规则和未声明项；缺少确认用空位表达，不创建假凭证。
- 上下文地图按角色扮演、证明依赖、业务对象引用和凭证先后保留跨边界语义，不只显示无意义的连线总数。
- 变化点只展示模型已经声明的 `businessPatterns`；没有模式时明确“尚未提取”，不由页面自动推导或提升状态。

## 验证与交接

1. 生成成功后，对最终落盘文件执行浏览器回归，而不是只检查 JS 对象或生成前模板：

   ```bash
   node "$VISUAL_SKILL_DIR/tests/review-browser.mjs" "$PROJECT_ROOT/.evidence/views/index.html"
   ```

   非默认 Chrome 路径通过 `CHROME_BIN` 指定。缺少浏览器或 Node 时照实说明未执行，不能声称页面已实际显示。

2. 检查节点及画布、筛选、场景、规则、接口和 YAML 原文；适用项按实际数据验证。没有场景或 API 时明确不适用。确认无脚本错误、无外部请求，查看截图；保留受测 HTML 的摘要。
3. CSP 摘要覆盖完整内联脚本，包括模板空白。不要手改或格式化生成 HTML；内嵌资源的 `prettier-ignore` 是保护措施，不是允许改写脚本的授权。修改 Skill 资源后重新生成并复测，不关闭 CSP 来掩盖空白问题。
4. 提供输出路径、实际检查结果及绝对路径形式的重新生成命令后停止。快照不能自动感知后续 YAML 变化；机器检查不是业务批准，也不是实际 API 运行验证。
