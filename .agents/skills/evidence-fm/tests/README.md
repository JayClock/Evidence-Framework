# FM 功能回归

本目录的测试和回归 fixtures 与本 Skill 一起维护；可运行正向模型唯一维护在 [表达样例](../examples/README.md)，测试直接消费，修改输入时只改临时副本。测试从自身位置加载包内 scripts、schemas、examples 和 evals，不依赖原仓库布局或调用目录。

先使用满足本包 requirements.txt 的 Python 3.10+ 环境，将 SKILL_DIR 设为本包绝对路径：

```bash
"$PYTHON" -B -m unittest discover -s "$SKILL_DIR/tests" -v
"$PYTHON" -B -m unittest discover -s "$SKILL_DIR/tests/portability" -v
```

`portability/` 单独验证复制安装、只读检查和评测准备；不设 `__init__.py`，复制后的顶层回归不递归执行安装测试。两套命令均需运行，仓库聚合命令也覆盖独立 `evidence-api` 的测试与安装回归。

覆盖业务属性命名、六类凭证时间、领域／合同前／混合上下文、同一合同内多个 Request 共用 Confirmation、CEL、追溯、编译、单据模拟及评分器正反例。context_samples.py 和 fixtures 都是合成数据，不提供真实业务默认值。测试使用临时模型，不覆盖业务源文件。API、HTTP 契约、覆盖、FM 结果交接及原子发布回归归独立的 `evidence-api`。

[评测指南](../evals/README.md) 说明完整模型生成与行为评价。自动回归验证实现及评分逻辑，不调用 Agent，不代表真实生成质量或人工批准。改实现与测试时保留有依据的预期，不能为通过校验倒改业务规则。
