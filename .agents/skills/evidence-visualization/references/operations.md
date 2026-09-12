# 运行与故障排查

## 环境与安装资源

完整安装本 Skill，保留 `scripts/`、`assets/`、`references/` 和 `requirements.txt`；浏览器回归还需要 `tests/`。图形库已内置，不在生成或页面运行时下载。

生成器需要 Python 3.10+、PyYAML，以及实际调用的 `evidence-fm`／`fm-api-design` 各自声明的依赖。复用已经满足依赖的环境；若需要新环境，先说明安装需求，按项目授权创建 venv，不全局安装或修改用户环境。

本 Skill 的依赖文件只声明自身导入项，不复制下游 Skill 的依赖清单。通过资源发现定位真实安装目录；资源缺失时报告路径和错误。无需创建新的业务项目工具目录。

## 生成与刷新

```bash
"$PYTHON" -B "$VISUAL_SKILL_DIR/scripts/generate.py" \
  --project-root "$PROJECT_ROOT" --fm-skill "$FM_SKILL_DIR" \
  --api-skill "$API_SKILL_DIR"
```

输入位置为项目 `.evidence/fm/` 和可选 `.evidence/api/api.yaml`。产物为 `.evidence/views/index.html`；执行日志与输入摘要嵌入页面数据。校验和投影使用临时目录，不重写历史交付批次。

直接用浏览器打开输出文件，无需服务端或网络。离线页面是快照，修改输入后重新运行命令。它不能自行观察文件系统变化，也不会自动更新业务审核状态。

## 页面没有节点

1. 使用浏览器打开 HTML，而不是禁用脚本的编辑器预览。确认打开的是项目输出，不是 Skill 的模板 `assets/page.html`。
2. 若一直停留在加载提示，查看浏览器控制台或运行下方浏览器回归；保留原始错误，区分 CSP 拦截、脚本初始化异常和输入校验失败。
3. CSP 摘要必须匹配 HTML 内最终脚本，包括模板缩进和换行。修改生成器／资源后重新生成；不要移除安全策略或添加脚本 `unsafe-inline` 来绕过错误。
4. 不格式化生成 HTML。模板中的 `prettier-ignore` 保护内嵌块；项目若批量格式化，应在获得配置修改授权后将 `.evidence/views/` 排除。本 Skill 不自动修改项目格式化配置。
5. 重新生成后刷新页面，再验证最终文件。旧页面存在不代表当前输入已通过检查。

## 浏览器验证

```bash
node "$VISUAL_SKILL_DIR/tests/review-browser.mjs" "$PROJECT_ROOT/.evidence/views/index.html"
```

测试需要 Node.js 22+ 和已安装 Chrome。macOS 尝试标准 Chrome 路径；其他位置通过 `CHROME_BIN` 指定。缺少环境时报告未执行，不自动下载浏览器。

测试检查初始化、节点、各图层及适用交互，记录实际场景、接口、YAML 数量和 HTML SHA-256；无对应数据的场景、规则或 API 检查标记不适用，而不是虚构通过。外部网络请求和脚本错误导致失败。测试期间文件变化同样失败，防止把另一个版本当作受测产物。截图保存在系统临时目录，可用于检查可见画布和文字。

页面包含原始业务数据，应按与 YAML 相同的权限保管；不要上传公共服务，也不要为审核演示发送实际业务 API 请求。
