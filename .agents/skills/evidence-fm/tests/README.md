# FM 功能回归

本目录的测试、合成样例和 fixtures 与本 Skill 一起维护。测试从自身位置加载包内 scripts、schemas 和 evals，不依赖原仓库布局或调用目录。

先使用满足本包 requirements.txt 的 Python 3.10+ 环境，将 SKILL_DIR 设为本包绝对路径：

```bash
"$PYTHON" -B -m unittest discover -s "$SKILL_DIR/tests" -v
```

覆盖业务属性命名、六类凭证时间、领域／渠道／混合上下文、CEL、追溯、编译、单据模拟及评分器正反例。context_samples.py 和 fixtures 都是合成数据，不提供真实业务默认值。测试使用临时模型，不覆盖业务源文件。

[评测指南](../evals/README.md) 说明完整模型生成与行为评价。自动回归验证实现及评分逻辑，不调用 Agent，不代表真实生成质量或人工批准。改实现与测试时保留有依据的预期，不能为通过校验倒改业务规则。
