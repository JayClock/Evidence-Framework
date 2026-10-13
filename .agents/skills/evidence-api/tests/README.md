# API 功能回归

本目录随独立 `evidence-api` 分发。API 引擎、Schema、HTTP 契约、覆盖及消费者流程由本包维护；FM 实现不复制到本包。通过 `EVIDENCE_FM_SKILL` 指定独立 FM 包的绝对路径，测试在本仓库可使用相邻 FM 包，运行 CLI 不假设此布局。

使用满足两包 requirements.txt 的 Python 3.10+：

```bash
EVIDENCE_FM_SKILL="$FM_SKILL_DIR" "$PYTHON" -B -m unittest discover -s "$API_SKILL_DIR/tests" -v
EVIDENCE_FM_SKILL="$FM_SKILL_DIR" "$PYTHON" -B -m unittest discover -s "$API_SKILL_DIR/tests/portability" -v
```

回归覆盖统一 API 源、全部对象与场景、角色玩家、业务资源、基数、HTTP 契约、静态消费者接续、OpenAPI、失败退出码、输入不变性和原子发布。FM 交接回归禁止重复运行检查器、编译校验或模拟，并拒绝失败或过期结果。

[商品采购基线](../examples/full-lifecycle/README.md)由本包唯一维护，订阅 FM 夹具消费已安装 FM 包的样例。只在临时副本制造反例，不倒改规则或预期来通过测试。portability 不设 `__init__.py`，单独运行非相邻安装、无维护材料的真实 CLI、缺失依赖和只读边界。

程序回归不是 Agent 行为评测、服务运行验收或业务批准；[行为评测](../evals/README.md)未执行时保持未执行。
