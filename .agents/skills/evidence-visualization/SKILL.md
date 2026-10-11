---
name: evidence-visualization
description: 当用户要求查看 FM 与已有 API、生成或更新离线审核页、排查业务对象工作台显示故障时使用。不设计业务 UI，不修改模型或接口设计，不把页面生成视为业务批准。
compatibility: Python 3.10+、可定位且满足依赖的 evidence-fm；存在 API 时需要 evidence-api-design；浏览器验证需要 Node.js 22+ 与本机 Chrome。
date: 2026-10-10 09:37:45
updated: 2026-10-11 18:07:24
---

# Evidence 离线业务工作台

用本包生成器把当前业务源投影为可阅读页面，不向业务项目复制工具，不手工拼装另一套视图。

## Guides

确认本次是讨论、只读检查、页面生成还是工具维护。讨论与只读检查不写项目文件；生成仅授权更新 `.evidence/views/index.html`。工具源码修改须有独立维护授权，不能借展示故障改写 FM/API。

读取当前 `.evidence/fm/` 和可选 `.evidence/api/api.json`，定位本包及 FM/API Skill 的实际路径，确认 Python 和浏览器环境。联合审核必须有 API；独立 FM 可视化允许没有 API，不隐藏或删除已有 API 来绕过检查。

按任务选择参考：

- 环境准备、执行失败或页面加载故障：读 [运行说明](references/operations.md)。
- 实现维护或视觉评审：读 [展示契约](references/visual-review.md)，再定位相关源码和测试；普通重新生成无需加载完整 UI 规范。

页面只承载白名单业务投影，不带原始文件、文件路径、访谈、材料来源、执行命令、输入摘要或 Git 历史；业务 ID 与正式引用仍须保留。业务定义和场景数据不因此成为匿名数据，不上传、部署或发送业务 API 请求。

## Action

设置实际绝对路径，执行生成器：

```bash
"$PYTHON" -B "$VISUAL_SKILL_DIR/scripts/generate.py" \
  --project-root "$PROJECT_ROOT" \
  --fm-skill "$FM_SKILL_DIR" \
  --api-skill "$API_SKILL_DIR"
```

没有 API 的独立 FM 页面可省略 `--api-skill`；联合审核在命令末尾增加 `--require-api`。生成器重新检查两源、适用场景和输入新鲜度，临时投影不重写正式 generated 目录，只原子替换自己拥有的页面。

生成或排错都不补造业务结构、权限、确认凭证或流程。显示规则由展示契约与实现负责，不因单份模型的布局问题修改业务源。

## Sensors

对最终落盘 HTML 执行浏览器回归：

```bash
node "$VISUAL_SKILL_DIR/tests/review-browser.mjs" "$PROJECT_ROOT/.evidence/views/index.html"
```

非默认浏览器用 `CHROME_BIN` 指定。检查真实日志、HTML 摘要和截图，确认对象／引用完整、交互可读、无脚本错误或外部请求、检查期间文件未变；专项覆盖与命令见运行说明。无适用场景或 API 时说明不适用，缺少环境时说明未执行。

机器校验、页面检查、业务批准与运行时接口验证分开。输出路径存在不证明当前源已通过，浏览器断言也不能替代截图可读性评审。

## Steer

- 两源失败或输入变化：停止，保留旧页并明示它不是当前有效证据；稳定后重新生成。
- 输出不属于本生成器、环境缺失或权限不足：停止并交接，不自动覆盖、安装或删除。
- 页面故障：按运行说明定位生成与资源问题；不手改或格式化生成 HTML，不关闭 CSP。修复工具需授权，修后重新生成并复验。
- 完成：交接 HTML 路径、实际检查、未执行项及使用绝对路径的重生成命令后停止。页面是快照，不是批准或计划状态；不修改业务来源、历史证据或 Git。
