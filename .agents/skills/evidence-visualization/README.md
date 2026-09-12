# Evidence Visualization Skill

把当前 FM 与已有 API 生成为自包含离线审核页。业务使用从 [SKILL.md](SKILL.md) 进入；生成方法及可复用提示词见 [可视化审核](references/visual-review.md)，空白页排查见 [运行说明](references/operations.md)。

```text
evidence-visualization/
├── SKILL.md
├── requirements.txt
├── scripts/generate.py
├── assets/                 # 页面模板、CSS、JS、固定版本图形库
├── references/             # 方法与运行说明
├── tests/                  # 可随包复制的生成和浏览器回归
└── evals/                  # 行为评测用例；不是已执行结论
```

完整复制或安装此目录即可复用，不需要业务项目中的工具实现。定位 `evidence-fm`，有 API 时还需 `fm-api-design`，通过绝对路径传入，不要求兄弟目录。业务 YAML 与输出留在目标项目，不写 Skill 安装目录。

## 本仓库生成示例

在项目根设置满足依赖的 `PYTHON`：

```bash
VISUAL_SKILL_DIR="$PWD/.agents/skills/evidence-visualization"
"$PYTHON" -B "$VISUAL_SKILL_DIR/scripts/generate.py" \
  --project-root "$PWD" \
  --fm-skill "$PWD/.agents/skills/evidence-fm" \
  --api-skill "$PWD/.agents/skills/fm-api-design"
```

然后用浏览器打开 `.evidence/views/index.html`。不手改或格式化输出；修改资源后重新生成。

## 开发验证

```bash
"$PYTHON" -B -m unittest discover -s "$VISUAL_SKILL_DIR/tests" -v
node "$VISUAL_SKILL_DIR/tests/review-browser.mjs" "$PROJECT_ROOT/.evidence/views/index.html"
```

单元测试可从任意工作目录运行，不依赖仓库外的文件。浏览器测试适应实际输入的范围；环境要求、截图位置与错误处理见运行说明。迁移到独立安装位置后的生成验证由仓库 `tests/skills/test_portable_skills.py` 维护。

图形库为 Cytoscape.js 3.33.1，保留 [MIT 许可证](assets/vendor/LICENSE.cytoscape) 及 [版本信息](assets/vendor/README.md)。第三方压缩资源不手改。
