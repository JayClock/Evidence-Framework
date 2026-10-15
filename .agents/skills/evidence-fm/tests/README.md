# FM 功能回归

本目录的测试和回归 fixtures 与本 Skill 一起维护；可运行正向模型唯一维护在 [表达样例](../examples/README.md)，测试直接消费，修改输入时只改临时副本。测试从自身位置加载包内 scripts、schemas、examples 和测试夹具，不依赖原仓库布局或调用目录。

先使用满足本包 requirements.txt 的 Python 3.10+ 环境，将 SKILL_DIR 设为本包绝对路径：

```bash
"$PYTHON" -B -m unittest discover -s "$SKILL_DIR/tests" -v
"$PYTHON" -B -m unittest discover -s "$SKILL_DIR/tests/portability" -v
```

`portability/` 单独验证复制安装和只读检查；不设 `__init__.py`，复制后的顶层回归不递归执行安装测试。两套命令均需运行，仓库聚合命令也覆盖独立 `evidence-api` 的测试与安装回归。

`test_context_content.py` 覆盖三类空上下文的一致性拒绝、真实内容尚不完整的合法保存、根对象的类型与归属、全图空壳不能因范围选择而豁免，以及只读和编译失败不改写产物。

`test_request_confirmation_growth.py` 覆盖空履约及缺端一致性错误、请求连同直接合同关联先存、独立确认先存、配对后补规则、确认角色与普通支撑证明的区分、未包裹交互阻塞全合同范围及旧版本拒绝；同合同共享确认继续由原回归保护。静态结构通过不证明真实访谈中先发现后包裹。

`test_request_contract_binding.py` 覆盖已包裹及未包裹请求从首次保存起必须直接引用所属根合同；反向、错误类型、错误合同、间接凭证链、兄弟请求均不能替代；同时核对补充证明可以并存、缺关联是错误而非完整性缺口、CLI 失败及只读不变性。旧版本检查不能被 FM/API 当作当前范围结果。

覆盖业务属性命名、六类凭证时间、领域／合同前／混合上下文、同一合同内多个 Request 共用 Confirmation、一次 Request 的部分结果与不同 Confirmation 类型、Markdown 完整 JSON 示例的 Schema、CEL、追溯、编译及单据模拟正反例。context_samples.py 和 fixtures 都是合成数据，不提供真实业务默认值。测试使用临时模型，不覆盖业务源文件。API、HTTP 契约、覆盖、FM 结果交接及原子发布回归归独立的 `evidence-api`。

正式表达的回归由 `test_expression_contract.py` 负责：从实际 Schema 构建示例校验，检查文档的 Schema、校验函数与源样例链接，实际编译所链接模型，并以反例区分单对象结构、跨对象一致性和范围完整性。四份表达参考不嵌入 JSON 定义，新增 Schema 必须进入结构导航；测试不复制字段清单，也不锁定方法正文的具体措辞。业务分析边界和统一语言分别由 `test_analysis_boundaries.py` 与 `test_model_language.py` 覆盖，运行行为测试继续验证原有契约。

自动回归验证实现，不调用 Agent，不代表真实生成质量或人工批准。改实现与测试时保留有依据的预期，不能为通过校验倒改业务规则。
